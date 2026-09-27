import { act, renderHook } from '@testing-library/react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useLabCamera } from '../useLabCamera';
import presets from '../../../../packages/home-scene/src/renderer-lab/presets.json';

const mockLookAt = jest.fn<void, [number[], number[], number[]]>();
// Mirror the native signature; the published four-argument TypeScript signature is incomplete.
const mockSetProjection = jest.fn<void, [number, number, number, number, 'vertical']>();
const mockGetAspectRatio = jest.fn(() => 1);
const mockContext = {
  camera: { lookAt: mockLookAt, setProjection: mockSetProjection },
  view: { getAspectRatio: mockGetAspectRatio },
};

jest.mock('react-native-filament', () => ({
  useFilamentContext: () => mockContext,
}));
jest.mock('react-native-worklets-core', () => ({
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
}));

const PRESET = { eye: [0, 6, 8], target: [0, 0, 0] };
type Point = [number, number, string?];

/** Construct only the native touch fields consumed by the camera's public handlers. */
function touchEvent(points: Point[], ended?: Point): GestureResponderEvent {
  const touches = points.map(([locationX, locationY, identifier], index) => ({
    locationX, locationY, identifier: identifier ?? String(index),
  }));
  const changedTouches = ended
    ? [{ locationX: ended[0], locationY: ended[1], identifier: ended[2] ?? '0' }]
    : touches;
  return { nativeEvent: { touches, changedTouches } } as GestureResponderEvent;
}

/** Model a native layout notification without introducing renderer internals into assertions. */
function layoutEvent(width: number, height: number): LayoutChangeEvent {
  return { nativeEvent: { layout: { width, height, x: 0, y: 0 } } } as LayoutChangeEvent;
}

