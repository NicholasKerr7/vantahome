import inventory from './device-capabilities.json';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './state';

export const DEVICE_KINDS = ['ac', 'light', 'tv', 'coffee', 'fridge', 'gate', 'garage', 'fan', 'door', 'vacuum', 'camera', 'window', 'stove', 'washer', 'dryer', 'dishwasher', 'microwave', 'energy', 'water', 'water-heater', 'air', 'sprinkler', 'speaker', 'smoke', 'blinds', 'generator', 'battery', 'solar'] as const;
export type DeviceKind = typeof DEVICE_KINDS[number];
export type SettingValue = string | number | boolean;
interface CapabilityBase { id: string; label: string }
export type DeviceCapability = CapabilityBase & (
  | { type: 'range'; field: string; min: number; max: number; step?: number; unit?: string }
  | { type: 'enum'; field: string; options: { label: string; value: string | number }[] }
  | { type: 'toggle'; field: string; onLabel?: string; offLabel?: string }
  | { type: 'stat'; field: string; unit?: string }
  | { type: 'action'; patch: Record<string, SettingValue> }
);
const profiles = inventory.profiles as Record<DeviceKind, DeviceCapability[]>;
const defaults: Partial<Record<DeviceKind, Record<string, SettingValue>>> = inventory.defaults;
export const LEGACY_DEVICE_IDS = ['living-light', 'living-fan', 'family-tv', 'laundry-washer', 'master-ac', 'master-blinds', 'entry-gate'] as const;

/** Resolve supported controls from the audited repository's declarative profiles. */
export function getCapabilities(kind: DeviceKind): readonly DeviceCapability[] { return profiles[kind]; }

/** Monitoring hardware presents readings and a sample check instead of fake power. */
export function isMonitor(kind: DeviceKind): boolean { return ['energy', 'water', 'air', 'smoke', 'solar'].includes(kind); }

/** Preserve the seven original animation levels while offering richer settings. */
export function hasLegacyLevel(device: DeviceDefinition): boolean { return (LEGACY_DEVICE_IDS as readonly string[]).includes(device.id); }

/** Read a validated setting, falling back to an appropriate reproducible demo value. */
export function readDeviceSetting(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  if (field === 'isOn') return state.on;
  if (field === 'armed' && device.kind === 'camera') return state.on;
  if (field === 'powerW' && device.kind === 'generator') return state.on ? Math.round(state.level * 60) : 0;
  if (field === 'chargePercent' && device.kind === 'battery') return state.level;
  if (field === 'openPercent' || (field === 'brightness' && device.kind === 'light') || (field === 'speed' && device.kind === 'fan')) return state.level;
  if (field === 'tempC' && device.kind === 'ac' && state.settings?.[field] === undefined) return 26 - Math.round(state.level * 0.08);
  if (state.settings?.[field] !== undefined) return state.settings[field];
  const capability = profiles[device.kind].find((item) => 'field' in item && item.field === field);
  const seed = defaults[device.kind]?.[field];
  if (capability?.type === 'enum') return capability.options.some((option) => option.value === seed) ? seed! : capability.options[0].value;
  if (seed !== undefined) return seed;
  if (capability?.type === 'range') return capability.min;
  if (capability?.type === 'toggle') return false;
  return capability?.type === 'stat' && capability.unit ? 0 : 'Ready';
}

/** Accept only finite, schema-bounded controls; telemetry is deliberately read-only. */
export function validateSetting(capability: DeviceCapability, value: unknown): SettingValue | undefined {
  if (capability.type === 'range' && typeof value === 'number' && Number.isFinite(value)) {
    const step = capability.step ?? 1;
    return Math.min(capability.max, Math.max(capability.min, Math.round((value - capability.min) / step) * step + capability.min));
  }
  if (capability.type === 'toggle' && typeof value === 'boolean') return value;
  if (capability.type === 'enum' && capability.options.some((option) => option.value === value)) return value as string | number;
  return undefined;
}

/** Render a catalog value with explicit units and a readable boolean status. */
export function formatCapabilityValue(capability: DeviceCapability, value: SettingValue): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if ('unit' in capability && capability.unit) return `${value}${capability.unit === '%' || capability.unit === '°C' ? '' : ' '}${capability.unit}`;
  if (capability.type === 'enum') return capability.options.find((option) => option.value === value)?.label ?? String(value);
  return String(value);
}

/** Give every quick card one meaningful action without treating sensors as switches. */
export function quickActionLabel(device: DeviceDefinition, state: DeviceState): string {
  if (isMonitor(device.kind)) return device.kind === 'smoke' ? 'Run self-test' : 'Refresh sample';
  if (device.kind === 'camera') return readDeviceSetting(device, state, 'armed') ? 'Disarm' : 'Arm';
  if (['gate', 'garage', 'blinds', 'window', 'door'].includes(device.kind)) return `${state.level > 0 ? 'Close' : 'Open'} ${device.kind === 'garage' ? 'shutter' : device.kind}`;
  if (['washer', 'dryer', 'dishwasher', 'microwave'].includes(device.kind)) return state.on ? 'Pause' : 'Start';
  if (device.kind === 'coffee') return state.on ? 'Stop brewing' : 'Brew now';
  if (device.kind === 'vacuum') return state.on ? 'Dock' : 'Start cleaning';
  if (device.kind === 'generator') return state.on ? 'Stop generator' : 'Start generator';
  return state.on ? 'Turn off' : 'Turn on';
}

/** Describe state consistently in quick cards, room lists and the full inspector. */
export function deviceStatus(device: DeviceDefinition, state: DeviceState): string {
  if (device.kind === 'camera') return readDeviceSetting(device, state, 'armed') ? 'Armed' : 'Disarmed';
  if (isMonitor(device.kind)) return state.settings?.sampleChecked ? 'Sample checked' : 'Monitoring sample';
  if (['gate', 'garage', 'window', 'blinds', 'door'].includes(device.kind)) return state.level === 0 ? 'Closed' : state.level === 100 ? 'Fully open' : `${state.level}% open`;
  if (['washer', 'dryer', 'dishwasher', 'microwave', 'vacuum', 'coffee', 'generator'].includes(device.kind)) return state.on ? 'Running' : 'Idle';
  return state.on ? 'On' : 'Off';
}
