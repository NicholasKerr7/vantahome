import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState, SettingValue } from './simulationTypes';
import { readVacuumActivity, vacuumActivityLabel, type VacuumActivity } from './vacuumActivity';

/** These options retain the existing catalog's saved cleaning preferences. */
export const VACUUM_MODE_OPTIONS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Spot', value: 'spot' },
  { label: 'Edge', value: 'edge' },
  { label: 'Room', value: 'room' },
] as const;
export const VACUUM_SUCTION_BOUNDS = { min: 0, max: 100, step: 10 } as const;
export type VacuumMode = typeof VACUUM_MODE_OPTIONS[number]['value'];
export type { VacuumActivity } from './vacuumActivity';

const VACUUM_ACTIONS = {
  start: 'vacuum-start',
  pause: 'vacuum-pause',
  dock: 'vacuum-dock',
  suctionUp: 'vacuum-suction-up',
  suctionDown: 'vacuum-suction-down',
} as const;
export type VacuumControllerKey = keyof typeof VACUUM_ACTIONS;

/** Activity is accepted simulation state; measurements remain independent sample values. */
export interface VacuumControllerState {
  readonly on: boolean;
  readonly activity: VacuumActivity;
  readonly status: string;
  readonly batteryPercent: number | null;
  readonly mode: VacuumMode;
  readonly suction: number;
  readonly mop: boolean;
  readonly quiet: boolean;
  readonly binFull: boolean | null;
  readonly brushDirty: boolean | null;
  readonly filterLifePercent: number | null;
  readonly areaM2: number | null;
  readonly runtimeMin: number | null;
}

/** Resolve existing activity commands and relative suction commands by their stable IDs. */
export function vacuumControllerActionId(key: VacuumControllerKey): typeof VACUUM_ACTIONS[VacuumControllerKey] {
  return VACUUM_ACTIONS[key];
}

/** Combine explicit maintenance sample flags without treating unknown readings as healthy. */
export function vacuumMaintenanceSummary(vacuum: Pick<VacuumControllerState, 'binFull' | 'brushDirty' | 'filterLifePercent'>): string | null {
  const notices: string[] = [];
  if (vacuum.binFull === true) notices.push('Empty bin');
  if (vacuum.brushDirty === true) notices.push('Clean brush');
  const filterLife = vacuum.filterLifePercent;
  if (typeof filterLife === 'number' && Number.isFinite(filterLife) && filterLife >= 0 && filterLife <= 20) notices.push('Check filter');
  return notices.length ? notices.join(' · ') : null;
}

/** Reject malformed telemetry rather than presenting an invented healthy or charged reading. */
function readSample(device: DeviceDefinition, state: DeviceState, field: string, maximum = Infinity): number | null {
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

/** Maintenance samples must be boolean; missing catalog samples retain their established defaults. */
function readBooleanSample(device: DeviceDefinition, state: DeviceState, field: string): boolean | null {
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'boolean' ? value : null;
}

/** Apply the catalog's bounds and known defaults to saved control preferences. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  const value = readDeviceSetting(device, state, field);
  return (capability && validateSetting(capability, value))
    ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Project only the selected vacuum without a cleaning path, progress clock or battery simulation. */
export function readVacuumControllerState(device: DeviceDefinition, state: DeviceState): VacuumControllerState | null {
  if (device.kind !== 'vacuum') return null;
  const preferredMode = readPreference(device, state, 'vacuumMode');
  return {
    on: state.on,
    activity: readVacuumActivity(state),
    status: vacuumActivityLabel(state),
    batteryPercent: readSample(device, state, 'battery', 100),
    mode: VACUUM_MODE_OPTIONS.find((option) => option.value === preferredMode)?.value ?? 'auto',
    suction: Number(readPreference(device, state, 'vacuumSuction')),
    mop: readPreference(device, state, 'vacuumMop') === true,
    quiet: readPreference(device, state, 'vacuumQuietMode') === true,
    binFull: readBooleanSample(device, state, 'vacuumBinFull'),
    brushDirty: readBooleanSample(device, state, 'vacuumBrushDirty'),
    filterLifePercent: readSample(device, state, 'vacuumFilterLife', 100),
    areaM2: readSample(device, state, 'vacuumAreaM2'),
    runtimeMin: readSample(device, state, 'vacuumRuntimeMin'),
  };
}
