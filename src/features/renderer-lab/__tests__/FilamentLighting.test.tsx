import React from 'react';
import { render } from '@testing-library/react-native';
import { FilamentLighting } from '../FilamentLighting';
import { INITIAL_LAB_SETTINGS } from '../protocol';

const mockLight = jest.fn((_props: unknown) => null);
jest.mock('../FilamentLight', () => ({ FilamentLight: (props: unknown) => mockLight(props) }));
jest.mock('react-native-filament', () => ({ EnvironmentalLight: () => null, Skybox: () => null }));

/** Read only public light props, leaving native resource management to its own tests. */
function practicalLights() {
  return mockLight.mock.calls.map(([props]) => props as unknown as { type: string; intensity: number; position: number[] })
    .filter(({ type }) => type !== 'directional');
}

beforeEach(() => { mockLight.mockClear(); });

test('night exposure makes the bedroom lamps useful while preserving their off state and positions', () => {
  const onError = jest.fn();
  const { rerender } = render(<FilamentLighting settings={INITIAL_LAB_SETTINGS} onError={onError} />);
  const daytime = practicalLights();
  mockLight.mockClear();
  rerender(<FilamentLighting settings={{ ...INITIAL_LAB_SETTINGS, night: true }} onError={onError} />);
  const night = practicalLights();
  expect(night).toHaveLength(3);
  night.forEach((light, index) => {
    expect(light.intensity).toBe(daytime[index].intensity * 512);
    expect(light.position).toEqual(daytime[index].position);
  });
  mockLight.mockClear();
  rerender(<FilamentLighting settings={{ ...INITIAL_LAB_SETTINGS, night: true, lights: false }} onError={onError} />);
  expect(practicalLights().every(({ intensity }) => intensity === 0)).toBe(true);
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
