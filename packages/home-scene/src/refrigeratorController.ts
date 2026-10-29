import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

/** Targets retain the existing appliance schema; they are saved preferences, never readings. */
export const REFRIGERATOR_TARGET_BOUNDS = {
  fridge: { min: 1, max: 8, step: 1 },
  freezer: { min: -24, max: -12, step: 1 },
} as const;

/** Keep the original stored mode values while giving both consoles the same order and labels. */
export const REFRIGERATOR_MODES = [
  { label: 'Normal', value: 'normal' }, { label: 'Eco', value: 'eco' },
  { label: 'Boost', value: 'boost' }, { label: 'Vacation', value: 'vacation' },
] as const;
export type RefrigeratorMode = typeof REFRIGERATOR_MODES[number]['value'];
export const REFRIGERATOR_PREFERENCE_NOTE = 'Saved cooling preferences · no live temperature readings';

/** Project accepted power and individually validated preferences without implying active cooling. */
export interface RefrigeratorControllerState {
  readonly on: boolean;
  readonly tempC: number | null;
  readonly freezerTempC: number | null;
  readonly mode: RefrigeratorMode | null;
  readonly quickCool: boolean | null;
  readonly quickFreeze: boolean | null;
  readonly iceMaker: boolean | null;
  readonly status: string;
}

const REFRIGERATOR_ACTIONS = {
  fridgeUp: 'fridge-temperature-up', fridgeDown: 'fridge-temperature-down',
  freezerUp: 'fridge-freezer-up', freezerDown: 'fridge-freezer-down',
} as const;
export type RefrigeratorControllerKey = keyof typeof REFRIGERATOR_ACTIONS;

/** Relative commands are resolved against current guarded state, so rapid taps cannot lose steps. */
export function refrigeratorControllerActionId(key: RefrigeratorControllerKey): typeof REFRIGERATOR_ACTIONS[RefrigeratorControllerKey] {
  return REFRIGERATOR_ACTIONS[key];
}

/** Defaults apply only to absent fields; an explicitly malformed saved field stays unavailable. */
function savedPreference(device: DeviceDefinition, state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field) ? state.settings[field] : readDeviceSetting(device, state, field);
}

/** Reject corrupt targets rather than coercing or clamping them into plausible temperatures. */
function targetPreference(device: DeviceDefinition, state: DeviceState, field: 'tempC' | 'freezerTempC'): number | null {
  const value = savedPreference(device, state, field);
  const capability = getCapabilities('fridge').find((item) => 'field' in item && item.field === field);
  return typeof value === 'number' && capability && validateSetting(capability, value) === value ? value : null;
}

/** Keep an unavailable switch distinct from a deliberately disabled saved preference. */
function togglePreference(device: DeviceDefinition, state: DeviceState, field: string): boolean | null {
  const value = savedPreference(device, state, field);
  return typeof value === 'boolean' ? value : null;
}

/** Read only this refrigerator, without inventing current temperature, door state or cooling progress. */
export function readRefrigeratorControllerState(device: DeviceDefinition, state: DeviceState): RefrigeratorControllerState | null {
  if (device.kind !== 'fridge') return null;
  const tempC = targetPreference(device, state, 'tempC');
  const freezerTempC = targetPreference(device, state, 'freezerTempC');
  const modeValue = savedPreference(device, state, 'fridgeMode');
  const mode = REFRIGERATOR_MODES.find((item) => item.value === modeValue)?.value ?? null;
  const quickCool = togglePreference(device, state, 'fridgeQuickCool');
  const quickFreeze = togglePreference(device, state, 'fridgeQuickFreeze');
  const iceMaker = togglePreference(device, state, 'fridgeIceMaker');
  const unavailable = [tempC, freezerTempC, mode, quickCool, quickFreeze, iceMaker].includes(null);
  const activity = state.on ? 'On · simulation' : 'Off · settings remembered';
  return { on: state.on, tempC, freezerTempC, mode, quickCool, quickFreeze, iceMaker,
    status: unavailable ? `${activity} · Some preferences unavailable` : activity };
}
