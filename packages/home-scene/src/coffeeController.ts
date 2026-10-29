import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export const COFFEE_STRENGTHS = [{ label: 'Mild', value: 'mild' }, { label: 'Normal', value: 'normal' }, { label: 'Strong', value: 'strong' }] as const;
export const COFFEE_SIZE_PRESETS = [4, 8, 12] as const;
export const COFFEE_CUP_BOUNDS = { min: 1, max: 6 } as const;
export const COFFEE_PREVIEW_NOTE = 'Recipe settings save only · Stop ends the brewing preview';
export interface CoffeeControllerState {
  readonly on: boolean;
  readonly strength: typeof COFFEE_STRENGTHS[number]['value'] | null;
  readonly sizeOz: number | null;
  readonly cups: number | null;
  readonly targetC: number | null;
  readonly status: string;
}
const ACTIONS = { cupsUp: 'coffee-cups-up', cupsDown: 'coffee-cups-down' } as const;

/** Resolve relative cup commands against the latest guarded state rather than a render snapshot. */
export function coffeeControllerActionId(key: keyof typeof ACTIONS) { return ACTIONS[key]; }

/** Missing preferences use the existing defaults; explicit corrupt values remain unavailable. */
function preference(device: DeviceDefinition, state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field) ? state.settings[field] : readDeviceSetting(device, state, field);
}

/** Accept an exact saved recipe number without coercing or clamping corrupt data. */
function recipeNumber(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const value = preference(device, state, field);
  const capability = getCapabilities('coffee').find((item) => 'field' in item && item.field === field);
  return typeof value === 'number' && capability && validateSetting(capability, value) === value ? value : null;
}

/** Read the existing brewing preview; recipes do not imply delivery, progress, heat or consumption. */
export function readCoffeeControllerState(device: DeviceDefinition, state: DeviceState): CoffeeControllerState | null {
  if (device.kind !== 'coffee') return null;
  const strength = COFFEE_STRENGTHS.find((item) => item.value === preference(device, state, 'coffeeStrength'))?.value ?? null;
  const sizeOz = recipeNumber(device, state, 'coffeeSizeOz');
  const cups = recipeNumber(device, state, 'coffeeCupCount');
  const targetC = recipeNumber(device, state, 'coffeeTempC');
  const activity = state.on ? 'Brewing preview' : 'Idle · recipe remembered';
  return { on: state.on, strength, sizeOz, cups, targetC,
    status: [strength, sizeOz, cups, targetC].includes(null) ? `${activity} · Some preferences unavailable` : activity };
}
