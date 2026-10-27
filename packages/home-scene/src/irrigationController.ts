import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export const IRRIGATION_DURATION_BOUNDS = { min: 0, max: 60, step: 5 } as const;

/** Duration choices save a preference; they never start watering or create a countdown. */
export const IRRIGATION_DURATION_PRESETS = [
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
] as const;

/** Keep canonical stored values compatible with the existing irrigation controls. */
export const IRRIGATION_ZONES = [
  { label: 'Front yard', value: 'Front Yard' },
  { label: 'Back yard', value: 'Back Yard' },
  { label: 'Garden', value: 'Garden' },
] as const;
export type IrrigationZone = typeof IRRIGATION_ZONES[number]['value'];

/** Power is authoritative; invalid saved preferences remain unavailable until explicitly replaced. */
export interface IrrigationControllerState {
  readonly on: boolean;
  readonly durationMin: number | null;
  readonly zone: IrrigationZone | null;
  readonly status: string;
}

const IRRIGATION_ACTIONS = { durationUp: 'sprinkler-duration-up', durationDown: 'sprinkler-duration-down' } as const;
export type IrrigationControllerKey = keyof typeof IRRIGATION_ACTIONS;

/** Resolve relative duration commands against the latest guarded simulation state. */
export function irrigationControllerActionId(key: IrrigationControllerKey): typeof IRRIGATION_ACTIONS[IrrigationControllerKey] {
  return IRRIGATION_ACTIONS[key];
}

/** Project only this sprinkler, without inferring soil moisture, weather decisions or active zones. */
export function readIrrigationControllerState(device: DeviceDefinition, state: DeviceState): IrrigationControllerState | null {
  if (device.kind !== 'sprinkler') return null;
  const duration = readDeviceSetting(device, state, 'durationMin');
  const durationCapability = getCapabilities('sprinkler').find((item) => 'field' in item && item.field === 'durationMin');
  const durationMin = typeof duration === 'number' && durationCapability
    && validateSetting(durationCapability, duration) === duration ? duration : null;
  const zoneValue = readDeviceSetting(device, state, 'zone');
  const zone = IRRIGATION_ZONES.find((option) => option.value === zoneValue)?.value ?? null;
  const activity = state.on ? 'Watering preview' : 'Off · settings remembered';
  const unavailable = [durationMin === null ? 'Duration unavailable' : null, zone === null ? 'Zone unavailable' : null]
    .filter(Boolean).join(' · ');
  return { on: state.on, durationMin, zone, status: unavailable ? `${activity} · ${unavailable}` : activity };
}
