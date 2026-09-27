import type { DeviceDefinition } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';
import type { LabLightState } from './renderer-lab/lightStates';

const TEMPERATURE_PALETTE: [number, [number, number, number]][] = [
  [2000, [255, 137, 18]], [3200, [255, 198, 140]], [4500, [255, 227, 201]], [6500, [255, 249, 253]],
];
const STEADY_EFFECTS: Record<string, { color: string; gain: number }> = {
  focus: { color: '#E8F2FF', gain: 1 }, relax: { color: '#FFD9A0', gain: 0.6 },
  sunset: { color: '#FF9A5C', gain: 0.5 }, party: { color: '#B38CFF', gain: 0.8 },
};

/** Approximate a warm-to-daylight LED white without importing a renderer into shared/native state. */
export function lightTemperatureColor(kelvin: number): string {
  const bounded = Math.max(2000, Math.min(6500, Number.isFinite(kelvin) ? kelvin : 3200));
  const upperIndex = Math.max(1, TEMPERATURE_PALETTE.findIndex(([value]) => value >= bounded));
  const [low, lowColor] = TEMPERATURE_PALETTE[upperIndex - 1];
  const [high, highColor] = TEMPERATURE_PALETTE[upperIndex];
  const progress = (bounded - low) / (high - low);
  return `#${lowColor.map((channel, index) => Math.round(channel + (highColor[index] - channel) * progress).toString(16).padStart(2, '0')).join('')}`;
}

/** Resolve catalog light settings to one steady visual, including independent power and brightness. */
export function readLabLightState(device: DeviceDefinition, state: DeviceState): LabLightState {
  const temperature = Number(readDeviceSetting(device, state, 'colorTempK'));
  const colorTemperature = Math.max(2000, Math.min(6500, Number.isFinite(temperature) ? temperature : 3200));
  const storedColor = readDeviceSetting(device, state, 'color');
  const color = typeof storedColor === 'string' && /^#[0-9a-f]{6}$/i.test(storedColor) ? storedColor : '#ffe2b8';
  const effectName = readDeviceSetting(device, state, 'lightEffect');
  const effect = typeof effectName === 'string' ? STEADY_EFFECTS[effectName] : undefined;
  const temperatureMode = readDeviceSetting(device, state, 'lightColorMode') === 'temperature';
  // Effects use a stable palette rather than flashing, so reduced-motion behavior remains intact.
  return {
    on: state.on,
    brightness: Math.max(0, Math.min(100, Number.isFinite(state.level) ? state.level : 0)) * (effect?.gain ?? 1),
    colorTemperature,
    colorHex: effect?.color ?? (temperatureMode ? lightTemperatureColor(colorTemperature) : color),
  };
}
