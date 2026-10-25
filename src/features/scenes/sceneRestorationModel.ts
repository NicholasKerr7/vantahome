import { DEVICES, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { DEVICE_KINDS, getCapabilities, readDeviceSetting, validateStoredSetting, type DeviceKind } from '../../../packages/home-scene/src/deviceCapabilities';
import type { DeviceState, SettingValue, SimulationChanges, SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';

/** Only reversible comfort preferences qualify; schedules, microphones and safety never do. */
const RESTORABLE_SETTINGS: Partial<Record<DeviceKind, readonly string[]>> = {
  light: ['brightness', 'color', 'colorTempK', 'lightColorMode', 'lightEffect', 'adaptiveLighting', 'motionBoost', 'nightShift'],
  ac: ['tempC', 'mode', 'acFanSpeed', 'acSwingMode', 'acEcoMode', 'acTurboMode', 'acQuietMode', 'acTargetHumidity'],
  fan: ['speed', 'fanOscillation', 'fanDirection', 'fanLightOn', 'fanAutoMode', 'fanSleepMode'],
  tv: ['volume', 'muted', 'source', 'channel', 'playbackState'],
  speaker: ['volume', 'muted', 'speakerSource', 'speakerPreset', 'bass', 'treble', 'spatialAudio', 'partyMode', 'nightMode', 'shuffle', 'repeat', 'playbackState'],
  blinds: ['openPercent'],
};
const MAX_RECEIPT_LENGTH = 96 * 1024;
const MAX_DEVICES = 128;

export interface SceneRestorationDescriptor {
  identityKey: string;
  runId: string;
  sceneId: string;
  sceneName: string;
  createdAt: number;
}
export type SceneReceiptDescriptor = SceneRestorationDescriptor;
export interface SceneRestorationField {
  field: string;
  /** Null restores an absent setting, retaining the catalog's default semantics. */
  before: SettingValue | null;
  after: SettingValue | null;
}
export interface SceneRestorationDevice {
  deviceId: string;
  kind: DeviceKind;
  changes: SceneRestorationField[];
  afterFingerprint: string | null;
  eligible: boolean;
}
type SceneAppearance = Pick<SimulationSnapshot, 'lightingMode' | 'night'>;
export interface SceneRestorationReceipt extends SceneRestorationDescriptor {
  version: 1;
  revision: number;
  devices: SceneRestorationDevice[];
  appearance: { before: SceneAppearance; after: SceneAppearance; eligible: boolean } | null;
}
export interface SceneRestorationPlan {
  changes: SimulationChanges;
  restorable: { deviceId: string; fields: string[] }[];
  skipped: { deviceId: string; reason: 'unsupported' | 'changed' | 'unavailable' }[];
  appearance: 'restore' | 'changed' | null;
}

/** Reject arrays and exotic prototypes before reading persisted receipt fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Bound identifiers and labels without treating their contents as commands or routes. */
function boundedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Reject undocumented fields rather than silently granting new restoration capabilities. */
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Ensure a caller cannot create an unbounded or identity-free restoration transaction. */
function validDescriptor(value: Record<string, unknown>): boolean {
  return boundedText(value.identityKey, 1024) && boundedText(value.runId, 160) && boundedText(value.sceneId, 256)
    && boundedText(value.sceneName, 160) && Number.isSafeInteger(value.createdAt) && Number(value.createdAt) >= 0;
}

/** Stable ordering makes equality insensitive to how settings were inserted into an object. */
export function sceneDeviceFingerprint(state: DeviceState): string {
  return JSON.stringify({ on: state.on, level: state.level,
    settings: Object.fromEntries(Object.entries(state.settings ?? {}).sort(([left], [right]) => left.localeCompare(right))) });
}

/** Native projection may materialize defaults without changing what a device does.
 * Treat only absent/default-equivalent fields as equal; explicit edits and opaque
 * activity markers still disqualify the device, even when its power is off.
 */
function matchesSceneState(state: DeviceState, device: SceneRestorationDevice, catalog: readonly DeviceDefinition[]): boolean {
  if (!device.afterFingerprint) return false;
  if (sceneDeviceFingerprint(state) === device.afterFingerprint) return true;
  const definition = catalog.find((entry) => entry.id === device.deviceId && entry.kind === device.kind);
  if (!definition) return false;
  const expected = parseFingerprint(device.afterFingerprint, device.kind);
  if (!expected || state.on !== expected.on || state.level !== expected.level) return false;
  const keys = new Set([...Object.keys(expected.settings ?? {}), ...Object.keys(state.settings ?? {})]);
  for (const field of keys) {
    const before = expected.settings?.[field]; const current = state.settings?.[field];
    if (before === current) continue;
    if (before !== undefined && current !== undefined) return false;
    if (!getCapabilities(device.kind).some((entry) => 'field' in entry && entry.field === field)) return false;
    const absent = before === undefined ? expected : state;
    if (readDeviceSetting(definition, absent, field) !== (before ?? current)) return false;
  }
  return true;
}

/** Read a reversible field without resolving absent settings into fabricated stored values. */
function fieldValue(state: DeviceState, field: string): SettingValue | null {
  if (field === 'on') return state.on;
  if (field === 'level') return state.level;
  return state.settings?.[field.slice('settings.'.length)] ?? null;
}

/** Explicitly allow comfort fields only; an added catalog capability is never automatically undoable. */
function allowedFields(kind: DeviceKind): string[] {
  const settings = RESTORABLE_SETTINGS[kind];
  return settings ? ['on', 'level', ...settings.map((field) => `settings.${field}`)] : [];
}

/** Validate values with the existing setting schema, including a safe absence sentinel. */
function validFieldValue(kind: DeviceKind, field: string, value: unknown): value is SettingValue | null {
  if (field === 'on') return typeof value === 'boolean';
  if (field === 'level') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  if (value === null) return true;
  return value !== undefined && validateStoredSetting(kind, field.slice('settings.'.length), value) === value;
}

/** Read only actual scene changes, retaining unsupported device IDs for an honest review. */
export function createSceneRestorationReceipt(descriptor: SceneRestorationDescriptor, before: SimulationSnapshot,
  after: SimulationSnapshot, catalog: readonly DeviceDefinition[] = DEVICES): SceneRestorationReceipt {
  if (!validDescriptor({ ...descriptor })) throw new Error('This scene cannot create a valid restoration record.');
  const devices: SceneRestorationDevice[] = [];
  for (const definition of catalog) {
    const previous = before.deviceStates[definition.id]; const next = after.deviceStates[definition.id];
    if (!previous || !next || sceneDeviceFingerprint(previous) === sceneDeviceFingerprint(next)) continue;
    const changes = allowedFields(definition.kind).flatMap((field): SceneRestorationField[] => {
      const beforeValue = fieldValue(previous, field); const afterValue = fieldValue(next, field);
      return beforeValue === afterValue ? [] : [{ field, before: beforeValue, after: afterValue }];
    });
    devices.push({ deviceId: definition.id, kind: definition.kind, changes,
      afterFingerprint: changes.length ? sceneDeviceFingerprint(next) : null, eligible: changes.length > 0 });
  }
  const appearanceChanged = before.lightingMode !== after.lightingMode || before.night !== after.night;
  const receipt: SceneRestorationReceipt = { ...descriptor, version: 1, revision: 1, devices,
    appearance: appearanceChanged ? { before: { lightingMode: before.lightingMode, night: before.night },
      after: { lightingMode: after.lightingMode, night: after.night }, eligible: true } : null };
  // Validation also bounds future catalog growth and before-values captured from callers.
  const validated = parseSceneRestorationReceipt(receipt, after, catalog);
  if (!validated) throw new Error('This scene cannot create a valid restoration record.');
  return validated;
}

/** Confirm the after-state fingerprint is a bounded, valid comfort state, not an arbitrary payload. */
function parseFingerprint(value: unknown, kind: DeviceKind): DeviceState | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const state: unknown = JSON.parse(value);
    if (!isRecord(state) || !exactKeys(state, ['on', 'level', 'settings']) || typeof state.on !== 'boolean'
      || !validFieldValue(kind, 'level', state.level) || !isRecord(state.settings)) return null;
    if (kind === 'blinds' && state.on !== (Number(state.level) > 0)) return null;
    for (const [key, candidate] of Object.entries(state.settings)) {
      if (candidate === undefined || validateStoredSetting(kind, key, candidate) !== candidate) return null;
    }
    const result = state as unknown as DeviceState;
    return sceneDeviceFingerprint(result) === value ? result : null;
  } catch { return null; }
}

