import React from 'react';
import { act, render } from '@testing-library/react-native';
import type { FilamentModel as NativeModel } from 'react-native-filament';
import { FilamentModel } from '../FilamentModel';
import { INITIAL_LAB_SETTINGS } from '../protocol';

const mockFloat3 = jest.fn();
const mockFloat4 = jest.fn();
const mockMaterial = { setFloat3Parameter: mockFloat3, setFloat4Parameter: mockFloat4 };
const mockFindEntity = jest.fn(() => ({ id: 7 }));
const mockGetMaterial = jest.fn(() => mockMaterial);
const mockCallbacks = new Set<(frame: { timeSinceLastFrame: number }) => void>();
const mockMatrix = { translate: jest.fn(), scaling: jest.fn() };
const mockSetTransform = jest.fn();
let mockModel: NativeModel;
const mockContext = {
  transformManager: { getTransform: jest.fn(() => mockMatrix), setTransform: mockSetTransform },
  renderableManager: { getMaterialInstanceAt: mockGetMaterial },
};

jest.mock('react-native-filament', () => ({
  useFilamentContext: () => mockContext,
  useModel: () => mockModel,
  ModelRenderer: () => null,
  RenderCallbackContext: {
    useRenderCallback: (callback: (frame: { timeSinceLastFrame: number }) => void, dependencies: unknown[]) => {
      require('react').useEffect(() => {
        mockCallbacks.add(callback);
        return () => { mockCallbacks.delete(callback); };
      }, dependencies);
    },
  },
  useWorkletEffect: (callback: () => void) => require('react').useEffect(callback),
}));
jest.mock('react-native-worklets-core', () => ({
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCallbacks.clear();
  mockMatrix.translate.mockReturnValue(mockMatrix);
  mockMatrix.scaling.mockReturnValue(mockMatrix);
  mockModel = {
    state: 'loaded', rootEntity: { id: 1 },
    asset: { getFirstEntityByName: mockFindEntity }, boundingBox: {},
  } as unknown as NativeModel;
});

test('sets all fixture emissive factors using the shader-compatible float3 native call', () => {
  const onLoaded = jest.fn();
  const { rerender } = render(<FilamentModel source={1} kind="fixtures"
    settings={{ ...INITIAL_LAB_SETTINGS, lights: true }} onLoaded={onLoaded} />);
  expect(mockGetMaterial).toHaveBeenCalledTimes(3);
  expect(mockFloat3).toHaveBeenCalledTimes(3);
  expect(mockFloat3).toHaveBeenCalledWith('emissiveFactor', [80, 60.8, 33.6]);
  expect(mockFloat4).not.toHaveBeenCalled();
  mockFloat3.mockClear();
  rerender(<FilamentModel source={1} kind="fixtures"
    settings={{ ...INITIAL_LAB_SETTINGS, lights: false }} onLoaded={onLoaded} />);
  expect(mockGetMaterial).toHaveBeenCalledTimes(3);
  expect(mockFloat3).toHaveBeenCalledTimes(3);
  expect(mockFloat3).toHaveBeenCalledWith('emissiveFactor', [0, 0, 0]);
  expect(mockFloat4).not.toHaveBeenCalled();
});

test('does not access native materials before the model finishes loading', () => {
  mockModel = { state: 'loading' };
  render(<FilamentModel source={1} kind="fixtures" settings={INITIAL_LAB_SETTINGS} onLoaded={jest.fn()} />);
  expect(mockGetMaterial).not.toHaveBeenCalled();
  expect(mockFloat3).not.toHaveBeenCalled();
});

test('does not modify materials belonging to house or landscape models', () => {
  render(<FilamentModel source={1} kind="house" settings={INITIAL_LAB_SETTINGS} onLoaded={jest.fn()} />);
  expect(mockGetMaterial).not.toHaveBeenCalled();
  expect(mockFloat3).not.toHaveBeenCalled();
  act(() => { mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame: 0.016 })); });
  expect(mockContext.transformManager.getTransform).not.toHaveBeenCalled();
  expect(mockSetTransform).not.toHaveBeenCalled();
});

test('the four solar diffusers follow night mode independently of the bedroom switch', () => {
  const onLoaded = jest.fn();
  const { rerender } = render(<FilamentModel source={1} kind="solar"
    settings={{ ...INITIAL_LAB_SETTINGS, view: 'property', night: true, lights: false }} onLoaded={onLoaded} />);
  expect(mockGetMaterial).toHaveBeenCalledTimes(4);
  expect(mockFloat3).toHaveBeenCalledWith('emissiveFactor', [40960, 31129.6, 17203.2]);
  mockFloat3.mockClear();
  rerender(<FilamentModel source={1} kind="solar"
    settings={{ ...INITIAL_LAB_SETTINGS, view: 'property', night: false, lights: true }} onLoaded={onLoaded} />);
  expect(mockFloat3).toHaveBeenCalledTimes(4);
  expect(mockFloat3).toHaveBeenCalledWith('emissiveFactor', [0, 0, 0]);
});

test('the gate reaches its exact target and stops submitting matrices while settled', () => {
  const onLoaded = jest.fn();
  const { rerender } = render(<FilamentModel source={1} kind="gate"
    settings={INITIAL_LAB_SETTINGS} onLoaded={onLoaded} />);
  rerender(<FilamentModel source={1} kind="gate"
    settings={{ ...INITIAL_LAB_SETTINGS, gate: 100 }} onLoaded={onLoaded} />);
  act(() => {
    for (let index = 0; index < 150; index += 1) {
      mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame: 0.08 }));
    }
  });
  expect(mockMatrix.translate).toHaveBeenLastCalledWith([-9.79 + 6.8, 0.575, -22.37]);
  const count = mockSetTransform.mock.calls.length;
  act(() => { mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame: 0.08 })); });
  expect(mockSetTransform).toHaveBeenCalledTimes(count);
  rerender(<FilamentModel source={1} kind="gate"
    settings={{ ...INITIAL_LAB_SETTINGS, gate: 0, motion: false }} onLoaded={onLoaded} />);
  act(() => { mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame: 0.08 })); });
  expect(mockMatrix.translate).toHaveBeenLastCalledWith([-9.79, 0.575, -22.37]);
});

test('fixture diffusers follow independent color, dimming, and power while retaining night gain', () => {
  render(<FilamentModel source={1} kind="fixtures" onLoaded={jest.fn()}
    settings={{ ...INITIAL_LAB_SETTINGS, night: true, lightStates: {
      ceiling: { on: true, brightness: 25, colorTemperature: 3200, colorHex: '#FF0000' },
      left: { on: true, brightness: 50, colorTemperature: 3200, colorHex: '#0000FF' },
      right: { on: false, brightness: 100, colorTemperature: 3200, colorHex: '#00FF00' },
    } }} />);
  expect(mockFloat3.mock.calls).toEqual([
    ['emissiveFactor', [10240, 0, 0]], ['emissiveFactor', [0, 0, 20480]], ['emissiveFactor', [0, 0, 0]],
  ]);
});
