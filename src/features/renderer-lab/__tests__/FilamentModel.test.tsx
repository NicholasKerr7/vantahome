import React from 'react';
import { render } from '@testing-library/react-native';
import type { FilamentModel as NativeModel } from 'react-native-filament';
import { FilamentModel } from '../FilamentModel';
import { INITIAL_LAB_SETTINGS } from '../protocol';

const mockFloat3 = jest.fn();
const mockFloat4 = jest.fn();
const mockMaterial = { setFloat3Parameter: mockFloat3, setFloat4Parameter: mockFloat4 };
const mockFindEntity = jest.fn(() => ({ id: 7 }));
const mockGetMaterial = jest.fn(() => mockMaterial);
let mockModel: NativeModel;
const mockContext = {
  transformManager: { getTransform: jest.fn(() => ({})) },
  renderableManager: { getMaterialInstanceAt: mockGetMaterial },
};

jest.mock('react-native-filament', () => ({
  useFilamentContext: () => mockContext,
  useModel: () => mockModel,
  ModelRenderer: () => null,
  RenderCallbackContext: { useRenderCallback: jest.fn() },
  useWorkletEffect: (callback: () => void) => require('react').useEffect(callback),
}));
jest.mock('react-native-worklets-core', () => ({
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
}));

beforeEach(() => {
  jest.clearAllMocks();
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
  expect(mockFloat3).toHaveBeenCalledWith('emissiveFactor', [1, 0.76, 0.42]);
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
});
