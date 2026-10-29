import type { DeviceDefinition } from './data';
import { readDeviceSetting, validateStoredSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export const MICROWAVE_MODES = ['Reheat', 'Defrost', 'Grill', 'Popcorn'] as const;
export const MICROWAVE_QUICK_TIMES = [30, 60, 120] as const;
export const MICROWAVE_POWER_BOUNDS = { min: 1, max: 10 } as const;
export const MICROWAVE_PREVIEW_NOTE = 'Simulation only · no countdown or automatic stop';
export interface MicrowaveControllerState {
  readonly on: boolean;
  readonly seconds: number | null;
  readonly duration: string;
  readonly power: number | null;
  readonly mode: typeof MICROWAVE_MODES[number] | null;
  readonly status: string;
}

/** Missing values use existing defaults; explicit malformed values remain unavailable. */
function preference(device: DeviceDefinition, state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field) ? state.settings[field] : readDeviceSetting(device, state, field);
}

/** Preserve exact validated settings instead of rounding malformed stored data into plausible values. */
function numberPreference(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const value = preference(device, state, field);
  return typeof value === 'number' && validateStoredSetting(device.kind, field, value) === value ? value : null;
}

/** Display the stored duration, never a simulated countdown or remaining physical cooking time. */
export function formatMicrowaveDuration(seconds: number | null): string {
  return seconds === null ? '—:—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Project accepted activity and independent preferences without adding a cooking engine. */
export function readMicrowaveControllerState(device: DeviceDefinition, state: DeviceState): MicrowaveControllerState | null {
  if (device.kind !== 'microwave') return null;
  const seconds = numberPreference(device, state, 'timeRemainingSec');
  const power = numberPreference(device, state, 'microwavePower');
  const mode = MICROWAVE_MODES.find((option) => option === preference(device, state, 'microwaveMode')) ?? null;
  return { on: state.on, seconds, duration: formatMicrowaveDuration(seconds), power, mode,
    status: seconds === null || power === null || mode === null ? 'Some preferences unavailable' : state.on ? 'Preview active' : 'Idle · preferences remembered' };
}
