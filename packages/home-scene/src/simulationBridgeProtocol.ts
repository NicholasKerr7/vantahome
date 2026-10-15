import { GATE_DEVICE_ID } from './gateSafetySimulation';
import { restoreSafetySimulation, synchronizeSafetySimulation } from './safetySimulation';
import { AUTHORED_DEVICES, DEVICES, getDevice, isPositionDevice, type DeviceDefinition } from './data';
import { buildRuntimeDeviceDefinitions, parseRuntimePlacedDevices, type RuntimePlacedDevice } from './devicePlacement';
import { validateStoredSetting } from './deviceCapabilities';
import { GAS_DEVICE_IDS, isGasDevice } from './gasSimulation';
import type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';
import { parseSceneAccess, type SceneAccess } from './sceneAccess';

export type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';
export const SIMULATION_CHANNEL = 'vantahome-simulation';
export const MAX_SIMULATION_MESSAGE_LENGTH = 80 * 1024;

export interface SimulationSnapshot {
  deviceStates: DeviceStates;
  lightingMode: 'auto' | 'day' | 'night';
  night: boolean;
  motionDisabled: boolean;
}
/** Each included device replaces only that device; omitted devices and preferences are retained. */
export type SimulationChanges = Partial<SimulationSnapshot>;
interface SimulationEnvelope { channel: typeof SIMULATION_CHANNEL; version: 1 }
export type SimulationRequest = SimulationEnvelope & (
  | { type: 'request' }
  | { type: 'patch'; requestId: number; base: SimulationChanges; changes: SimulationChanges }
);
export interface SimulationSnapshotMessage extends SimulationEnvelope {
  type: 'snapshot';
  acknowledgedRequestId?: number;
  state: SimulationSnapshot;
  /** Host-resolved visibility; persisted simulation state never grants access. */
  access?: SceneAccess;
  /** Curated simulation fixtures only; never an asset URL, real binding or permission grant. */
  placements?: RuntimePlacedDevice[];
}

/** Reject non-records, including arrays, before accessing nested bridge data. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Require precisely the documented properties so the bridge cannot acquire extra capabilities. */
function hasKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

/** Bound both native JSON strings and structured web messages before validating their shape. */
function readEnvelope(input: unknown): Record<string, unknown> | null {
  try {
    const serialized = typeof input === 'string' ? input : JSON.stringify(input);
    if (!serialized || serialized.length > MAX_SIMULATION_MESSAGE_LENGTH) return null;
    const value: unknown = JSON.parse(serialized);
    return isRecord(value) && value.channel === SIMULATION_CHANNEL && value.version === 1 ? value : null;
  } catch { return null; }
}

/** Allow only positive, losslessly represented request identifiers. */
function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Validate one scene device without admitting telemetry, URLs, arbitrary fields or physical commands. */
function readDeviceState(id: string, value: unknown, devices: readonly DeviceDefinition[] = DEVICES): DeviceState | null {
  const device = devices.find((entry) => entry.id === id);
  if (!device || !isRecord(value) || !hasKeys(value, ['on', 'level'], ['settings']) || typeof value.on !== 'boolean' || typeof value.level !== 'number' || !Number.isFinite(value.level) || value.level < 0 || value.level > 100) return null;
  if (isPositionDevice(device) && value.on !== (value.level > 0)) return null;
  if (isGasDevice(device.kind) && !value.on) return null;
  const state: DeviceState = { on: value.on, level: value.level };
  if (Object.hasOwn(value, 'settings')) {
    if (!isRecord(value.settings)) return null;
    const settings: Record<string, SettingValue> = {};
    for (const [field, candidate] of Object.entries(value.settings)) {
      const accepted = validateStoredSetting(device.kind, field, candidate);
      if (accepted === undefined || accepted !== candidate) return null;
      settings[field] = candidate as SettingValue;
    }
    state.settings = settings;
  }
  return state;
}

