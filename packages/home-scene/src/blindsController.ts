import type { DeviceDefinition } from './data';
import { deviceStatus, readDeviceSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

/** Shared positions are percentages of the existing open-position control. */
export const BLINDS_POSITION_PRESETS = [
  { value: 25, label: 'Privacy' },
  { value: 50, label: 'Half' },
  { value: 75, label: 'Daylight' },
] as const;

const BLINDS_ACTIONS = {
  open: 'blinds-command-open',
  close: 'blinds-command-close',
  raise: 'blinds-position-up',
  lower: 'blinds-position-down',
} as const;

export type BlindsControllerKey = keyof typeof BLINDS_ACTIONS;

/** Present saved opening state without claiming motor travel, tilt or sensor readings. */
export interface BlindsControllerState {
  readonly position: number;
  readonly status: string;
  readonly canRaise: boolean;
  readonly canLower: boolean;
}

/** Normalized slat geometry scales into either renderer's drawable window. */
export interface BlindsControllerSlat {
  readonly y: number;
  readonly height: number;
}

/** Map every controller command to the shared allowlisted reducer path. */
export function blindsActionId(key: BlindsControllerKey): typeof BLINDS_ACTIONS[BlindsControllerKey] {
  return BLINDS_ACTIONS[key];
}

/** Read the authoritative level rather than retaining a second controller position. */
export function readBlindsControllerState(device: DeviceDefinition, state: DeviceState): BlindsControllerState {
  const position = Number(readDeviceSetting(device, state, 'openPercent'));
  return { position, status: deviceStatus(device, state), canRaise: position < 100, canLower: position > 0 };
}

/** Compress ten static slats into a 12% top stack as the saved open percentage increases. */
export function getBlindsControllerSlats(position: number): readonly BlindsControllerSlat[] {
  const opening = Number.isFinite(position) ? Math.max(0, Math.min(100, position)) / 100 : 0;
  const height = (1 - opening * 0.88) / 10;
  return Array.from({ length: 10 }, (_, index) => ({ y: index * height, height }));
}
