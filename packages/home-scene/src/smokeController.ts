import type { DeviceDefinition } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';
import { canControlSceneDevice, type SceneAccess } from './sceneAccess';
import { FIRE_PREVIEW_LIGHT_IDS } from './safetySimulation';
import { GATE_DEVICE_ID } from './gateSafetySimulation';

export const SMOKE_PREVIEW_NOTE = 'Simulation only · no physical detection or emergency response';
export interface SmokeControllerState {
  smokeDetected: boolean | null;
  coDetected: boolean | null;
  incidentActive: boolean | null;
  acknowledged: boolean | null;
  silenced: boolean | null;
  sampleChecked: boolean | null;
  batteryPercent: number | null;
  sensorStatus: 'ok' | 'warning' | 'error' | null;
  tone: 'alarm' | 'warning' | 'unknown' | 'standby';
  status: string;
}

/** Use catalog defaults for absent readings only; explicit malformed samples stay unknown. */
function preference(device: DeviceDefinition, state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field) ? state.settings[field] : readDeviceSetting(device, state, field);
}

/** Require actual booleans rather than interpreting strings as clear or acknowledged. */
function flag(device: DeviceDefinition, state: DeviceState, field: string): boolean | null {
  const value = preference(device, state, field);
  return typeof value === 'boolean' ? value : null;
}

/** Alarm scenarios affect preview lights and the gate, so require their grants before presenting the action. */
export function canRunSmokeScenarios(access: SceneAccess | undefined, deviceId: string): boolean {
  return Boolean(access && [deviceId, GATE_DEVICE_ID, ...FIRE_PREVIEW_LIGHT_IDS].every((id) => canControlSceneDevice(access, id)));
}

/** Describe one sensor without treating a sample check, silence or acknowledgment as clearance. */
export function readSmokeControllerState(device: DeviceDefinition, state: DeviceState): SmokeControllerState | null {
  if (device.kind !== 'smoke') return null;
  const smokeDetected = flag(device, state, 'smokeDetected');
  const coDetected = flag(device, state, 'coDetected');
  const incidentActive = flag(device, state, 'fireIncidentActive');
  const acknowledged = flag(device, state, 'fireIncidentAcknowledged');
  const silenced = flag(device, state, 'smokeSilenced');
  const battery = preference(device, state, 'smokeBattery');
  const condition = preference(device, state, 'smokeSensorStatus');
  const sensorStatus = condition === 'ok' || condition === 'warning' || condition === 'error' ? condition : null;
  const sampleChecked = state.settings && Object.hasOwn(state.settings, 'sampleChecked')
    ? typeof state.settings.sampleChecked === 'boolean' ? state.settings.sampleChecked : null : false;
  const sourceActive = smokeDetected === true || coDetected === true;
  const unknownSource = smokeDetected === null || coDetected === null || incidentActive === null;
  const tone = sourceActive || incidentActive === true ? 'alarm' : unknownSource || sensorStatus === null ? 'unknown' : sensorStatus !== 'ok' ? 'warning' : 'standby';
  const status = sourceActive ? smokeDetected === true && coDetected === true ? 'Smoke + CO simulation active'
    : smokeDetected === true ? 'Smoke simulation active' : 'CO simulation active'
    : incidentActive === true ? unknownSource ? 'Incident latched · source unavailable' : 'Sources clear · reset pending'
      : unknownSource ? 'Alarm sample unavailable' : sensorStatus === 'warning' || sensorStatus === 'error' ? 'Sensor sample needs attention'
        : sensorStatus === null ? 'Sensor condition unavailable' : 'No alarm in this sample';
  return { smokeDetected, coDetected, incidentActive, acknowledged, silenced, sampleChecked,
    batteryPercent: typeof battery === 'number' && Number.isFinite(battery) && battery >= 0 && battery <= 100 ? battery : null,
    sensorStatus, tone, status };
}

/** Keep inactive, active and unavailable samples distinct in compact readouts. */
export function smokeSampleLabel(value: boolean | null): string {
  return value === null ? 'Unavailable' : value ? 'Detected' : 'Clear';
}
