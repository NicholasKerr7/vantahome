import type { DeviceDefinition } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';
import { readFanActivity } from './fanActivity';

/** Bound visual preview inputs without inventing a sensor reading or changing stored setpoints. */
function percentage(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** Reverse changes rotor direction; the explicit sleep preview caps the requested motor speed. */
export function fanPreviewVelocity(_device: DeviceDefinition, state: DeviceState): number {
  return readFanActivity(state).velocity;
}

/** Describe visual airflow only; temperature, humidity and energy telemetry remain unchanged. */
export function readAcAirflowPreview(device: DeviceDefinition, state: DeviceState) {
  let speed = percentage(readDeviceSetting(device, state, 'acFanSpeed'));
  // Older saved combinations resolve conservatively; new choices are mutually exclusive.
  if (readDeviceSetting(device, state, 'acQuietMode') === true) speed = Math.min(speed, 30);
  else if (readDeviceSetting(device, state, 'acEcoMode') === true) speed = Math.min(speed, 50);
  else if (readDeviceSetting(device, state, 'acTurboMode') === true) speed = 100;
  const mode = readDeviceSetting(device, state, 'mode');
  const swing = readDeviceSetting(device, state, 'acSwingMode');
  return {
    strength: state.on ? speed / 100 : 0,
    horizontal: swing === 'horizontal' || swing === 'both',
    vertical: swing === 'vertical' || swing === 'both',
    color: mode === 'fan' ? '#e4e7ec' : mode === 'dry' ? '#d4b5ef' : '#b6e0d7',
  };
}

/** Move the existing three airflow marks without adding another particle emitter. */
export function acAirflowPosition(preview: ReturnType<typeof readAcAirflowPreview>, time: number, index: number, depth: number): [number, number, number] {
  const phase = (time * (0.18 + preview.strength * 0.65) + index * 0.27) % 1;
  const horizontal = preview.horizontal ? Math.sin(time * 0.7) * 0.18 : 0;
  const vertical = preview.vertical ? Math.sin(time * 0.85) * 0.15 : 0;
  return [(index - 1) * 0.22 + horizontal * phase, 0.03 - phase * (0.35 + vertical), depth / 2 + 0.08 + phase * (0.35 + preview.strength * 0.8)];
}
