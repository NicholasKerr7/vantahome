import manifest from './house-manifest.json';
import type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';

export type FireCommand = 'test-alarm' | 'simulate-co' | 'silence' | 'clear-alarm' | 'acknowledge' | 'reset';
export const FIRE_RESET_VERSION_MAX = 999999;
export const FIRE_DEFAULTS: Record<string, SettingValue> = {
  smokeDetected: false, coDetected: false, smokeSilenced: false,
  fireIncidentActive: false, fireIncidentAcknowledged: false, fireResetVersion: 0,
};
export interface FireIncidentSource {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  smokeDetected: boolean;
  coDetected: boolean;
}
export interface FireIncident {
  active: boolean;
  acknowledged: boolean;
  sources: FireIncidentSource[];
  activeSources: FireIncidentSource[];
  canReset: boolean;
}

// Import the manifest directly: device capability catalogs also import this module.
const sensors = manifest.devices.filter((device) => device.kind === 'smoke');
const roomNames = new Map(manifest.rooms.map((room) => [room.id, room.name]));

/** Require explicit booleans so missing or malformed sample values cannot invent alarms. */
function flag(state: DeviceState | undefined, field: string): boolean {
  return state?.settings?.[field] === true;
}

/** Read only bounded reset generations; legacy snapshots start at generation zero. */
function resetVersion(state: DeviceState | undefined): number {
  const value = state?.settings?.fireResetVersion;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= FIRE_RESET_VERSION_MAX ? value : 0;
}

/** Treat either sample signal as a source, independently from silence and acknowledgment. */
function sourceActive(state: DeviceState | undefined): boolean {
  return flag(state, 'smokeDetected') || flag(state, 'coDetected');
}

/** Preserve object identity for idempotent synchronization and leave unrelated settings intact. */
function patchSensor(state: DeviceState, values: Record<string, SettingValue>): DeviceState {
  if (state.on && Object.entries(values).every(([field, value]) => state.settings?.[field] === value)) return state;
  return { ...state, on: true, settings: { ...state.settings, ...values } };
}

/** Describe the local incident using known sensors, retaining cleared sources until explicit reset. */
export function getFireIncident(states: DeviceStates): FireIncident {
  const sources = sensors.flatMap((sensor): FireIncidentSource[] => {
    const state = states[sensor.id];
    if (!state || (!sourceActive(state) && !flag(state, 'fireIncidentActive'))) return [];
    return [{ id: sensor.id, name: sensor.name, roomId: sensor.roomId,
      roomName: roomNames.get(sensor.roomId) ?? sensor.roomId,
      smokeDetected: flag(state, 'smokeDetected'), coDetected: flag(state, 'coDetected') }];
  });
  const activeSources = sources.filter((source) => source.smokeDetected || source.coDetected);
  const active = sources.length > 0;
  return { active, sources, activeSources,
    acknowledged: active && sources.every((source) => flag(states[source.id], 'fireIncidentAcknowledged')),
    canReset: active && activeSources.length === 0 };
}

/** Latch local alarms across patches; a newer explicit reset can clear only an entirely clear incident. */
export function synchronizeFireSafety(states: DeviceStates, previousStates?: DeviceStates): DeviceStates {
  const allSourcesClear = !sensors.some((sensor) => sourceActive(states[sensor.id]));
  const resetRequested = previousStates !== undefined && sensors.some(({ id }) =>
    (flag(previousStates[id], 'fireIncidentActive') || sourceActive(previousStates[id])) &&
    resetVersion(states[id]) > resetVersion(previousStates[id]));
  const resetAllowed = resetRequested && allSourcesClear;
  let next = states;
  for (const { id } of sensors) {
    const current = states[id];
    if (!current) continue;
    const previous = previousStates?.[id];
    const detected = sourceActive(current);
    const newlyDetected = detected && (!flag(current, 'fireIncidentActive') || (previous !== undefined &&
      ((!flag(previous, 'smokeDetected') && flag(current, 'smokeDetected')) ||
       (!flag(previous, 'coDetected') && flag(current, 'coDetected')))));
    const latched = !resetAllowed && (detected || flag(current, 'fireIncidentActive') || flag(previous, 'fireIncidentActive'));
    const values: Record<string, SettingValue> = {
      fireIncidentActive: latched,
      fireIncidentAcknowledged: latched && !newlyDetected && flag(current, 'fireIncidentAcknowledged'),
      fireResetVersion: Math.max(resetVersion(current), resetVersion(previous)),
    };
    if (newlyDetected || resetAllowed) values.smokeSilenced = false;
    // No default fields are added to idle legacy sensors until a safety operation needs them.
    if (!latched && !resetAllowed && !flag(current, 'fireIncidentAcknowledged') &&
      current.settings?.fireIncidentActive === undefined && current.settings?.fireResetVersion === undefined) continue;
    const updated = patchSensor(current, values);
    if (updated === current) continue;
    if (next === states) next = { ...states };
    next[id] = updated;
  }
  return next;
}

