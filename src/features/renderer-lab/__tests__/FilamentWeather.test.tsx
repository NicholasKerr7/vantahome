import React from 'react';
import { act, render } from '@testing-library/react-native';
import { WEATHER_GROUPS } from '../../../../packages/home-scene/src/renderer-lab/weatherAnimation';
import { FilamentWeather } from '../FilamentWeather';
import { INITIAL_LAB_SETTINGS } from '../protocol';

const mockCallbacks = new Set<(frame: { timeSinceLastFrame: number }) => void>();
const mockFindEntity = jest.fn((name: string) => ({ id: name }));
const mockModel = { state: 'loaded', asset: { getFirstEntityByName: mockFindEntity } };
const mockSetTransform = jest.fn();
const mockCastShadow = jest.fn();
const mockReceiveShadow = jest.fn();
let mockWaterLoaded = true;
let mockWaterReady: () => void;
const mockMatrix = { scaling: jest.fn(), rotate: jest.fn(), translate: jest.fn() };
const mockContext = {
  transformManager: { createIdentityMatrix: () => mockMatrix, setTransform: mockSetTransform },
  renderableManager: { setCastShadow: mockCastShadow, setReceiveShadow: mockReceiveShadow },
};

jest.mock('react-native-filament', () => ({
  useModel: () => mockModel,
  useFilamentContext: () => mockContext,
  useWorkletEffect: (callback: () => void) => require('react').useEffect(callback, [mockModel.asset]),
  RenderCallbackContext: {
    useRenderCallback: (callback: (frame: { timeSinceLastFrame: number }) => void, dependencies: unknown[]) => {
      require('react').useEffect(() => {
        mockCallbacks.add(callback);
        return () => { mockCallbacks.delete(callback); };
      }, dependencies);
    },
  },
}));
jest.mock('react-native-worklets-core', () => ({
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
}));
jest.mock('../FilamentRain', () => ({
  FilamentRain: ({ onReady }: { onReady: () => void }) => {
    mockWaterReady = onReady;
    require('react').useEffect(() => { if (mockWaterLoaded) onReady(); }, [onReady]);
    return null;
  },
}));

/** Run the native callback with an explicit frame interval. */
function frame(dt: number) {
  act(() => { mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame: dt })); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCallbacks.clear();
  mockWaterLoaded = true;
  mockMatrix.scaling.mockReturnValue(mockMatrix);
  mockMatrix.rotate.mockReturnValue(mockMatrix);
  mockMatrix.translate.mockReturnValue(mockMatrix);
});

test('only foliage casts shadows and weather transforms are capped at 30 Hz', () => {
  const onLoaded = jest.fn();
  render(<FilamentWeather source={1} settings={{ ...INITIAL_LAB_SETTINGS, weather: 'storm', windSpeed: 45 }} onLoaded={onLoaded} />);
  expect(onLoaded).toHaveBeenCalledWith('rain');
  WEATHER_GROUPS.forEach((group) => {
    expect(mockCastShadow).toHaveBeenCalledWith({ id: group.name }, group.kind === 'plant');
  });
  const waterCount = WEATHER_GROUPS.filter(({ kind }) => kind !== 'plant').length;
  expect(mockSetTransform).toHaveBeenCalledTimes(waterCount);
  expect(mockMatrix.scaling.mock.calls.filter(([scale]) => scale.every((axis: number) => axis === 0))).toHaveLength(waterCount);
  frame(0.016);
  expect(mockSetTransform).toHaveBeenCalledTimes(WEATHER_GROUPS.length);
  frame(0.016);
  expect(mockSetTransform).toHaveBeenCalledTimes(WEATHER_GROUPS.length);
  frame(0.02);
  expect(mockSetTransform.mock.calls.length).toBeGreaterThan(WEATHER_GROUPS.length);
});

test('motion-off and clear states settle once and do not keep submitting native transforms', () => {
  const onLoaded = jest.fn();
  const { rerender, unmount } = render(<FilamentWeather source={1}
    settings={{ ...INITIAL_LAB_SETTINGS, weather: 'storm', motion: true }} onLoaded={onLoaded} />);
  frame(0.08);
  rerender(<FilamentWeather source={1}
    settings={{ ...INITIAL_LAB_SETTINGS, weather: 'storm', motion: false }} onLoaded={onLoaded} />);
  frame(0.08);
  const pausedCount = mockSetTransform.mock.calls.length;
  for (let index = 0; index < 10; index += 1) frame(0.08);
  expect(mockSetTransform).toHaveBeenCalledTimes(pausedCount);
  rerender(<FilamentWeather source={1} settings={INITIAL_LAB_SETTINGS} onLoaded={onLoaded} />);
  frame(0.08);
  const dryCount = mockSetTransform.mock.calls.length;
  frame(0.08);
  expect(mockSetTransform).toHaveBeenCalledTimes(dryCount);
  unmount();
  expect(mockCallbacks.size).toBe(0);
});

test('keeps the loading state until both the foliage asset and custom water shaders are ready', () => {
  mockWaterLoaded = false;
  const onLoaded = jest.fn();
  render(<FilamentWeather source={1} settings={INITIAL_LAB_SETTINGS} onLoaded={onLoaded} />);
  expect(onLoaded).not.toHaveBeenCalled();
  act(() => mockWaterReady());
  expect(onLoaded).toHaveBeenCalledTimes(1);
  expect(onLoaded).toHaveBeenCalledWith('rain');
});
