import { getDevice, type DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import { isLaundryKind, laundryActivityLabel, readLaundryActivity, type LaundryActivity, type LaundryKind } from './laundryActivity';
import type { DeviceState, SettingValue } from './simulationTypes';

/** Existing allowlisted programs are saved preferences; selecting one never starts a machine. */
export const LAUNDRY_CYCLE_OPTIONS = {
  washer: [
    { label: 'Normal', value: 'Normal' }, { label: 'Quick', value: 'Quick' },
    { label: 'Delicate', value: 'Delicate' }, { label: 'Bedding', value: 'Bedding' }, { label: 'Eco', value: 'Eco' },
  ],
  dryer: [
    { label: 'Normal', value: 'Normal' }, { label: 'Quick', value: 'Quick' },
    { label: 'Delicate', value: 'Delicate' }, { label: 'Bedding', value: 'Bedding' },
    { label: 'Towels', value: 'Towels' }, { label: 'Air Fluff', value: 'Air Fluff' },
  ],
} as const;
export const WASHER_TEMPERATURE_OPTIONS = [
  { label: 'Cold', value: 'Cold' }, { label: 'Warm', value: 'Warm' }, { label: 'Hot', value: 'Hot' },
] as const;
export const WASHER_SPIN_OPTIONS = [
  { label: '800 rpm', value: 800 }, { label: '1000 rpm', value: 1000 }, { label: '1200 rpm', value: 1200 },
] as const;
export const DRYER_HEAT_OPTIONS = [
  { label: 'Low', value: 'Low' }, { label: 'Med', value: 'Med' }, { label: 'High', value: 'High' },
] as const;
export const DRYER_DRYNESS_OPTIONS = [
  { label: 'Damp', value: 'Damp' }, { label: 'Dry', value: 'Dry' }, { label: 'Extra', value: 'Extra' },
] as const;
export type { LaundryActivity, LaundryKind } from './laundryActivity';
export type LaundryControllerKey = 'start' | 'pause' | 'stop';

/** One selected machine's activity, saved controls and independent sample readings. */
export interface LaundryControllerState {
  readonly kind: LaundryKind;
  readonly on: boolean;
  readonly activity: LaundryActivity;
  readonly status: string;
  readonly cycle: string;
  readonly washTemp: typeof WASHER_TEMPERATURE_OPTIONS[number]['value'] | null;
  readonly spinSpeedRpm: typeof WASHER_SPIN_OPTIONS[number]['value'] | null;
  readonly heatLevel: typeof DRYER_HEAT_OPTIONS[number]['value'] | null;
  readonly drynessLevel: typeof DRYER_DRYNESS_OPTIONS[number]['value'] | null;
  readonly remainingMin: number | null;
  readonly progressPercent: number | null;
  readonly lintFilterOk: boolean | null;
}

/** Commands always target the selected machine; no paired-machine action is created. */
export function laundryControllerActionId(kind: LaundryKind, key: LaundryControllerKey): `${LaundryKind}-${LaundryControllerKey}` {
  return `${kind}-${key}`;
}

/** Recognize the authored stack only while its independent devices still share actual stacked geometry. */
export function readLaundryInstallation(device: DeviceDefinition): 'stacked' | 'single' {
  if ((device.id !== 'laundry-washer' || device.kind !== 'washer') && (device.id !== 'laundry-dryer' || device.kind !== 'dryer')) return 'single';
  const washer = device.kind === 'washer' ? device : getDevice('laundry-washer');
  const dryer = device.kind === 'dryer' ? device : getDevice('laundry-dryer');
  if (!washer || !dryer || washer.roomId !== dryer.roomId) return 'single';
  const gap = dryer.position[1] - washer.position[1] - washer.dimensions[1];
  const aligned = Math.abs(washer.position[0] - dryer.position[0]) <= 0.05
    && Math.abs(washer.position[2] - dryer.position[2]) <= 0.05
    && Math.abs(washer.rotation[1] - dryer.rotation[1]) <= 0.05
    && Math.abs(washer.dimensions[0] - dryer.dimensions[0]) <= 0.1
    && Math.abs(washer.dimensions[2] - dryer.dimensions[2]) <= 0.1;
  return aligned && gap >= 0 && gap <= 0.15 ? 'stacked' : 'single';
}

/** Resolve malformed saved preferences through the existing catalog's valid default. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  return (capability && validateSetting(capability, readDeviceSetting(device, state, field)))
    ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Samples remain visibly unknown when malformed rather than becoming a fabricated completion. */
function readSample(device: DeviceDefinition, state: DeviceState, field: string, maximum: number): number | null {
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

/** Project a selected washer or dryer without a timer, linked action or inferred cycle phase. */
export function readLaundryControllerState(device: DeviceDefinition, state: DeviceState): LaundryControllerState | null {
  if (!isLaundryKind(device.kind)) return null;
  const washer = device.kind === 'washer';
  const lint = washer ? undefined : readDeviceSetting(device, state, 'lintFilterOk');
  const washTemp = washer ? readPreference(device, state, 'washTemp') : null;
  const spinSpeed = washer ? readPreference(device, state, 'spinSpeedRpm') : null;
  const heat = washer ? null : readPreference(device, state, 'heatLevel');
  const dryness = washer ? null : readPreference(device, state, 'drynessLevel');
  return {
    kind: device.kind, on: state.on,
    activity: readLaundryActivity(device.kind, state), status: laundryActivityLabel(device.kind, state),
    cycle: String(readPreference(device, state, 'cycle')),
    washTemp: WASHER_TEMPERATURE_OPTIONS.find((option) => option.value === washTemp)?.value ?? null,
    spinSpeedRpm: WASHER_SPIN_OPTIONS.find((option) => option.value === spinSpeed)?.value ?? null,
    heatLevel: DRYER_HEAT_OPTIONS.find((option) => option.value === heat)?.value ?? null,
    drynessLevel: DRYER_DRYNESS_OPTIONS.find((option) => option.value === dryness)?.value ?? null,
    remainingMin: readSample(device, state, 'remainingMin', 1440),
    progressPercent: readSample(device, state, 'progress', 100),
    lintFilterOk: typeof lint === 'boolean' ? lint : null,
  };
}
