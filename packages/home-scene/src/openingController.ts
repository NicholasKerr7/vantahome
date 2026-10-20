import type { DeviceDefinition } from './data';
import { isOpeningDeviceKind, openingPositionStatus, readOpeningPosition, type OpeningDeviceKind } from './openingPosition';
import type { DeviceState } from './simulationTypes';

export { isOpeningDeviceKind } from './openingPosition';
export type { OpeningDeviceKind } from './openingPosition';

export const OPENING_POSITION_BOUNDS = { min: 0, max: 100, step: 5 } as const;
export type OpeningControllerKey = 'open' | 'close' | 'increase' | 'decrease' | 'vent';
export type OpeningControllerVariant = 'hinged-door' | 'roller-shutter' | 'awning-window';

const OPENING_VARIANTS: Record<OpeningDeviceKind, OpeningControllerVariant> = {
  door: 'hinged-door', garage: 'roller-shutter', window: 'awning-window',
};
const OPENING_ACTIONS = {
  open: 'command-open', close: 'command-close', increase: 'position-up', decrease: 'position-down',
} as const;

/** One selected fixture's accepted position, without inferred locks, travel or safety readings. */
export interface OpeningControllerState {
  readonly kind: OpeningDeviceKind;
  readonly variant: OpeningControllerVariant;
  readonly openPercent: number | null;
  readonly status: string;
  readonly canOpen: boolean;
  readonly canClose: boolean;
}

/** Map controls onto the existing guarded command path; only windows support a vent preset. */
export function openingControllerActionId(kind: OpeningDeviceKind, key: Exclude<OpeningControllerKey, 'vent'>): string;
export function openingControllerActionId(kind: 'window', key: 'vent'): 'window-vent';
export function openingControllerActionId(kind: OpeningDeviceKind, key: OpeningControllerKey): string | null;
export function openingControllerActionId(kind: OpeningDeviceKind, key: OpeningControllerKey): string | null {
  if (key === 'vent') return kind === 'window' ? 'window-vent' : null;
  return `${kind}-${OPENING_ACTIONS[key]}`;
}

/** Explicit targets can recover unknown position; relative steps require a known percentage. */
export function readOpeningControllerState(device: DeviceDefinition, state: DeviceState): OpeningControllerState | null {
  if (!isOpeningDeviceKind(device.kind)) return null;
  const openPercent = readOpeningPosition(state);
  return {
    kind: device.kind,
    variant: OPENING_VARIANTS[device.kind],
    openPercent,
    status: openingPositionStatus(state),
    canOpen: openPercent !== OPENING_POSITION_BOUNDS.max,
    canClose: openPercent !== OPENING_POSITION_BOUNDS.min,
  };
}