/** Validate appearance independently from motion, weather, selection and camera preferences. */
function parseAppearance(value: unknown): SceneAppearance | null {
  if (!isRecord(value) || !exactKeys(value, ['lightingMode', 'night']) || typeof value.night !== 'boolean'
    || !['auto', 'day', 'night'].includes(String(value.lightingMode))) return null;
  return { lightingMode: value.lightingMode as SceneAppearance['lightingMode'], night: value.night };
}

/** Read host-only metadata; malformed receipts disable undo while leaving canonical devices readable. */
export function parseSceneRestorationReceipt(input: unknown, snapshot: SimulationSnapshot,
  catalog: readonly DeviceDefinition[] = DEVICES): SceneRestorationReceipt | null {
  try {
    const serialized = JSON.stringify(input);
    if (!serialized || serialized.length > MAX_RECEIPT_LENGTH) return null;
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || !exactKeys(value, ['version', 'identityKey', 'runId', 'sceneId', 'sceneName', 'createdAt', 'revision', 'devices', 'appearance'])
      || value.version !== 1 || !validDescriptor(value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
      || !Array.isArray(value.devices) || value.devices.length > MAX_DEVICES) return null;
    const seen = new Set<string>(); const devices: SceneRestorationDevice[] = [];
    for (const candidate of value.devices) {
      if (!isRecord(candidate) || !exactKeys(candidate, ['deviceId', 'kind', 'changes', 'afterFingerprint', 'eligible'])
        || !boundedText(candidate.deviceId, 160) || seen.has(candidate.deviceId)
        || !(DEVICE_KINDS as readonly unknown[]).includes(candidate.kind) || typeof candidate.eligible !== 'boolean'
        || !Array.isArray(candidate.changes) || candidate.changes.length > 32) return null;
      seen.add(candidate.deviceId);
      const definition = catalog.find((device) => device.id === candidate.deviceId);
      if (!definition || definition.kind !== candidate.kind) return null;
      const fields = allowedFields(definition.kind); const changed = new Set<string>(); const changes: SceneRestorationField[] = [];
      const fingerprint = candidate.afterFingerprint === null ? null : parseFingerprint(candidate.afterFingerprint, definition.kind);
      if (candidate.afterFingerprint !== null && !fingerprint) return null;
      for (const change of candidate.changes) {
        if (!isRecord(change) || !exactKeys(change, ['field', 'before', 'after']) || typeof change.field !== 'string'
          || !fields.includes(change.field) || changed.has(change.field) || change.before === change.after
          || !validFieldValue(definition.kind, change.field, change.before) || !validFieldValue(definition.kind, change.field, change.after)
          || !fingerprint || fieldValue(fingerprint, change.field) !== change.after) return null;
        changed.add(change.field); changes.push({ field: change.field, before: change.before, after: change.after });
      }
      if ((!changes.length && (candidate.eligible || candidate.afterFingerprint !== null)) || (changes.length && !fingerprint)) return null;
      if (fingerprint && !parseFingerprint(sceneDeviceFingerprint(restoreDeviceFields(fingerprint, changes)), definition.kind)) return null;
      devices.push({ deviceId: definition.id, kind: definition.kind, changes,
        afterFingerprint: candidate.afterFingerprint as string | null, eligible: candidate.eligible });
    }
    let appearance: SceneRestorationReceipt['appearance'] = null;
    if (value.appearance !== null) {
      if (!isRecord(value.appearance) || !exactKeys(value.appearance, ['before', 'after', 'eligible']) || typeof value.appearance.eligible !== 'boolean') return null;
      const before = parseAppearance(value.appearance.before); const after = parseAppearance(value.appearance.after);
      if (!before || !after || (before.lightingMode === after.lightingMode && before.night === after.night)) return null;
      appearance = { before, after, eligible: value.appearance.eligible };
    }
    const receipt: SceneRestorationReceipt = { version: 1, identityKey: value.identityKey as string, runId: value.runId as string,
      sceneId: value.sceneId as string, sceneName: value.sceneName as string, createdAt: value.createdAt as number,
      revision: value.revision as number, devices, appearance };
    return invalidateChangedSceneRestoration(receipt, snapshot, catalog);
  } catch { return null; }
}

