import React from 'react';
import { PixelRatio } from 'react-native';
import { act, cleanup, render } from '@testing-library/react-native';
import { FilamentRain } from '../FilamentRain';
import { INITIAL_LAB_SETTINGS } from '../protocol';

jest.mock('../../../../assets/renderer-lab/filament-rain.glb', () => 10, { virtual: true });
jest.mock('../../../../assets/renderer-lab/filament-water.filamat', () => 11, { virtual: true });
jest.mock('../../../../assets/renderer-lab/filament-wet.filamat', () => 12, { virtual: true });

const mockLifecycle: string[] = [];
const mockCallbacks = new Set<(frame: { timeSinceLastFrame: number }) => void>();
const mockTasks: (() => void)[] = [];
let mockDeferTasks = false;
let mockHeight = 720;
let mockFailAttach = '';

/** Track native uniforms without simulating GPU particles or duplicating their shader law. */
function mockMakeInstance(name: string) {
  const floats = new Map<string, number>();
  const vectors = new Map<string, number[]>();
  return {
    name, floats, vectors,
    setFloatParameter: jest.fn((key: string, value: number) => { floats.set(key, value); }),
    setFloat3Parameter: jest.fn((key: string, value: number[]) => { vectors.set(key, value); }),
  };
}

/** Mirror the SDK's tracked-instance ownership: only owners have a release method. */
function mockMakeOwner(name: string) {
  const instances: ReturnType<typeof mockMakeInstance>[] = [];
  const defaultInstance = mockMakeInstance(`${name}-default`);
  return {
    name, instances, defaultInstance,
    createInstance: jest.fn(() => {
      const instance = mockMakeInstance(`${name}-${instances.length}`);
      instances.push(instance);
      return instance;
    }),
    getDefaultInstance: jest.fn(() => defaultInstance),
    release: jest.fn(() => { mockLifecycle.push(`release:${name}`); }),
  };
}

const mockOwners: ReturnType<typeof mockMakeOwner>[] = [];
const mockOriginals = new Map<string, { name: string }>();
const mockAsset = {
  isValid: true,
  getFirstEntityByName: jest.fn((name: string) => ({ id: name })),
};
const mockWaterBuffer = { name: 'water' };
const mockWetBuffer = { name: 'wet' };
let mockActiveWaterBuffer = mockWaterBuffer;
const mockCreateMaterial = jest.fn((buffer: { name: string }) => {
  const owner = mockMakeOwner(buffer.name);
  mockOwners.push(owner);
  return owner;
});
const mockSetMaterial = jest.fn((entity: { id: string }, _index: number, instance: { name: string }) => {
  if (instance.name === mockFailAttach) throw new Error('Material attachment failed');
  mockLifecycle.push(`material:${entity.id}:${instance.name}`);
});
const mockRemoveEntities = jest.fn(() => { mockLifecycle.push('remove'); });
const mockAddEntities = jest.fn(() => { mockLifecycle.push('add'); });
const mockCastShadow = jest.fn();
const mockReceiveShadow = jest.fn();

/** Model the SDK's thenable, including queued setup/cleanup without relying on catch(). */
const mockRunAsync = jest.fn((callback: () => unknown) => ({
  then: (resolve?: (value: unknown) => void, reject?: (error: unknown) => void) => {
    const run = () => {
      let result: unknown;
      try { result = callback(); } catch (error) { reject?.(error); return; }
      resolve?.(result);
    };
    if (mockDeferTasks) mockTasks.push(run); else run();
  },
}));
const mockContext = {
  engine: { createMaterial: mockCreateMaterial },
  scene: { removeEntities: mockRemoveEntities, addEntities: mockAddEntities },
  view: { getViewport: () => ({ height: mockHeight }) },
  renderableManager: {
    getPrimitiveCount: () => 1,
    getMaterialInstanceAt: (entity: { id: string }) => {
      const original = { name: `original:${entity.id}` };
      mockOriginals.set(entity.id, original);
      return original;
    },
    setMaterialInstanceAt: mockSetMaterial,
    setCastShadow: mockCastShadow,
    setReceiveShadow: mockReceiveShadow,
  },
  workletContext: { runAsync: mockRunAsync },
};

jest.mock('react-native-filament', () => ({
  useModel: () => {
    require('react').useEffect(() => () => { mockLifecycle.push('model-cleanup'); }, []);
    return { state: 'loaded', asset: mockAsset };
  },
  useBuffer: ({ source }: { source: number }) => source === 11 ? mockActiveWaterBuffer : mockWetBuffer,
  useFilamentContext: () => mockContext,
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

/** Advance only registered native render callbacks. */
function frame(timeSinceLastFrame = 1 / 60) {
  act(() => { mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame })); });
}

