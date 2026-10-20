import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting, type DeviceKind } from './deviceCapabilities';
import type { DeviceState, SettingValue } from './simulationTypes';

export type WaterDeviceKind = 'water' | 'water-heater';

/** These choices and bounds preserve the existing validated heater settings. */
export const WATER_HEATER_MODE_OPTIONS = [
  { label: 'Eco', value: 'eco' },
  { label: 'Standard', value: 'standard' },
  { label: 'Boost', value: 'boost' },
  { label: 'Vacation', value: 'vacation' },
] as const;
export const WATER_HEATER_TEMPERATURE_BOUNDS = { min: 40, max: 70, step: 1 } as const;
export const WATER_BUDGET_BOUNDS = { min: 100, max: 400, step: 20 } as const;
export type WaterHeaterMode = typeof WATER_HEATER_MODE_OPTIONS[number]['value'];

const WATER_ACTIONS = {
  temperatureUp: 'water-heater-temperature-up',
  temperatureDown: 'water-heater-temperature-down',
  budgetUp: 'water-budget-up',
  budgetDown: 'water-budget-down',
} as const;
export type WaterControllerKey = keyof typeof WATER_ACTIONS;

interface WaterControllerBase {
  readonly on: boolean;
  readonly status: string;
}

/** Heater targets are preferences; meter values are independent local samples, never valve telemetry. */
export type WaterControllerState = WaterControllerBase & (
  | {
    readonly kind: 'water-heater';
    readonly targetC: number;
    readonly tempMin: number;
    readonly tempMax: number;
    readonly mode: WaterHeaterMode;
    readonly recirculation: boolean;
    readonly heaterType: string;
  }
  | {
    readonly kind: 'water';
    readonly flowLpm: number | null;
    readonly todayL: number | null;
    readonly pressurePsi: number | null;
    readonly temperatureC: number | null;
    readonly leakDetected: boolean | null;
    readonly sampleChecked: boolean;
    readonly leakAlerts: boolean;
    readonly pressureAlerts: boolean;
    readonly autoShutoff: boolean;
    readonly budgetL: number;
    readonly budgetMin: number;
    readonly budgetMax: number;
  }
);

/** Match only the two water consoles without reading another device or expanding its grants. */
export function isWaterDeviceKind(kind: DeviceKind): kind is WaterDeviceKind {
  return kind === 'water' || kind === 'water-heater';
}

/** Relative commands resolve against current reducer state, including rapid repeated presses. */
export function waterControllerActionId(key: WaterControllerKey): typeof WATER_ACTIONS[WaterControllerKey] {
  return WATER_ACTIONS[key];
}

/** Retain finite, nonnegative samples, while malformed readings remain visibly unavailable. */
function readSample(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Validate saved controls with their existing catalog and fall back only to its known defaults. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  const value = readDeviceSetting(device, state, field);
  return (capability && validateSetting(capability, value))
    ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Project only the already-authorized selected device, without inventing heating or water shutoff. */
export function readWaterControllerState(device: DeviceDefinition, state: DeviceState): WaterControllerState | null {
  if (device.kind === 'water-heater') {
    const preferredMode = readPreference(device, state, 'heaterMode');
    const mode = WATER_HEATER_MODE_OPTIONS.find((option) => option.value === preferredMode)?.value ?? 'eco';
    return {
      kind: 'water-heater',
      on: state.on,
      status: state.on ? 'Enabled · target setting' : 'Off · settings remembered',
      targetC: Number(readPreference(device, state, 'tempC')),
      tempMin: WATER_HEATER_TEMPERATURE_BOUNDS.min,
      tempMax: WATER_HEATER_TEMPERATURE_BOUNDS.max,
      mode,
      recirculation: readPreference(device, state, 'recirculation') === true,
      heaterType: String(readPreference(device, state, 'waterHeaterType')),
    };
  }
  if (device.kind === 'water') {
    const leak = readDeviceSetting(device, state, 'waterLeakDetected');
    const leakDetected = typeof leak === 'boolean' ? leak : null;
    const sampleChecked = readDeviceSetting(device, state, 'sampleChecked') === true;
    return {
      kind: 'water',
      on: state.on,
      status: leakDetected === null ? 'Leak status unavailable'
        : leakDetected ? 'Leak detected · sample'
          : sampleChecked ? 'Sample checked' : 'Monitoring sample',
      flowLpm: readSample(device, state, 'waterLpm'),
      todayL: readSample(device, state, 'waterTodayL'),
      pressurePsi: readSample(device, state, 'waterPressurePsi'),
      temperatureC: readSample(device, state, 'waterTempC'),
      leakDetected,
      sampleChecked,
      leakAlerts: readPreference(device, state, 'waterLeakAlerts') === true,
      pressureAlerts: readPreference(device, state, 'waterPressureAlerts') === true,
      autoShutoff: readPreference(device, state, 'waterAutoShutoff') === true,
      budgetL: Number(readPreference(device, state, 'waterBudgetL')),
      budgetMin: WATER_BUDGET_BOUNDS.min,
      budgetMax: WATER_BUDGET_BOUNDS.max,
    };
  }
  return null;
}
