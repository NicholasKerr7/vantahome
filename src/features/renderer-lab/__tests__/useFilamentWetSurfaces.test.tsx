import { renderHook } from '@testing-library/react-native';
import type { FilamentAsset } from 'react-native-filament';
import type { WeatherKind } from '../../../../packages/home-scene/src/renderer-lab/weather';
import { useFilamentWetSurfaces } from '../useFilamentWetSurfaces';

const mockRoughness = jest.fn();
const mockColor = jest.fn();
const mockMaterial = {
  getFloatParameter: jest.fn(() => 0.85),
  getFloat4Parameter: jest.fn(() => [0.12, 0.14, 0.145, 1]),
  setFloatParameter: mockRoughness, setFloat4Parameter: mockColor,
};
const mockGetMaterial = jest.fn(() => mockMaterial);
const mockFindEntity = jest.fn((name: string) => name === 'landscape-Site Road' ? { id: 1 } : undefined);
const asset = { getFirstEntityByName: mockFindEntity } as unknown as FilamentAsset;

jest.mock('react-native-filament', () => ({
  useFilamentContext: () => ({ renderableManager: { getMaterialInstanceAt: mockGetMaterial } }),
  useWorkletEffect: (callback: () => void) => require('react').useEffect(callback),
}));

beforeEach(() => { jest.clearAllMocks(); });

test('wet pavement becomes darker and smoother, then restores its exact dry values', () => {
  const { rerender } = renderHook(({ weather }: { weather: WeatherKind }) =>
    useFilamentWetSurfaces(asset, 'landscape', weather), { initialProps: { weather: 'storm' as WeatherKind } });
  expect(mockRoughness).toHaveBeenLastCalledWith('roughnessFactor', 0.24);
  expect(mockColor).toHaveBeenLastCalledWith('baseColorFactor', [0.12 * 0.8, 0.14 * 0.8, 0.145 * 0.8, 1]);
  rerender({ weather: 'clear' });
  expect(mockRoughness).toHaveBeenLastCalledWith('roughnessFactor', 0.85);
  expect(mockColor).toHaveBeenLastCalledWith('baseColorFactor', [0.12, 0.14, 0.145, 1]);
  expect(mockFindEntity.mock.calls.map(([name]) => name)).not.toContain('landscape-Site Grass');
});

test('skips unloaded assets and device models', () => {
  renderHook(() => useFilamentWetSurfaces(undefined, 'landscape', 'storm'));
  renderHook(() => useFilamentWetSurfaces(asset, 'fixtures', 'storm'));
  expect(mockGetMaterial).not.toHaveBeenCalled();
  expect(mockRoughness).not.toHaveBeenCalled();
});
