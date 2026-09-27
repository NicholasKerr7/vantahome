import React from 'react';
import { act, render } from '@testing-library/react-native';
import { FilamentLight } from '../FilamentLight';

const mockCallbacks = new Set<(frame: { timeSinceLastFrame: number }) => void>();
const mockCleanupQueue: Array<() => void> = [];
const mockLifecycle: string[] = [];
const mockEntity = { id: 42 };
const mockCreate = jest.fn(() => mockEntity);
const mockIntensity = jest.fn();
const mockColor = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn(() => { mockLifecycle.push('remove'); });
const mockDestroy = jest.fn(() => { mockLifecycle.push('destroy'); });
type CleanupThenable = {
  then: (fulfilled?: (value: void) => unknown, rejected?: (reason: unknown) => unknown) => CleanupThenable;
};

/** Mirror WorkletsCore's native thenable: it supports then's rejection handler, but no catch. */
const mockRunAsync = jest.fn((callback: () => void) => {
  let onRejected: ((reason: unknown) => unknown) | undefined;
  const result: CleanupThenable = {
    then: (_fulfilled, rejected) => {
      onRejected = rejected;
      return result;
    },
  };
  mockCleanupQueue.push(() => {
    try {
      callback();
    } catch (error) {
      onRejected?.(error);
    }
  });
  return result;
});
const mockContext = {
  lightManager: { createLightEntity: mockCreate, setIntensity: mockIntensity, setColor: mockColor, destroy: mockDestroy },
  scene: { addEntity: mockAdd, removeEntity: mockRemove },
  workletContext: { runAsync: mockRunAsync },
};

jest.mock('react-native-filament', () => ({
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

/** Execute a native frame without mocking the component's ownership decisions. */
function frame(dt = 0.016) {
  act(() => { mockCallbacks.forEach((callback) => callback({ timeSinceLastFrame: dt })); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCallbacks.clear();
  mockCleanupQueue.length = 0;
  mockLifecycle.length = 0;
});

test('creates one light on the render thread and updates it without nested worklets', () => {
  const onError = jest.fn();
  const { rerender, unmount } = render(<FilamentLight type="point" intensity={500} colorKelvin={2700}
    position={[1, 2, 3]} falloffRadius={2.5} onError={onError} />);
  expect(mockCreate).not.toHaveBeenCalled();
  frame();
  expect(mockCreate).toHaveBeenCalledWith('point', 2700, 500, undefined, [1, 2, 3], undefined, 2.5, undefined);
  expect(mockAdd).toHaveBeenCalledWith(mockEntity);
  frame();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  rerender(<FilamentLight type="point" intensity={0} colorKelvin={9000}
    position={[1, 2, 3]} falloffRadius={2.5} onError={onError} />);
  frame();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockIntensity).toHaveBeenCalledWith(mockEntity, 0);
  expect(mockColor).toHaveBeenCalledWith(mockEntity, expect.arrayContaining([expect.any(Number)]));
  const color = mockColor.mock.calls[0][1] as number[];
  expect(color).toHaveLength(3);
  expect(color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1)).toBe(true);
  frame();
  expect(mockIntensity).toHaveBeenCalledTimes(1);
  expect(mockColor).toHaveBeenCalledTimes(1);
  expect(mockRunAsync).not.toHaveBeenCalled();
  unmount();
});

test('stops queued frames before removing and destroying the owned native light', () => {
  const { unmount } = render(<FilamentLight type="directional" intensity={18000} colorKelvin={6000}
    direction={[0, -1, 0]} castShadows onError={jest.fn()} />);
  frame();
  const queuedFrame = [...mockCallbacks][0];
  unmount();
  expect(mockRunAsync).toHaveBeenCalledTimes(1);
  act(() => { queuedFrame({ timeSinceLastFrame: 0.016 }); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockDestroy).not.toHaveBeenCalled();
  act(() => { mockCleanupQueue.forEach((callback) => callback()); });
  expect(mockRemove).toHaveBeenCalledWith(mockEntity);
  expect(mockDestroy).toHaveBeenCalledWith(mockEntity);
  expect(mockLifecycle).toEqual(['remove', 'destroy']);
  act(() => { mockCleanupQueue.forEach((callback) => callback()); });
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});

test('closing before the first frame creates no light and cleanup remains safe', () => {
  const { unmount } = render(<FilamentLight type="point" intensity={0} colorKelvin={2800} onError={jest.fn()} />);
  unmount();
  act(() => { mockCleanupQueue.forEach((callback) => callback()); });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockDestroy).not.toHaveBeenCalled();
});

test('reports a native thenable rejection without calling an unsupported catch method', () => {
  const onError = jest.fn();
  const { unmount } = render(<FilamentLight type="point" intensity={0} colorKelvin={2800} onError={onError} />);
  frame();
  mockDestroy.mockImplementationOnce(() => { throw new Error('Native cleanup failed'); });
  unmount();
  expect(mockRunAsync.mock.results[0].value).not.toHaveProperty('catch');
  expect(onError).not.toHaveBeenCalled();
  act(() => { mockCleanupQueue.forEach((callback) => callback()); });
  expect(onError).toHaveBeenCalledTimes(1);
});

test('passes a solar spotlight cone through the complete eight-argument native contract', () => {
  render(<FilamentLight type="spot" intensity={200000} colorKelvin={3000}
    position={[1, 3.5, -2]} direction={[0, -1, 0]} falloffRadius={9}
    spotLightCone={[0.01, 0.88]} onError={jest.fn()} />);
  frame();
  expect(mockCreate).toHaveBeenCalledWith('spot', 3000, 200000, [0, -1, 0], [1, 3.5, -2], undefined, 9, [0.01, 0.88]);
});

test('lightning pulses only during an animated storm and stops immediately when motion is disabled', () => {
  const onError = jest.fn();
  const { rerender } = render(<FilamentLight type="directional" intensity={640} colorKelvin={10000}
    flash={{ weather: 'storm', motion: true, peakIntensity: 7000 }} onError={onError} />);
  for (let index = 0; index < 400; index += 1) frame(0.08);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockIntensity.mock.calls.some(([, intensity]) => intensity > 640)).toBe(true);
  expect(mockIntensity.mock.calls.every(([, intensity]) => intensity >= 640 && intensity <= 7640)).toBe(true);
  rerender(<FilamentLight type="directional" intensity={640} colorKelvin={10000}
    flash={{ weather: 'storm', motion: false, peakIntensity: 7000 }} onError={onError} />);
  frame();
  const calls = mockIntensity.mock.calls.length;
  expect(mockIntensity).toHaveBeenLastCalledWith(mockEntity, 640);
  for (let index = 0; index < 200; index += 1) frame(0.08);
  expect(mockIntensity).toHaveBeenCalledTimes(calls);
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
