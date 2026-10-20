import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { readFanActivity, type FanPreviewState } from './fanActivity';

export const FAN_SPEED_BOUNDS = { min: 0, max: 100, step: 10 } as const;

/** Apply these through the existing speed setting so both power and Sleep remain unchanged. */
export const FAN_SPEED_PRESETS = [
  { label: 'Calm', value: 35 },
  { label: 'Balanced', value: 60 },
  { label: 'Boost', value: 100 },
] as const;
export const FAN_DIRECTION_OPTIONS = [
  { label: 'Forward', value: 'forward' },
  { label: 'Reverse', value: 'reverse' },
] as const;
export type { FanDirection } from './fanActivity';
export type FanControllerState = FanPreviewState;

const FAN_ACTIONS = { speedUp: 'fan-speed-up', speedDown: 'fan-speed-down' } as const;
export type FanControllerKey = keyof typeof FAN_ACTIONS;

/** Resolve guarded relative actions that use the latest simulation state for repeated presses. */
export function fanControllerActionId(key: FanControllerKey): typeof FAN_ACTIONS[FanControllerKey] {
  return FAN_ACTIONS[key];
}

/** Project a fixed ceiling fan or extractor without inventing oscillation, a lamp or sensor data. */
export function readFanControllerState(device: DeviceDefinition, state: DeviceState): FanControllerState | null {
  return device.kind === 'fan' ? readFanActivity(state) : null;
}