/** Validate a complete snapshot or a sparse transaction using the exact same catalog boundary. */
function readChanges(value: unknown, complete: boolean, devices: readonly DeviceDefinition[] = DEVICES): SimulationChanges | null {
  if (!isRecord(value) || !hasKeys(value, complete ? ['deviceStates', 'lightingMode', 'night', 'motionDisabled'] : [], ['deviceStates', 'lightingMode', 'night', 'motionDisabled'])) return null;
  const changes: SimulationChanges = {};
  if (Object.hasOwn(value, 'deviceStates')) {
    if (!isRecord(value.deviceStates) || (complete && Object.keys(value.deviceStates).length !== devices.length)) return null;
    changes.deviceStates = {};
    for (const [id, candidate] of Object.entries(value.deviceStates)) {
      const state = readDeviceState(id, candidate, devices);
      if (!state) return null;
      changes.deviceStates[id] = state;
    }
  }
  if (Object.hasOwn(value, 'lightingMode')) {
    if (value.lightingMode !== 'auto' && value.lightingMode !== 'day' && value.lightingMode !== 'night') return null;
    changes.lightingMode = value.lightingMode;
  }
  for (const field of ['night', 'motionDisabled'] as const) {
    if (!Object.hasOwn(value, field)) continue;
    if (typeof value[field] !== 'boolean') return null;
    changes[field] = value[field];
  }
  return changes;
}

/** Parse the scene's two supported intents; neither can reach account or real-device services. */
export function parseSimulationRequest(input: unknown): SimulationRequest | null {
  const message = readEnvelope(input);
  if (!message) return null;
  if (message.type === 'request' && hasKeys(message, ['channel', 'version', 'type'])) return { channel: SIMULATION_CHANNEL, version: 1, type: 'request' };
  if (message.type !== 'patch' || !hasKeys(message, ['channel', 'version', 'type', 'requestId', 'base', 'changes']) || !isRequestId(message.requestId)) return null;
  const changes = readChanges(message.changes, false);
  const base = readChanges(message.base, false);
  if (!changes || !base || !Object.keys(changes).length) return null;
  // A baseline contains precisely the edited fields/devices, never a second hidden payload.
  if (!hasKeys(base as Record<string, unknown>, Object.keys(changes))
    || !hasKeys(base.deviceStates ?? {}, Object.keys(changes.deviceStates ?? {}))) return null;
  return { channel: SIMULATION_CHANNEL, version: 1, type: 'patch', requestId: message.requestId, base, changes };
}

/** Parse only complete host snapshots, preventing partial hydration or an arbitrary host payload. */
export function parseSimulationSnapshotMessage(input: unknown): SimulationSnapshotMessage | null {
  const message = readEnvelope(input);
  if (!message || message.type !== 'snapshot' || !hasKeys(message, ['channel', 'version', 'type', 'state'], ['acknowledgedRequestId', 'access', 'placements'])) return null;
  if (Object.hasOwn(message, 'acknowledgedRequestId') && !isRequestId(message.acknowledgedRequestId)) return null;
  const placements = Object.hasOwn(message, 'placements') ? parseRuntimePlacedDevices(message.placements) : undefined;
  if (placements === null) return null;
  const devices = [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(placements ?? [])];
  const state = readChanges(message.state, true, devices) as SimulationSnapshot | null;
  if (!state) return null;
  const access = Object.hasOwn(message, 'access') ? parseSceneAccess(message.access, devices) : undefined;
  if (access === null) return null;
  return { channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state,
    ...(placements === undefined ? {} : { placements }),
    ...(access === undefined ? {} : { access }),
    ...(message.acknowledgedRequestId === undefined ? {} : { acknowledgedRequestId: message.acknowledgedRequestId as number }) };
}

/** Migrate only pre-gas local caches; live bridge snapshots still require the complete catalog. */
export function parseStoredSimulationSnapshotMessage(input: unknown): SimulationSnapshotMessage | null {
  const current = parseSimulationSnapshotMessage(input);
  if (current) return { ...current, state: { ...current.state, deviceStates: restoreSafetySimulation(current.state.deviceStates) } };
  const envelope = readEnvelope(input);
  if (!envelope || envelope.type !== 'snapshot' || !isRecord(envelope.state) || !isRecord(envelope.state.deviceStates)) return null;
  const previous = envelope.state.deviceStates;
  const addedIds: readonly string[] = Object.values(GAS_DEVICE_IDS);
  const placements = Object.hasOwn(envelope, 'placements') ? parseRuntimePlacedDevices(envelope.placements) : [];
  if (!placements) return null;
  const catalog = [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(placements)];
  const missing = catalog.filter((device) => !Object.hasOwn(previous, device.id));
  if (!missing.length || missing.some((device) => !addedIds.includes(device.id))) return null;
  const defaults = createDefaultSimulationSnapshot().deviceStates;
  const deviceStates = { ...previous, ...Object.fromEntries(missing.map((device) => [device.id, defaults[device.id]])) };
  const migrated = parseSimulationSnapshotMessage({ ...envelope, state: { ...envelope.state, deviceStates } });
  return migrated ? { ...migrated, state: { ...migrated.state, deviceStates: restoreSafetySimulation(migrated.state.deviceStates) } } : null;
}

