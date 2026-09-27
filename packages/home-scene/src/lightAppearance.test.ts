import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { getDevice } from './data';
import { lightTemperatureColor, readLabLightState } from './lightAppearance';
import { linearLightColor } from './renderer-lab/lightStates';

const fixture = getDevice('master-light')!;

describe('shared device light appearance', () => {
  it('keeps independent power and brightness while resolving explicit color and temperature modes', () => {
    const color = readLabLightState(fixture, { on: false, level: 25, settings: { color: '#0000FF', lightColorMode: 'color', colorTempK: 2000 } });
    expect(color).toEqual({ on: false, brightness: 25, colorTemperature: 2000, colorHex: '#0000FF' });
    const white = readLabLightState(fixture, { on: true, level: 80, settings: { color: '#0000FF', lightColorMode: 'temperature', colorTempK: 6500 } });
    expect(white).toEqual({ on: true, brightness: 80, colorTemperature: 6500, colorHex: lightTemperatureColor(6500) });
    expect(white.colorHex).not.toBe(color.colorHex);
  });

  it('provides steady effect previews without a clock, animation, or flashing dependency', () => {
    const state = { on: true, level: 50, settings: { lightEffect: 'party' } };
    expect(readLabLightState(fixture, state)).toEqual(readLabLightState(fixture, state));
    expect(readLabLightState(fixture, state)).toMatchObject({ brightness: 40, colorHex: '#B38CFF' });
    expect(readLabLightState(fixture, { ...state, settings: { lightEffect: 'none' } }).brightness).toBe(50);
  });

  it('bounds restored inputs and matches Three.js linear RGB conversion', () => {
    expect(readLabLightState(fixture, { on: true, level: Infinity, settings: { colorTempK: NaN, color: 'invalid' } }))
      .toMatchObject({ brightness: 0, colorTemperature: 3200, colorHex: '#ffe2b8' });
    expect(lightTemperatureColor(-100)).toBe(lightTemperatureColor(2000));
    expect(lightTemperatureColor(Infinity)).toBe(lightTemperatureColor(3200));
    expect(lightTemperatureColor(99999)).toBe(lightTemperatureColor(6500));
    for (const color of ['#ffe2b8', '#B38CFF', '#ff0000', '#003366']) {
      const expected = new Color(color).toArray();
      linearLightColor(color).forEach((channel, index) => expect(channel).toBeCloseTo(expected[index], 8));
    }
  });
});