/** Apply explicit sample readings while preventing ordinary settings from dismissing an incident. */
export function applyFireSetting(current: DeviceState, field: string, value: unknown): DeviceState {
  if (!['smokeDetected', 'coDetected', 'smokeSilenced'].includes(field) || typeof value !== 'boolean') return current;
  const values: Record<string, SettingValue> = { [field]: value };
  if ((field === 'smokeDetected' || field === 'coDetected') && value) {
    values.fireIncidentActive = true;
    if (!flag(current, field)) {
      values.fireIncidentAcknowledged = false;
      values.smokeSilenced = false;
    }
  }
  return patchSensor(current, values);
}

/** Run only local sensor scenarios; reset requests remain subject to whole-incident synchronization. */
export function applyFireCommand(current: DeviceState, command: FireCommand): DeviceState {
  if (command === 'test-alarm' || command === 'simulate-co') {
    return patchSensor(current, {
      [command === 'test-alarm' ? 'smokeDetected' : 'coDetected']: true,
      fireIncidentActive: true, fireIncidentAcknowledged: false, smokeSilenced: false,
    });
  }
  if (command === 'silence') return patchSensor(current, { smokeSilenced: sourceActive(current) || flag(current, 'fireIncidentActive') });
  if (command === 'clear-alarm') return patchSensor(current, { smokeDetected: false, coDetected: false });
  if (command === 'acknowledge') {
    return sourceActive(current) || flag(current, 'fireIncidentActive')
      ? patchSensor(current, { fireIncidentActive: true, fireIncidentAcknowledged: true }) : current;
  }
  if (command === 'reset' && !sourceActive(current) && flag(current, 'fireIncidentActive') && resetVersion(current) < FIRE_RESET_VERSION_MAX) {
    return patchSensor(current, { fireIncidentActive: false, fireIncidentAcknowledged: false,
      smokeSilenced: false, fireResetVersion: resetVersion(current) + 1 });
  }
  return current;
}

/** Apply one sensor-only operation without introducing missing devices or touching other equipment. */
function mapIncidentSensors(states: DeviceStates, command: FireCommand): DeviceStates {
  let next = states;
  for (const { id } of getFireIncident(states).sources) {
    const updated = applyFireCommand(states[id], command);
    if (updated === states[id]) continue;
    if (next === states) next = { ...states };
    next[id] = updated;
  }
  return next;
}

/** Acknowledge the complete visible incident without clearing readings, silencing, or releasing holds. */
export function acknowledgeFireIncident(states: DeviceStates): DeviceStates {
  return mapIncidentSensors(synchronizeFireSafety(states), 'acknowledge');
}

/** Clear only simulated smoke/CO sources; the incident remains latched until the separate reset. */
export function clearSimulatedFireSources(states: DeviceStates): DeviceStates {
  return mapIncidentSensors(synchronizeFireSafety(states), 'clear-alarm');
}

/** Reset a clear incident atomically and carry bounded generation intent through browser/native bridges. */
export function resetFireIncident(states: DeviceStates): DeviceStates {
  const incident = getFireIncident(states);
  if (!incident.canReset || incident.sources.some(({ id }) => resetVersion(states[id]) >= FIRE_RESET_VERSION_MAX)) return states;
  return synchronizeFireSafety(mapIncidentSensors(states, 'reset'), states);
}