/** Access the four distinct material instances installed on the native water asset. */
function waterInstances() {
  return [...mockOwners[0].instances, mockOwners[1].defaultInstance];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLifecycle.length = 0;
  mockOwners.length = 0;
  mockTasks.length = 0;
  mockOriginals.clear();
  mockCallbacks.clear();
  mockDeferTasks = false;
  mockHeight = 720;
  mockFailAttach = '';
  mockAsset.isValid = true;
  mockActiveWaterBuffer = mockWaterBuffer;
  jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('creates two material owners once and only advances four time uniforms on ordinary rain frames', () => {
  const onReady = jest.fn();
  const settings = { ...INITIAL_LAB_SETTINGS, weather: 'storm' as const, windSpeed: 48, windDirection: 55 };
  const { rerender } = render(<FilamentRain settings={settings} onReady={onReady} />);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(mockCreateMaterial).toHaveBeenCalledTimes(2);
  expect(mockOwners[0].createInstance).toHaveBeenCalledTimes(3);
  expect(mockOwners[1].getDefaultInstance).toHaveBeenCalledTimes(1);
  expect(mockSetMaterial).toHaveBeenCalledTimes(4);
  expect(mockCastShadow.mock.calls.every((call) => call[1] === false)).toBe(true);
  expect(mockReceiveShadow.mock.calls.every((call) => call[1] === false)).toBe(true);
  frame();
  const instances = waterInstances();
  instances.forEach((instance) => expect(instance.floats.get('intensity')).toBe(3));
  instances.slice(0, 3).forEach((instance, index) => expect(instance.floats.get('kind')).toBe(index));
  const calls = instances.map(({ setFloatParameter }) => setFloatParameter.mock.calls.length);
  frame();
  instances.forEach((instance, index) => {
    expect(instance.setFloatParameter).toHaveBeenCalledTimes(calls[index] + 1);
    expect(instance.floats.get('time')).toBeCloseTo(1 / 60);
  });
  rerender(<FilamentRain settings={{ ...settings, night: true }} onReady={onReady} />);
  frame();
  instances.forEach((instance) => expect(instance.floats.get('night')).toBe(1));
  expect(mockCreateMaterial).toHaveBeenCalledTimes(2);
  expect(mockSetMaterial).toHaveBeenCalledTimes(4);
  expect(onReady).toHaveBeenCalledTimes(1);
});

test('keeps wet intensity while reduced motion stops water updates, and clear removes wetness', () => {
  const onReady = jest.fn();
  const storm = { ...INITIAL_LAB_SETTINGS, weather: 'storm' as const };
  const { rerender } = render(<FilamentRain settings={storm} onReady={onReady} />);
  frame(); frame();
  rerender(<FilamentRain settings={{ ...storm, motion: false }} onReady={onReady} />);
  frame();
  const instances = waterInstances();
  const counts = instances.map(({ setFloatParameter }) => setFloatParameter.mock.calls.length);
  const pausedTime = instances[0].floats.get('time');
  for (let index = 0; index < 10; index++) frame();
  instances.forEach((instance, index) => {
    expect(instance.floats.get('motion')).toBe(0);
    expect(instance.floats.get('intensity')).toBe(3);
    expect(instance.floats.get('time')).toBe(pausedTime);
    expect(instance.setFloatParameter).toHaveBeenCalledTimes(counts[index]);
  });
  rerender(<FilamentRain settings={{ ...INITIAL_LAB_SETTINGS, motion: false }} onReady={onReady} />);
  frame();
  instances.forEach((instance) => {
    expect(instance.floats.get('intensity')).toBe(0);
    expect(instance.floats.get('time')).toBe(0);
  });
});

test('resets deterministically and updates viewport and bounded meteorological wind without recreating resources', () => {
  const onReady = jest.fn();
  const storm = { ...INITIAL_LAB_SETTINGS, weather: 'storm' as const, windSpeed: 180, windDirection: 90 };
  const { rerender } = render(<FilamentRain settings={storm} onReady={onReady} />);
  frame(); frame(10);
  const instances = waterInstances();
  expect(instances[0].floats.get('time')).toBe(0.08);
  expect(instances[0].vectors.get('wind')?.[0]).toBeCloseTo(55 / 650);
  expect(instances[0].vectors.get('wind')?.[2]).toBeCloseTo(0);
  mockHeight = 844;
  rerender(<FilamentRain settings={{ ...storm, resetKey: 1, motion: false }} onReady={onReady} />);
  frame();
  instances.forEach((instance) => expect(instance.floats.get('time')).toBe(0));
  instances.slice(0, 3).forEach((instance) => expect(instance.floats.get('viewportHeight')).toBe(422));
  expect(instances[3].floats.has('viewportHeight')).toBe(false);
  const counts = instances.map(({ setFloatParameter }) => setFloatParameter.mock.calls.length);
  frame();
  instances.forEach((instance, index) => expect(instance.setFloatParameter).toHaveBeenCalledTimes(counts[index]));
  expect(mockCreateMaterial).toHaveBeenCalledTimes(2);
});

test('removes renderables, restores original instances, and releases owners before model cleanup', () => {
  const { unmount } = render(<FilamentRain settings={{ ...INITIAL_LAB_SETTINGS, weather: 'storm' }} onReady={jest.fn()} />);
  frame();
  const queuedFrame = Array.from(mockCallbacks)[0];
  const instances = waterInstances();
  const counts = instances.map(({ setFloatParameter }) => setFloatParameter.mock.calls.length);
  unmount();
  act(() => queuedFrame({ timeSinceLastFrame: 0.08 }));
  instances.forEach((instance, index) => expect(instance.setFloatParameter).toHaveBeenCalledTimes(counts[index]));
  expect(mockRemoveEntities).toHaveBeenCalledTimes(1);
  expect(mockSetMaterial).toHaveBeenCalledTimes(8);
  for (const [id, original] of mockOriginals) expect(mockSetMaterial).toHaveBeenCalledWith({ id }, 0, original);
  for (const owner of mockOwners) expect(owner.release).toHaveBeenCalledTimes(1);
  const removed = mockLifecycle.indexOf('remove');
  const restored = mockLifecycle.findLastIndex((event) => event.includes(':original:'));
  expect(removed).toBeLessThan(restored);
  expect(restored).toBeLessThan(mockLifecycle.indexOf('release:water'));
  expect(mockLifecycle.indexOf('release:wet')).toBeLessThan(mockLifecycle.indexOf('model-cleanup'));
  expect(mockCallbacks.size).toBe(0);
});

test('does not dereference borrowed instances after useModel has already released its asset', () => {
  const { unmount } = render(<FilamentRain settings={INITIAL_LAB_SETTINGS} onReady={jest.fn()} />);
  mockAsset.isValid = false;
  unmount();
  expect(mockRemoveEntities).not.toHaveBeenCalled();
  expect(mockSetMaterial).toHaveBeenCalledTimes(4);
  mockOwners.forEach((owner) => expect(owner.release).toHaveBeenCalledTimes(1));
});

test('reattaches the same asset after resource cleanup and initializes fresh instances on a material reload', () => {
  const onReady = jest.fn();
  const settings = { ...INITIAL_LAB_SETTINGS, weather: 'heavy' as const };
  const { rerender } = render(<FilamentRain settings={settings} onReady={onReady} />);
  frame(); frame();
  const oldOwners = [...mockOwners];
  mockActiveWaterBuffer = { ...mockWaterBuffer };
  rerender(<FilamentRain settings={settings} onReady={onReady} />);
  frame();
  oldOwners.forEach((owner) => expect(owner.release).toHaveBeenCalledTimes(1));
  expect(mockRemoveEntities).toHaveBeenCalledTimes(1);
  expect(mockAddEntities).toHaveBeenCalledTimes(2);
  expect(mockLifecycle.lastIndexOf('add')).toBeGreaterThan(mockLifecycle.indexOf('release:wet'));
  const replacementInstances = [...mockOwners[2].instances, mockOwners[3].defaultInstance];
  replacementInstances.forEach((instance) => {
    expect(instance.floats.get('time')).toBe(0);
    expect(instance.floats.get('intensity')).toBe(2);
  });
});

test('closing before queued initialization runs creates no resources and never emits readiness', () => {
  mockDeferTasks = true;
  const onReady = jest.fn();
  const { unmount } = render(<FilamentRain settings={INITIAL_LAB_SETTINGS} onReady={onReady} />);
  unmount();
  act(() => { mockTasks.splice(0).forEach((task) => task()); });
  expect(mockCreateMaterial).not.toHaveBeenCalled();
  expect(mockSetMaterial).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
});

test('rolls back an incomplete material installation before surfacing the initialization failure', () => {
  const expectedError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockFailAttach = 'water-1';
  expect(() => render(<FilamentRain settings={INITIAL_LAB_SETTINGS} onReady={jest.fn()} />)).toThrow('Material attachment failed');
  expect(mockSetMaterial).toHaveBeenCalledWith({ id: 'lab-filament-rain' }, 0,
    mockOriginals.get('lab-filament-rain'));
  expect(mockLifecycle.findLastIndex((event) => event.includes(':original:'))).toBeLessThan(mockLifecycle.indexOf('release:water'));
  mockOwners.forEach((owner) => expect(owner.release).toHaveBeenCalledTimes(1));
  expectedError.mockRestore();
});
