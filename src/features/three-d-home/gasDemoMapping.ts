import { validateStoredSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { GAS_DEFAULTS, GAS_LEAK_FIELDS, GAS_METER_FIELDS, isGasDevice, readGasSetting } from '../../../packages/home-scene/src/gasSimulation';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { Device } from '../../store/useHomeStore';

// Derived values may be displayed in the host demo but never accepted as scene input.
const DERIVED_GAS_FIELDS = new Set(['gasCapacityKg', 'gasRemainingPercent', 'gasRefillDue', 'gasBudgetExceeded']);

/** Share explicitly simulated gas readings only; callers enforce the known ID and offline demo scope. */
export function overlayGasDemoDevice(device: Device, previous: DeviceState): DeviceState {
  if (!isGasDevice(device.kind)) return previous;
  let next = previous.on ? previous : { ...previous, on: true };
  const fields = device.kind === 'gas-meter' ? GAS_METER_FIELDS : GAS_LEAK_FIELDS;
  for (const field of fields) {
    const value = validateStoredSetting(device.kind, field, device[field]);
    // Compare raw storage: a closed valve's derived zero must not hide stale flow.
    if (value !== undefined && value !== (next.settings?.[field] ?? GAS_DEFAULTS[device.kind][field])) {
      next = { ...next, settings: { ...next.settings, [field]: value } };
    }
  }
  return next;
}

/** Project changed gas scenarios back into the paired demo without overwriting unrelated metadata. */
export function projectGasSimulationToDemo(device: Device, state: DeviceState, previous: DeviceState): Device {
  if (!isGasDevice(device.kind)) return device;
  let next = device.isOn ? device : { ...device, isOn: true };
  const fields = device.kind === 'gas-meter' ? GAS_METER_FIELDS : GAS_LEAK_FIELDS;
  for (const field of fields) {
    const reading = readGasSetting(device.kind, state, field);
    const value = DERIVED_GAS_FIELDS.has(field) ? reading : validateStoredSetting(device.kind, field, reading);
    const oldValue = readGasSetting(device.kind, previous, field);
    if (value !== undefined && value !== oldValue && next[field] !== value) next = { ...next, [field]: value };
  }
  return next;
}
