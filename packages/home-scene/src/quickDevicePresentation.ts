import { isPositionDevice, type DeviceDefinition } from './data';
import { formatCapabilityValue, getCapabilities, isMonitor, quickActionLabel, readDeviceSetting, type DeviceCapability, type DeviceKind } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

type RangeCapability = Extract<DeviceCapability, { type: 'range' }>;
const PRIMARY_FIELDS: Partial<Record<DeviceKind, string>> = {
  light: 'brightness', fan: 'speed', ac: 'tempC', speaker: 'volume', tv: 'volume',
  blinds: 'openPercent', gate: 'openPercent', garage: 'openPercent', window: 'openPercent', door: 'openPercent',
};
const ACTION_KINDS = new Set<DeviceKind>(['camera', 'coffee', 'vacuum', 'washer', 'dryer', 'dishwasher', 'microwave', 'generator']);

/** Resolve quick controls from reported simulation capabilities, never from legacy fixture IDs. */
export function primaryDeviceRange(device: DeviceDefinition, state: DeviceState): { capability: RangeCapability; label: string; value: number; text: string; hint: string } | null {
  const field = PRIMARY_FIELDS[device.kind];
  if (!field) return null;
  const capability = getCapabilities(device.kind).find((candidate): candidate is RangeCapability => candidate.type === 'range' && candidate.field === field);
  if (!capability) return null;
  const value = readDeviceSetting(device, state, field);
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return {
    capability, label: field === 'tempC' ? 'Target temperature' : field === 'speed' ? 'Fan speed' : field === 'openPercent' ? 'Opening position' : capability.label,
    value, text: formatCapabilityValue(capability, value),
    hint: isPositionDevice(device) ? 'Position in your preview' : state.on ? 'Adjust your preview' : 'Value kept while off',
  };
}

/** Keep sensor, appliance and opening actions distinct from ordinary power switches. */
export function primaryDeviceAction(device: DeviceDefinition, state: DeviceState): { isSwitch: boolean; label: string; accessibleLabel: string } {
  const position = isPositionDevice(device);
  const isSwitch = !position && !isMonitor(device.kind) && !ACTION_KINDS.has(device.kind);
  const label = quickActionLabel(device, state);
  const accessibleLabel = position
    ? `${state.level > 0 ? 'Close' : 'Open'} smart ${device.kind === 'garage' ? 'shutter' : device.kind}`
    : isSwitch ? `${device.name} quick power` : `${label} ${device.name}`;
  return { isSwitch, label, accessibleLabel };
}