/** An edit permanently disqualifies its device, including a later return to the old value (ABA). */
export function invalidateChangedSceneRestoration(receipt: SceneRestorationReceipt, snapshot: SimulationSnapshot,
  catalog: readonly DeviceDefinition[] = DEVICES): SceneRestorationReceipt {
  let changed = false;
  const devices = receipt.devices.map((device) => {
    const state = snapshot.deviceStates[device.deviceId];
    if (!device.eligible || (state && matchesSceneState(state, device, catalog))) return device;
    changed = true; return { ...device, eligible: false };
  });
  let appearance = receipt.appearance;
  if (appearance?.eligible && (snapshot.lightingMode !== appearance.after.lightingMode || snapshot.night !== appearance.after.night)) {
    appearance = { ...appearance, eligible: false }; changed = true;
  }
  return changed ? { ...receipt, devices, appearance } : receipt;
}

/** Apply only captured safe fields, preserving every unrelated setting and telemetry value. */
function restoreDeviceFields(current: DeviceState, changes: readonly SceneRestorationField[]): DeviceState {
  const next: DeviceState = { ...current }; const settings = { ...current.settings };
  for (const change of changes) {
    if (change.field === 'on') next.on = change.before as boolean;
    else if (change.field === 'level') next.level = change.before as number;
    else if (change.before === null) delete settings[change.field.slice('settings.'.length)];
    else settings[change.field.slice('settings.'.length)] = change.before;
  }
  if (Object.keys(settings).length) next.settings = settings;
  else delete next.settings;
  return next;
}