/** Produce independent defaults for persistence and the browser store without loading a renderer. */
export function createDefaultSimulationSnapshot(): SimulationSnapshot {
  return {
    deviceStates: Object.fromEntries(DEVICES.map((device) => [device.id, { on: isPositionDevice(device) ? device.defaultLevel > 0 : device.defaultOn, level: device.defaultLevel }])),
    lightingMode: 'auto', night: false, motionDisabled: false,
  };
}

/** Reconcile a validated saved state with today's active registry without resetting existing devices. */
export function reconcileSimulationSnapshot(snapshot: SimulationSnapshot): SimulationSnapshot {
  const defaults = createDefaultSimulationSnapshot();
  const deviceStates = Object.fromEntries(DEVICES.map((device) => [device.id,
    readDeviceState(device.id, snapshot.deviceStates[device.id]) ?? defaults.deviceStates[device.id],
  ]));
  return JSON.stringify(deviceStates) === JSON.stringify(snapshot.deviceStates) ? snapshot : { ...snapshot, deviceStates };
}

/** Merge a validated transaction while retaining every device and preference it did not mention. */
export function mergeSimulationChanges(state: SimulationSnapshot, changes: SimulationChanges): SimulationSnapshot {
  const deviceStates = changes.deviceStates ? { ...state.deviceStates, ...changes.deviceStates } : state.deviceStates;
  return { ...state, ...changes, deviceStates: synchronizeSafetySimulation(deviceStates, state.deviceStates) };
}

/** Extract only changed simulation fields; camera, selection and notices never leave the scene. */
export function diffSimulationSnapshots(previous: SimulationSnapshot, next: SimulationSnapshot): SimulationChanges {
  const changes: SimulationChanges = {};
  if (previous.deviceStates !== next.deviceStates) {
    const devices: DeviceStates = {};
    for (const device of DEVICES) {
      const before = previous.deviceStates[device.id];
      const after = next.deviceStates[device.id];
      if (before !== after && JSON.stringify(before) !== JSON.stringify(after)) devices[device.id] = after;
    }
    if (Object.keys(devices).length) changes.deviceStates = devices;
  }
  for (const field of ['lightingMode', 'night', 'motionDisabled'] as const) {
    if (previous[field] !== next[field]) Object.assign(changes, { [field]: next[field] });
  }
  return changes;
}

/** Capture only the sender values needed to distinguish intentional edits from stale fields. */
export function simulationChangeBaseline(state: SimulationSnapshot, changes: SimulationChanges): SimulationChanges {
  const base: SimulationChanges = {};
  if (changes.deviceStates) base.deviceStates = Object.fromEntries(Object.keys(changes.deviceStates).map((id) => [id, state.deviceStates[id]]));
  for (const field of ['lightingMode', 'night', 'motionDisabled'] as const) {
    if (Object.hasOwn(changes, field)) Object.assign(base, { [field]: state[field] });
  }
  return base;
}

/** Reapply only fields changed by this sender, preserving independent newer host or renderer edits. */
export function rebaseSimulationChanges(current: SimulationSnapshot, base: SimulationChanges, changes: SimulationChanges): SimulationSnapshot {
  const rebased: SimulationChanges = { ...changes };
  if (changes.deviceStates) {
    rebased.deviceStates = {};
    for (const [id, submitted] of Object.entries(changes.deviceStates)) {
      const before = base.deviceStates?.[id];
      const latest = current.deviceStates[id];
      if (!before || !latest) continue;
      // An in-flight tick or command cannot resume movement interrupted after its baseline.
      if (id === GATE_DEVICE_ID && latest.settings?.gatePhase === 'paused' && before.settings?.gatePhase !== 'paused') continue;
      const next = { ...latest };
      if (submitted.on !== before.on) next.on = submitted.on;
      if (submitted.level !== before.level) next.level = submitted.level;
      if (isPositionDevice(getDevice(id)!)) next.on = next.level > 0;
      const settings = { ...latest.settings };
      for (const key of new Set([...Object.keys(before.settings ?? {}), ...Object.keys(submitted.settings ?? {})])) {
        if (submitted.settings?.[key] === before.settings?.[key]) continue;
        if (submitted.settings?.[key] === undefined) delete settings[key];
        else settings[key] = submitted.settings[key];
      }
      if (Object.keys(settings).length) next.settings = settings;
      else delete next.settings;
      rebased.deviceStates[id] = next;
    }
  }
  return mergeSimulationChanges(current, rebased);
}
