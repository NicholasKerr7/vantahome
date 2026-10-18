import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting, type DeviceKind } from './deviceCapabilities';
import type { DeviceState, SettingValue } from './simulationTypes';

export type EnergyDeviceKind = 'energy' | 'solar' | 'battery' | 'generator';

export const BATTERY_STORAGE_OPTIONS = [
  { label: 'Backup', value: 'backup' },
  { label: 'Self-Use', value: 'self-use' },
  { label: 'Charge', value: 'charge' },
] as const;

export const GENERATOR_MODE_OPTIONS = [
  { label: 'Manual', value: 'manual' },
  { label: 'Auto', value: 'auto' },
] as const;

export const BATTERY_RESERVE_PRESETS = [
  { label: '20%', value: 20 },
  { label: '40%', value: 40 },
  { label: '60%', value: 60 },
] as const;

const ENERGY_ACTIONS = { outage: 'energy-outage', restoreGrid: 'energy-restore-grid' } as const;

export type EnergyControllerKey = keyof typeof ENERGY_ACTIONS;
export type BatteryStorageMode = typeof BATTERY_STORAGE_OPTIONS[number]['value'];
export type GeneratorMode = typeof GENERATOR_MODE_OPTIONS[number]['value'];

/** A selected-device sample or preference; null means unavailable, never an inferred zero. */
export interface EnergyReading {
  readonly label: string;
  readonly value: number | string | null;
  readonly unit: string;
}

interface EnergyControllerBase {
  readonly on: boolean;
  readonly status: string;
  readonly headline: EnergyReading;
  readonly metrics: readonly EnergyReading[];
  readonly primaryActionLabel: string | null;
}

/** These projections do not combine devices or infer import, export, or battery flow. */
export type EnergyControllerState = EnergyControllerBase & (
  | { readonly kind: 'energy'; readonly gridAvailable: boolean | null; readonly outageAlerts: boolean; readonly budgetKwh: number }
  | { readonly kind: 'solar'; readonly sampleChecked: boolean; readonly inverterStatus: string }
  | { readonly kind: 'battery'; readonly chargePercent: number | null; readonly reservePercent: number; readonly storageMode: BatteryStorageMode; readonly capacityKwh: number | null }
  | { readonly kind: 'generator'; readonly mode: GeneratorMode; readonly outputW: number | null; readonly fuelPercent: number | null }
);

/** Identify supported consoles without consulting other devices or their grants. */
export function isEnergyDeviceKind(kind: DeviceKind): kind is EnergyDeviceKind {
  return kind === 'energy' || kind === 'solar' || kind === 'battery' || kind === 'generator';
}

/** Keep outage samples on the existing allowlisted, guarded action path. */
export function energyActionId(key: EnergyControllerKey): typeof ENERGY_ACTIONS[EnergyControllerKey] {
  return ENERGY_ACTIONS[key];
}

/** Format power consistently in kW while preserving genuine zero and unavailable readings. */
export function formatEnergyReading(reading: EnergyReading): { value: string; unit: string } {
  if (reading.value === null || (typeof reading.value === 'number' && !Number.isFinite(reading.value))) return { value: '—', unit: '' };
  if (reading.unit === 'W' && typeof reading.value === 'number') return { value: (reading.value / 1000).toFixed(2), unit: 'kW' };
  return { value: String(reading.value), unit: reading.unit };
}

/** Read canonical aliases first, rejecting malformed samples rather than inventing telemetry. */
function readNumber(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Validate saved controls against the catalog, using its defaults for malformed preferences. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  const value = readDeviceSetting(device, state, field);
  return (capability && validateSetting(capability, value)) ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Project only the caller's already-authorized device; no other device state is read. */
export function readEnergyControllerState(device: DeviceDefinition, state: DeviceState): EnergyControllerState | null {
  const on = state.on;
  switch (device.kind) {
    case 'energy': {
      const grid = readDeviceSetting(device, state, 'gridAvailable');
      const gridAvailable = typeof grid === 'boolean' ? grid : null;
      return {
        kind: 'energy', on, gridAvailable,
        status: gridAvailable === null ? 'Grid status unavailable' : gridAvailable ? 'Grid available · sample' : 'Grid outage · sample',
        headline: { label: 'Demand sample', value: readNumber(device, state, 'powerW'), unit: 'W' },
        metrics: [
          { label: 'Today', value: readNumber(device, state, 'energyTodayKwh'), unit: 'kWh' },
          { label: 'Solar sample', value: readNumber(device, state, 'solarW'), unit: 'W' },
          { label: 'Solar today', value: readNumber(device, state, 'solarTodayKwh'), unit: 'kWh' },
          { label: 'Grid today', value: readNumber(device, state, 'gridTodayKwh'), unit: 'kWh' },
        ],
        primaryActionLabel: 'Check sample',
        outageAlerts: readPreference(device, state, 'gridOutageAlerts') === true,
        budgetKwh: Number(readPreference(device, state, 'energyBudgetKwh')),
      };
    }
    case 'solar': {
      const inverter = readDeviceSetting(device, state, 'inverterStatus');
      const inverterStatus = typeof inverter === 'string' && inverter.trim() ? inverter : 'Unavailable';
      const sampleChecked = readDeviceSetting(device, state, 'sampleChecked') === true;
      return {
        kind: 'solar', on, status: sampleChecked ? 'Sample checked' : 'Monitoring sample',
        headline: { label: 'Generation sample', value: readNumber(device, state, 'solarW'), unit: 'W' },
        metrics: [
          { label: 'Today', value: readNumber(device, state, 'solarTodayKwh'), unit: 'kWh' },
          { label: 'Inverter sample', value: inverterStatus, unit: '' },
        ],
        primaryActionLabel: 'Check sample',
        sampleChecked,
        inverterStatus,
      };
    }
    case 'battery': {
      const chargePercent = readNumber(device, state, 'chargePercent');
      const capacityKwh = readNumber(device, state, 'capacityKwh');
      const reservePercent = Number(readPreference(device, state, 'reservePercent'));
      const preference = readPreference(device, state, 'storageMode');
      const storageMode: BatteryStorageMode = preference === 'self-use' || preference === 'charge' ? preference : 'backup';
      return {
        kind: 'battery', on, status: on ? 'Enabled' : 'Off',
        headline: { label: 'Charge sample', value: chargePercent, unit: '%' },
        metrics: [
          { label: 'Capacity', value: capacityKwh, unit: 'kWh' },
          { label: 'Reserve preference', value: reservePercent, unit: '%' },
        ],
        primaryActionLabel: null,
        chargePercent, reservePercent, storageMode, capacityKwh,
      };
    }
    case 'generator': {
      const outputW = readNumber(device, state, 'powerW');
      const fuelPercent = readNumber(device, state, 'fuelPercent');
      const mode: GeneratorMode = readPreference(device, state, 'generatorMode') === 'manual' ? 'manual' : 'auto';
      return {
        kind: 'generator', on, status: on ? 'Running simulation' : 'Stopped simulation',
        headline: { label: 'Output preview', value: outputW, unit: 'W' },
        metrics: [
          { label: 'Fuel sample', value: fuelPercent, unit: '%' },
          { label: 'Start preference', value: mode === 'manual' ? 'Manual' : 'Auto', unit: '' },
        ],
        primaryActionLabel: on ? 'Stop simulation' : 'Start simulation',
        mode, outputW, fuelPercent,
      };
    }
    default: return null;
  }
}