/** Read the observable camera position rather than reaching into the hook's shared state. */
function lastEye(): number[] {
  const call = mockLookAt.mock.calls.at(-1);
  if (!call) throw new Error('The camera was not updated');
  return call[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAspectRatio.mockReturnValue(1);
  jest.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => jest.restoreAllMocks());

test('only a short stationary gesture selects a device at its local touch coordinates', () => {
  const onPick = jest.fn();
  const { result } = renderHook(() => useLabCamera({ preset: PRESET, resetKey: 0, onPick }));
  act(() => {
    result.current.onTouchStart(touchEvent([[50, 60]]));
    result.current.onTouchEnd(touchEvent([], [52, 61]));
  });
  expect(onPick).toHaveBeenCalledWith(52, 61);
  act(() => {
    result.current.onTouchStart(touchEvent([[50, 60]]));
    jest.mocked(Date.now).mockReturnValue(1500);
    result.current.onTouchEnd(touchEvent([], [50, 60]));
  });
  expect(onPick).toHaveBeenCalledTimes(1);
});

test('an orbit drag cannot become a tap by returning to its starting point', () => {
  const onPick = jest.fn();
  const { result } = renderHook(() => useLabCamera({ preset: PRESET, resetKey: 0, onPick }));
  act(() => {
    result.current.onTouchStart(touchEvent([[50, 60]]));
    result.current.onTouchMove(touchEvent([[90, 80]]));
    result.current.updateCamera();
  });
  expect(lastEye()[0]).not.toBeCloseTo(PRESET.eye[0]);
  act(() => {
    result.current.onTouchMove(touchEvent([[50, 60]]));
    result.current.onTouchEnd(touchEvent([], [50, 60]));
  });
  expect(onPick).not.toHaveBeenCalled();
});

test('pinch-to-single-finger transitions and cancellation never activate a device', () => {
  const onPick = jest.fn();
  const { result } = renderHook(() => useLabCamera({ preset: PRESET, resetKey: 0, onPick }));
  act(() => {
    result.current.onTouchStart(touchEvent([[10, 10]]));
    result.current.onTouchStart(touchEvent([[10, 10], [100, 10]]));
    result.current.onTouchEnd(touchEvent([[10, 10]], [100, 10]));
    result.current.onTouchMove(touchEvent([[12, 10]]));
    result.current.onTouchEnd(touchEvent([], [12, 10]));
    result.current.onTouchStart(touchEvent([[10, 10]]));
    result.current.onTouchCancel();
    result.current.onTouchEnd(touchEvent([], [10, 10]));
  });
  expect(onPick).not.toHaveBeenCalled();
  act(() => {
    result.current.onTouchStart(touchEvent([[10, 10]]));
    result.current.onTouchEnd(touchEvent([], [10, 10]));
  });
  expect(onPick).toHaveBeenCalledTimes(1);
});

test('extreme pinch input remains within the configured viewing distances', () => {
  const { result } = renderHook(() => useLabCamera({
    preset: PRESET, resetKey: 0, onPick: jest.fn(), minDistance: 3, maxDistance: 12,
  }));
  act(() => {
    result.current.onTouchStart(touchEvent([[0, 0], [100, 0]]));
    result.current.onTouchMove(touchEvent([[0, 0], [1000, 0]]));
    result.current.updateCamera();
  });
  expect(Math.hypot(...lastEye())).toBeCloseTo(3);
  act(() => {
    result.current.onTouchMove(touchEvent([[0, 0], [1, 0]]));
    result.current.updateCamera();
  });
  expect(Math.hypot(...lastEye())).toBeCloseTo(12);
});

test('property pinch zooms in and out in a tall phone viewport without changing the look target', () => {
  mockGetAspectRatio.mockReturnValue(0.6);
  const onPick = jest.fn();
  const { result } = renderHook(() => useLabCamera({
    preset: presets.property, resetKey: 0, onPick,
    minDistance: presets.property.minDistance, maxDistance: presets.property.maxDistance,
  }));
  act(() => result.current.updateCamera());
  const initialEye = lastEye();
  const initialRadius = Math.hypot(...initialEye.map((value, index) => value - presets.property.target[index]));
  act(() => {
    result.current.onTouchStart(touchEvent([[80, 180, 'left'], [160, 180, 'right']]));
    result.current.onTouchMove(touchEvent([[40, 180, 'left'], [200, 180, 'right']]));
    result.current.updateCamera();
  });
  const closeRadius = Math.hypot(...lastEye().map((value, index) => value - presets.property.target[index]));
  expect(closeRadius).toBeCloseTo(initialRadius / 2);
  expect(mockLookAt).toHaveBeenLastCalledWith(expect.any(Array), presets.property.target, [0, 1, 0]);
  act(() => {
    result.current.onTouchMove(touchEvent([[80, 180, 'left'], [160, 180, 'right']]));
    result.current.onTouchEnd(touchEvent([], [80, 180, 'left']));
    result.current.updateCamera();
  });
  lastEye().forEach((value, index) => expect(value).toBeCloseTo(initialEye[index]));
  expect(onPick).not.toHaveBeenCalled();
});

test('portrait property zoom respects actual camera limits and responds immediately when reversed', () => {
  mockGetAspectRatio.mockReturnValue(0.5);
  const { result } = renderHook(() => useLabCamera({
    preset: presets.property, resetKey: 0, onPick: jest.fn(),
    minDistance: presets.property.minDistance, maxDistance: presets.property.maxDistance,
  }));
  act(() => {
    result.current.updateCamera();
    result.current.onTouchStart(touchEvent([[0, 0], [100, 0]]));
    result.current.onTouchMove(touchEvent([[0, 0], [1, 0]]));
    result.current.updateCamera();
  });
  const atFarLimit = Math.hypot(...lastEye().map((value, index) => value - presets.property.target[index]));
  expect(atFarLimit).toBeCloseTo(120);
  act(() => {
    result.current.onTouchMove(touchEvent([[0, 0], [2, 0]]));
    result.current.updateCamera();
  });
  const reversed = Math.hypot(...lastEye().map((value, index) => value - presets.property.target[index]));
  expect(reversed).toBeCloseTo(60);
  act(() => {
    result.current.onTouchMove(touchEvent([[0, 0], [1000, 0]]));
    result.current.updateCamera();
  });
  const atNearLimit = Math.hypot(...lastEye().map((value, index) => value - presets.property.target[index]));
  expect(atNearLimit).toBeCloseTo(12);
});

test('reordered touch arrays and an extra finger preserve the active pinch pair', () => {
  const onPick = jest.fn();
  const { result } = renderHook(() => useLabCamera({ preset: PRESET, resetKey: 0, onPick }));
  act(() => {
    result.current.onTouchStart(touchEvent([[0, 0, 'left'], [100, 0, 'right']]));
    result.current.onTouchMove(touchEvent([[200, 0, 'right'], [0, 0, 'left']]));
    result.current.updateCamera();
  });
  expect(Math.hypot(...lastEye())).toBeCloseTo(5);
  const beforeThirdFinger = lastEye();
  act(() => {
    result.current.onTouchStart(touchEvent([[800, 0, 'extra'], [200, 0, 'right'], [0, 0, 'left']]));
    result.current.onTouchMove(touchEvent([[900, 20, 'extra'], [200, 0, 'right'], [0, 0, 'left']]));
    result.current.onTouchEnd(touchEvent([[200, 0, 'right'], [0, 0, 'left']], [900, 20, 'extra']));
    result.current.updateCamera();
  });
  expect(lastEye()).toEqual(beforeThirdFinger);
  act(() => {
    result.current.onTouchEnd(touchEvent([[0, 0, 'left']], [200, 0, 'right']));
    result.current.onTouchMove(touchEvent([[0, 0, 'left']]));
    result.current.updateCamera();
    result.current.onTouchEnd(touchEvent([], [0, 0, 'left']));
  });
  expect(lastEye()).toEqual(beforeThirdFinger);
  expect(onPick).not.toHaveBeenCalled();
});

test('lifting the primary pinch finger rebases orbit onto the remaining finger without a jump', () => {
  const { result } = renderHook(() => useLabCamera({ preset: PRESET, resetKey: 0, onPick: jest.fn() }));
  act(() => {
    result.current.onTouchStart(touchEvent([[20, 30, 'left'], [100, 30, 'right']]));
    result.current.onTouchMove(touchEvent([[0, 30, 'left'], [160, 30, 'right']]));
    result.current.updateCamera();
  });
  const beforeLift = lastEye();
  act(() => {
    result.current.onTouchEnd(touchEvent([[160, 30, 'right']], [0, 30, 'left']));
    result.current.onTouchMove(touchEvent([[160, 30, 'right']]));
    result.current.updateCamera();
  });
  expect(lastEye()).toEqual(beforeLift);
  act(() => {
    result.current.onTouchMove(touchEvent([[170, 30, 'right']]));
    result.current.updateCamera();
  });
  expect(Math.hypot(...lastEye())).toBeCloseTo(Math.hypot(...beforeLift));
  expect(lastEye()[0]).toBeLessThan(beforeLift[0]);
});

test('portrait fitting uses layout until the native aspect arrives and avoids repeated projection updates', () => {
  mockGetAspectRatio.mockReturnValue(0);
  const { result } = renderHook(() => useLabCamera({ preset: PRESET, resetKey: 0, onPick: jest.fn() }));
  act(() => {
    result.current.onLayout(layoutEvent(300, 600));
    result.current.updateCamera();
    result.current.onLayout(layoutEvent(0, 0));
    result.current.updateCamera();
  });
  expect(mockSetProjection).toHaveBeenCalledTimes(1);
  expect(mockSetProjection).toHaveBeenLastCalledWith(42, 0.5, 0.1, 180, 'vertical');
  expect(Math.hypot(...lastEye())).toBeCloseTo(16);
  mockGetAspectRatio.mockReturnValue(2);
  act(() => {
    result.current.updateCamera();
    result.current.updateCamera();
  });
  expect(mockSetProjection).toHaveBeenCalledTimes(2);
  expect(mockSetProjection).toHaveBeenLastCalledWith(42, 2, 0.1, 180, 'vertical');
  expect(Math.hypot(...lastEye())).toBeCloseTo(10);
});

test('reset restores the preset and discards any unfinished gesture', () => {
  const onPick = jest.fn();
  const { result, rerender } = renderHook(
    ({ resetKey }: { resetKey: number }) => useLabCamera({ preset: PRESET, resetKey, onPick }),
    { initialProps: { resetKey: 0 } },
  );
  act(() => {
    result.current.onTouchStart(touchEvent([[10, 10]]));
    result.current.onTouchMove(touchEvent([[80, 50]]));
    result.current.updateCamera();
  });
  expect(lastEye()[0]).not.toBeCloseTo(0);
  rerender({ resetKey: 1 });
  act(() => {
    result.current.onTouchEnd(touchEvent([], [10, 10]));
    result.current.updateCamera();
  });
  expect(onPick).not.toHaveBeenCalled();
  lastEye().forEach((value, index) => expect(value).toBeCloseTo(PRESET.eye[index]));
  expect(mockLookAt).toHaveBeenLastCalledWith(expect.any(Array), PRESET.target, [0, 1, 0]);
});
