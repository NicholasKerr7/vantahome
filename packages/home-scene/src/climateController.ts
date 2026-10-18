import type { DeviceDefinition } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import { readAcAirflowPreview } from './devicePreviewBehavior';
import type { DeviceState } from './simulationTypes';

/** Shared control choices match the validated AC catalog on native and web. */
export const CLIMATE_MODE_OPTIONS = [
  { value: 'cold', label: 'Cold' },
  { value: 'fan', label: 'Fan' },
  { value: 'dry', label: 'Dry' },
] as const;
export const CLIMATE_SWING_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'both', label: 'Both' },
] as const;
export const CLIMATE_PRESET_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'eco', label: 'Eco' },
  { value: 'quiet', label: 'Quiet' },
  { value: 'turbo', label: 'Turbo' },
] as const;
export const CLIMATE_TEMPERATURE_BOUNDS = { min: 15, max: 28, step: 1 } as const;
export const CLIMATE_FAN_BOUNDS = { min: 0, max: 100, step: 10 } as const;

export type ClimateMode = typeof CLIMATE_MODE_OPTIONS[number]['value'];
export type ClimateSwing = typeof CLIMATE_SWING_OPTIONS[number]['value'];
export type ClimatePreset = typeof CLIMATE_PRESET_OPTIONS[number]['value'];
export type ClimateTemperatureUnit = 'C' | 'F';

const CLIMATE_ACTIONS = {
  temperatureUp: 'ac-temperature-up',
  temperatureDown: 'ac-temperature-down',
  fanUp: 'ac-fan-up',
  fanDown: 'ac-fan-down',
} as const;
const PRESET_FIELDS = { eco: 'acEcoMode', turbo: 'acTurboMode', quiet: 'acQuietMode' } as const;

export type ClimateControllerKey = keyof typeof CLIMATE_ACTIONS;
export type ClimatePresetCommand =
  | { readonly type: 'action'; readonly actionId: 'ac-preset-normal' }
  | { readonly type: 'setting'; readonly field: typeof PRESET_FIELDS[keyof typeof PRESET_FIELDS]; readonly value: true };

/** A projection of saved setpoints and visual airflow, with no invented room measurement. */
export interface ClimateControllerState {
  readonly on: boolean;
  readonly targetC: number;
  readonly mode: ClimateMode;
  readonly fanSpeed: number;
  readonly swing: ClimateSwing;
  readonly preset: ClimatePreset;
  readonly airflowStrength: number;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly fanMin: number;
  readonly fanMax: number;
}

/** Format the canonical Celsius target using the account's presentation preference. */
export function formatClimateTemperature(targetC: number, unit: ClimateTemperatureUnit): string {
  return String(Math.round(unit === 'F' ? targetC * 9 / 5 + 32 : targetC));
}

/** Describe the fixed Celsius control step accurately when the display uses Fahrenheit. */
export function climateTemperatureStepLabel(unit: ClimateTemperatureUnit): string {
  return unit === 'F' ? '1.8°F' : '1°C';
}

/** Dispatch relative keys against current shared state so rapid presses cannot overwrite one another. */
export function climateActionId(key: ClimateControllerKey): typeof CLIMATE_ACTIONS[ClimateControllerKey] {
  return CLIMATE_ACTIONS[key];
}

/** Use one guarded setting or atomic Normal action while preserving remembered power and fan speed. */
export function climatePresetCommand(preset: ClimatePreset): ClimatePresetCommand {
  return preset === 'normal'
    ? { type: 'action', actionId: 'ac-preset-normal' }
    : { type: 'setting', field: PRESET_FIELDS[preset], value: true };
}

/** Read canonical AC state; legacy preset conflicts follow the same conservative order as scene airflow. */
export function readClimateControllerState(device: DeviceDefinition, state: DeviceState): ClimateControllerState {
  const preset = (['quiet', 'eco', 'turbo'] as const)
    .find((candidate) => readDeviceSetting(device, state, PRESET_FIELDS[candidate]) === true) ?? 'normal';
  return {
    on: state.on,
    targetC: Number(readDeviceSetting(device, state, 'tempC')),
    mode: CLIMATE_MODE_OPTIONS.find((option) => option.value === readDeviceSetting(device, state, 'mode'))?.value ?? 'cold',
    fanSpeed: Number(readDeviceSetting(device, state, 'acFanSpeed')),
    swing: CLIMATE_SWING_OPTIONS.find((option) => option.value === readDeviceSetting(device, state, 'acSwingMode'))?.value ?? 'off',
    preset,
    airflowStrength: readAcAirflowPreview(device, state).strength,
    tempMin: CLIMATE_TEMPERATURE_BOUNDS.min,
    tempMax: CLIMATE_TEMPERATURE_BOUNDS.max,
    fanMin: CLIMATE_FAN_BOUNDS.min,
    fanMax: CLIMATE_FAN_BOUNDS.max,
  };
}
