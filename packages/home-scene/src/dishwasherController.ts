import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import { dishwasherActivityLabel, readDishwasherActivity, type DishwasherActivity } from './dishwasherActivity';
import type { DeviceState, SettingValue } from './simulationTypes';

/** Programs and temperatures preserve the catalog's existing saved preferences. */
export const DISHWASHER_CYCLE_OPTIONS = [
  { label: 'Auto', value: 'Auto' }, { label: 'Normal', value: 'Normal' },
  { label: 'Quick', value: 'Quick' }, { label: 'Eco', value: 'Eco' },
  { label: 'Intensive', value: 'Intensive' }, { label: 'Rinse', value: 'Rinse' },
] as const;
export const DISHWASHER_TEMPERATURE_OPTIONS = [
  { label: 'Cold', value: 'Cold' }, { label: 'Warm', value: 'Warm' }, { label: 'Hot', value: 'Hot' },
] as const;
export type DishwasherCycle = typeof DISHWASHER_CYCLE_OPTIONS[number]['value'];
export type DishwasherTemperature = typeof DISHWASHER_TEMPERATURE_OPTIONS[number]['value'];
export type DishwasherControllerKey = 'start' | 'pause' | 'stop';
export type { DishwasherActivity } from './dishwasherActivity';

/** One selected machine's accepted activity, saved preferences and independent fixed samples. */
export interface DishwasherControllerState {
  readonly on: boolean;
  readonly activity: DishwasherActivity;
  readonly status: string;
  readonly cycle: DishwasherCycle;
  readonly washTemp: DishwasherTemperature;
  readonly extraDry: boolean;
  readonly remainingMin: number | null;
  readonly progressPercent: number | null;
}

/** Use stable guarded action IDs; this helper has no device transport or cycle engine. */
export function dishwasherControllerActionId(key: DishwasherControllerKey): `dishwasher-${DishwasherControllerKey}` {
  return `dishwasher-${key}`;
}

/** Validate controls through their existing catalog and fall back to established saved defaults. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  return (capability && validateSetting(capability, readDeviceSetting(device, state, field)))
    ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Reject malformed samples without manufacturing progress, elapsed time or successful completion. */
function readSample(device: DeviceDefinition, state: DeviceState, field: string, maximum: number): number | null {
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

/** Project the selected dishwasher with static sample values and no automatic state transitions. */
export function readDishwasherControllerState(device: DeviceDefinition, state: DeviceState): DishwasherControllerState | null {
  if (device.kind !== 'dishwasher') return null;
  const cycle = readPreference(device, state, 'cycle');
  const temperature = readPreference(device, state, 'washTemp');
  return {
    on: state.on,
    activity: readDishwasherActivity(state),
    status: dishwasherActivityLabel(state),
    cycle: DISHWASHER_CYCLE_OPTIONS.find((option) => option.value === cycle)?.value ?? 'Auto',
    washTemp: DISHWASHER_TEMPERATURE_OPTIONS.find((option) => option.value === temperature)?.value ?? 'Hot',
    extraDry: readPreference(device, state, 'extraSpin') === true,
    remainingMin: readSample(device, state, 'remainingMin', 1440),
    progressPercent: readSample(device, state, 'progress', 100),
  };
}
