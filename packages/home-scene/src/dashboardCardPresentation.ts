import { isPositionDevice, type DeviceDefinition } from './data';
import { deviceStatus, isMonitor, readDeviceSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

/** Make the selected device's actual setting prominent without inventing live telemetry. */
export function deviceCardReading(device: DeviceDefinition, state: DeviceState): { value: string; caption: string } {
  const status = deviceStatus(device, state);
  if (isPositionDevice(device)) return { value: `${Math.round(state.level)}%`, caption: `Opening position · ${status}` };
  if (device.kind === 'gas-leak') return { value: readDeviceSetting(device, state, 'gasLeakDetected') ? 'Leak' : 'Clear', caption: 'Simulation sample' };
  if (device.kind === 'gas-meter') return {
    value: readDeviceSetting(device, state, 'gasLeakInterlock') ? 'Leak' : `${readDeviceSetting(device, state, 'gasRemainingKg')} kg`,
    caption: `Sample · valve ${readDeviceSetting(device, state, 'gasValveOpen') ? 'open' : 'closed'}`,
  };
  if (device.kind === 'ac') return { value: `${readDeviceSetting(device, state, 'tempC')}°C`, caption: `Target temperature · ${status}` };
  if (device.kind === 'light' && state.on) return { value: `${Math.round(state.level)}%`, caption: 'Brightness · On' };
  if (device.kind === 'battery') return { value: `${Math.round(state.level)}%`, caption: 'Simulated charge' };
  return { value: status, caption: isMonitor(device.kind) ? 'Simulation sample' : 'Device state' };
}

/** Short embedded phones trade page size for readable cards, never smaller tap targets. */
export function libraryCardPageSize(viewportHeight: number): 2 | 4 {
  return viewportHeight <= 520 ? 2 : 4;
}
