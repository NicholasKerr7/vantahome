import type { DeviceDefinition } from './data';
import { readDeviceSetting, validateStoredSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export const COOKTOP_MODES = [
  { value: 'simmer', label: 'Simmer' },
  { value: 'boil', label: 'Boil' },
  { value: 'sear', label: 'Sear' },
  { value: 'keep-warm', label: 'Warm' },
] as const;
export const COOKTOP_PREVIEW_NOTE = 'Simulation only · timer and lock are saved preferences';

export interface CooktopControllerState {
  on: boolean;
  heat: number | null;
  timerMinutes: number | null;
  mode: typeof COOKTOP_MODES[number]['value'] | null;
  lockPreference: boolean | null;
  status: string;
}

/** Preserve explicit invalid data as unknown; only absent settings use catalog defaults. */
function preference(device: DeviceDefinition, state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field)
    ? state.settings[field] : readDeviceSetting(device, state, field);
}

/** Relative controls need an exact bounded numeric value, not a coerced or rounded sample. */
function numberPreference(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const value = preference(device, state, field);
  return typeof value === 'number' && Number.isFinite(value)
    && validateStoredSetting(device.kind, field, value) === value ? value : null;
}

/** Project one shared heat preference, independent power and saved-only timer/lock settings. */
export function readCooktopControllerState(device: DeviceDefinition, state: DeviceState): CooktopControllerState | null {
  if (device.kind !== 'stove') return null;
  const heat = numberPreference(device, state, 'burnerLevel');
  const timerMinutes = numberPreference(device, state, 'stoveTimerMin');
  const mode = COOKTOP_MODES.find((option) => option.value === preference(device, state, 'stoveMode'))?.value ?? null;
  const lock = preference(device, state, 'stoveLock');
  return {
    on: state.on, heat, timerMinutes, mode, lockPreference: typeof lock === 'boolean' ? lock : null,
    status: !state.on ? 'Off · preferences remembered'
      : heat === null ? 'Preview on · heat unavailable'
        : heat === 0 ? 'Preview on · zero heat setting' : 'Preview on · shared heat setting',
  };
}
