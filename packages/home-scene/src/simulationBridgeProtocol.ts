import { DEVICES, getDevice, isPositionDevice } from './data';
import { validateStoredSetting } from './deviceCapabilities';
import type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';

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
  | { type: 'patch'; requestId: number; changes: SimulationChanges }
);
export interface SimulationSnapshotMessage extends SimulationEnvelope {
  type: 'snapshot';
  acknowledgedRequestId?: number;
  state: SimulationSnapshot;
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
function readDeviceState(id: string, value: unknown): DeviceState | null {
  const device = getDevice(id);
  if (!device || !isRecord(value) || !hasKeys(value, ['on', 'level'], ['settings']) || typeof value.on !== 'boolean' || typeof value.level !== 'number' || !Number.isFinite(value.level) || value.level < 0 || value.level > 100) return null;
  if (isPositionDevice(device) && value.on !== (value.level > 0)) return null;
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
function readChanges(value: unknown, complete: boolean): SimulationChanges | null {
  if (!isRecord(value) || !hasKeys(value, complete ? ['deviceStates', 'lightingMode', 'night', 'motionDisabled'] : [], ['deviceStates', 'lightingMode', 'night', 'motionDisabled'])) return null;
  const changes: SimulationChanges = {};
  if (Object.hasOwn(value, 'deviceStates')) {
    if (!isRecord(value.deviceStates) || (complete && Object.keys(value.deviceStates).length !== DEVICES.length)) return null;
    changes.deviceStates = {};
    for (const [id, candidate] of Object.entries(value.deviceStates)) {
      const state = readDeviceState(id, candidate);
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
  if (message.type !== 'patch' || !hasKeys(message, ['channel', 'version', 'type', 'requestId', 'changes']) || !isRequestId(message.requestId)) return null;
  const changes = readChanges(message.changes, false);
  if (!changes || !Object.keys(changes).length) return null;
  return { channel: SIMULATION_CHANNEL, version: 1, type: 'patch', requestId: message.requestId, changes };
}

/** Parse only complete host snapshots, preventing partial hydration or an arbitrary host payload. */
export function parseSimulationSnapshotMessage(input: unknown): SimulationSnapshotMessage | null {
  const message = readEnvelope(input);
  if (!message || message.type !== 'snapshot' || !hasKeys(message, ['channel', 'version', 'type', 'state'], ['acknowledgedRequestId'])) return null;
  if (Object.hasOwn(message, 'acknowledgedRequestId') && !isRequestId(message.acknowledgedRequestId)) return null;
  const state = readChanges(message.state, true) as SimulationSnapshot | null;
  if (!state) return null;
  return { channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state, ...(message.acknowledgedRequestId === undefined ? {} : { acknowledgedRequestId: message.acknowledgedRequestId as number }) };
}

/** Produce independent defaults for persistence and the browser store without loading a renderer. */
export function createDefaultSimulationSnapshot(): SimulationSnapshot {
  return {
    deviceStates: Object.fromEntries(DEVICES.map((device) => [device.id, { on: isPositionDevice(device) ? device.defaultLevel > 0 : device.defaultOn, level: device.defaultLevel }])),
    lightingMode: 'auto', night: false, motionDisabled: false,
  };
}

/** Merge a validated transaction while retaining every device and preference it did not mention. */
export function mergeSimulationChanges(state: SimulationSnapshot, changes: SimulationChanges): SimulationSnapshot {
  return { ...state, ...changes, deviceStates: changes.deviceStates ? { ...state.deviceStates, ...changes.deviceStates } : state.deviceStates };
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
