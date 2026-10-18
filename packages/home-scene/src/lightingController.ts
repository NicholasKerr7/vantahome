import type { DeviceDefinition } from './data';
import { deviceStatus, getCapabilities, readDeviceSetting } from './deviceCapabilities';
import { readLabLightState } from './lightAppearance';
import type { DeviceState } from './simulationTypes';

export { LIGHT_COLOR_PRESETS, LIGHT_WHITE_PRESETS } from './deviceControlCatalog';

const LIGHTING_ACTIONS = {
  brighter: 'light-brightness-up',
  dimmer: 'light-brightness-down',
  white: 'light-mode-white',
  color: 'light-mode-color',
} as const;

export type LightingControllerKey = keyof typeof LIGHTING_ACTIONS;

/** Keep saved manual settings separate from the effect-adjusted property preview. */
export interface LightingControllerState {
  readonly on: boolean;
  readonly brightness: number;
  readonly colorMode: 'color' | 'temperature';
  readonly color: string;
  readonly temperatureK: number;
  readonly effect: string;
  readonly effectLabel: string | null;
  readonly previewColor: string;
  readonly previewBrightness: number;
  readonly status: string;
}

/** Route relative brightness and manual modes through the same guarded catalog actions. */
export function lightingActionId(key: LightingControllerKey): typeof LIGHTING_ACTIONS[LightingControllerKey] {
  return LIGHTING_ACTIONS[key];
}

/** Project current settings and the scene's steady visual without inventing light measurements. */
export function readLightingControllerState(device: DeviceDefinition, state: DeviceState): LightingControllerState {
  const preview = readLabLightState(device, state);
  const effect = String(readDeviceSetting(device, state, 'lightEffect'));
  const effectCapability = getCapabilities(device.kind).find((capability) => 'field' in capability && capability.field === 'lightEffect');
  const effectLabel = effect !== 'none' && effectCapability?.type === 'enum'
    ? effectCapability.options.find((option) => option.value === effect)?.label ?? null : null;
  return {
    on: state.on,
    brightness: Number(readDeviceSetting(device, state, 'brightness')),
    colorMode: readDeviceSetting(device, state, 'lightColorMode') === 'temperature' ? 'temperature' : 'color',
    color: String(readDeviceSetting(device, state, 'color')),
    temperatureK: preview.colorTemperature,
    effect,
    effectLabel,
    previewColor: preview.colorHex,
    previewBrightness: preview.on ? preview.brightness : 0,
    status: deviceStatus(device, state),
  };
}