/** Build a review from current permissions and state; an old receipt never overrides later choices. */
export function buildSceneRestorationPlan(receipt: SceneRestorationReceipt, snapshot: SimulationSnapshot,
  allowedModelIds: ReadonlySet<string> | readonly string[]): SceneRestorationPlan {
  const allowed = new Set(allowedModelIds); const changes: SimulationChanges = {};
  const restorable: SceneRestorationPlan['restorable'] = []; const skipped: SceneRestorationPlan['skipped'] = [];
  const deviceStates: SimulationSnapshot['deviceStates'] = {};
  for (const device of receipt.devices) {
    const state = snapshot.deviceStates[device.deviceId];
    const reason = !state || !allowed.has(device.deviceId) ? 'unavailable' : !device.changes.length ? 'unsupported'
      : !device.eligible || !matchesSceneState(state, device, DEVICES) ? 'changed' : null;
    if (reason) { skipped.push({ deviceId: device.deviceId, reason }); continue; }
    deviceStates[device.deviceId] = restoreDeviceFields(state, device.changes);
    restorable.push({ deviceId: device.deviceId, fields: device.changes.map((change) => change.field) });
  }
  if (restorable.length) changes.deviceStates = deviceStates;
  let appearance: SceneRestorationPlan['appearance'] = null;
  if (receipt.appearance) {
    const restore = receipt.appearance.eligible && snapshot.lightingMode === receipt.appearance.after.lightingMode && snapshot.night === receipt.appearance.after.night;
    appearance = restore ? 'restore' : 'changed';
    if (restore) { changes.lightingMode = receipt.appearance.before.lightingMode; changes.night = receipt.appearance.before.night; }
  }
  return { changes, restorable, skipped, appearance };
}

/** Restore reviewed comfort values directly; never invoke action reducers or safety side effects. */
export function applySceneRestoration(receipt: SceneRestorationReceipt, snapshot: SimulationSnapshot,
  allowedModelIds: ReadonlySet<string> | readonly string[]): SimulationSnapshot {
  const { changes } = buildSceneRestorationPlan(receipt, snapshot, allowedModelIds);
  if (!Object.keys(changes).length) return snapshot;
  return { ...snapshot, ...changes, deviceStates: changes.deviceStates ? { ...snapshot.deviceStates, ...changes.deviceStates } : snapshot.deviceStates };
}
