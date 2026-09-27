import React from 'react';
import { render } from '@testing-library/react-native';
import { FilamentLighting } from '../FilamentLighting';
import { INITIAL_LAB_SETTINGS } from '../protocol';
import { BEDROOM_LIGHT_RIG, BEDROOM_LIGHT_LINEAR_COLOR, BEDROOM_LIGHT_RADIUS } from '../../../../packages/home-scene/src/renderer-lab/bedroomLighting';
import { filamentEnvironment, filamentLightGain } from '../nativeLightingConfig';

const mockLight = jest.fn((_props: unknown) => null);
jest.mock('../FilamentLight', () => ({ FilamentLight: (props: unknown) => mockLight(props) }));
jest.mock('react-native-filament', () => ({ EnvironmentalLight: () => null, Skybox: () => null }));

/** Read only public light props, leaving native resource management to its own tests. */
function practicalLights() {
  return mockLight.mock.calls.map(([props]) => props as unknown as {
    type: string; intensity: number; position: number[]; color: number[]; falloffRadius: number;
  })
    .filter(({ type }) => type !== 'directional');
}

beforeEach(() => { mockLight.mockClear(); });

test('bedroom practicals keep their calibrated output and shared alignment through day/night changes', () => {
  const onError = jest.fn();
  const { rerender } = render(<FilamentLighting settings={INITIAL_LAB_SETTINGS} onError={onError} />);
  const daytime = practicalLights();
  mockLight.mockClear();
  rerender(<FilamentLighting settings={{ ...INITIAL_LAB_SETTINGS, night: true }} onError={onError} />);
  const night = practicalLights();
  expect(night).toHaveLength(3);
  night.forEach((light, index) => {
    expect(light.intensity).toBe(daytime[index].intensity);
    expect(light.intensity).toBeGreaterThan(0);
    expect(light.position).toEqual(BEDROOM_LIGHT_RIG[index].position);
    expect(light.color).toEqual(BEDROOM_LIGHT_LINEAR_COLOR);
    expect(light.falloffRadius).toBe(BEDROOM_LIGHT_RADIUS);
  });
  mockLight.mockClear();
  rerender(<FilamentLighting settings={{ ...INITIAL_LAB_SETTINGS, night: true, lights: false }} onError={onError} />);
  expect(practicalLights().every(({ intensity }) => intensity === 0)).toBe(true);
});

test('night fill stays below daylight, clouds reduce illumination, and rain exposure remains unchanged', () => {
  for (const night of [false, true]) {
    const clear = filamentEnvironment(night);
    let previous = clear;
    for (const weather of ['light', 'heavy', 'storm'] as const) {
      const overcast = filamentEnvironment(night, weather);
      expect(overcast.ambient).toBeGreaterThan(0);
      expect(overcast.directional).toBeGreaterThan(0);
      expect(overcast.ambient).toBeLessThan(previous.ambient);
      expect(overcast.directional).toBeLessThan(previous.directional);
      previous = overcast;
    }
  }
  const day = filamentEnvironment(false);
  const night = filamentEnvironment(true);
  expect(night.ambient).toBeLessThan(day.ambient);
  expect(night.directional).toBeLessThan(day.directional);
  expect(night.color[2]).toBeGreaterThan(night.color[0]);
  expect(day.color[0]).toBeGreaterThan(day.color[2]);
  expect(filamentLightGain(false)).toBe(1);
  expect(filamentLightGain(true)).toBe(512);
});

test('all four corner downlights switch on at night independently of bedroom power', () => {
  const onError = jest.fn();
  const { rerender } = render(<FilamentLighting
    settings={{ ...INITIAL_LAB_SETTINGS, view: 'property' }} onError={onError} />);
  expect(practicalLights()).toHaveLength(4);
  expect(practicalLights().every(({ intensity }) => intensity === 0)).toBe(true);
  mockLight.mockClear();
  rerender(<FilamentLighting settings={{ ...INITIAL_LAB_SETTINGS, view: 'property', night: true, lights: false }} onError={onError} />);
  expect(practicalLights()).toHaveLength(4);
  expect(practicalLights().every(({ type, intensity }) => type === 'spot' && intensity > 0)).toBe(true);
});

test('a thunderstorm shares the one directional light supported by Filament', () => {
  render(<FilamentLighting settings={{ ...INITIAL_LAB_SETTINGS, view: 'property', weather: 'storm' }} onError={jest.fn()} />);
  const directional = mockLight.mock.calls.map(([props]) => props as { type: string; flash?: unknown })
    .filter(({ type }) => type === 'directional');
  expect(directional).toHaveLength(1);
  expect(directional[0].flash).toEqual({ weather: 'storm', motion: true, peakIntensity: 16000 });
});
