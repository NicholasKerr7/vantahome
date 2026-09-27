import { act, renderHook } from '@testing-library/react-native';
import { INITIAL_LAB_SETTINGS, type LabSettings } from '../protocol';
import { useLabMetrics } from '../useLabMetrics';

const mockReports: Array<() => void> = [];

/** Reuse the array on assignment, matching WorkletsCore's mutable shared wrapper. */
function mockSharedValue(initial: unknown) {
  let current = initial;
  return {
    get value() { return current; },
    set value(next: unknown) {
      if (Array.isArray(current) && Array.isArray(next)) current.splice(0, current.length, ...next);
      else current = next;
    },
  };
}

jest.mock('react-native-worklets-core', () => ({
  useSharedValue: (initial: unknown) => require('react').useRef(mockSharedValue(initial)).current,
  useRunOnJS: (callback: (samples: number[]) => void, dependencies: unknown[]) =>
    require('react').useCallback((samples: number[]) => {
      // Defer delivery until after the render thread has reset its shared array.
      mockReports.push(() => callback(samples));
    }, dependencies),
}));

/** Deliver reports asynchronously, as the native-to-JavaScript bridge does. */
function deliverReports() {
  act(() => { mockReports.splice(0).forEach((report) => report()); });
}

beforeEach(() => { mockReports.length = 0; });

test('reports immutable sample windows after readiness and warm-up', () => {
  const onEvent = jest.fn();
  const { result, rerender } = renderHook(({ ready }: { ready: boolean }) => useLabMetrics({
    settings: INITIAL_LAB_SETTINGS, onEvent, ready,
  }), { initialProps: { ready: false } });
  act(() => { result.current(3); });
  expect(mockReports).toHaveLength(0);
  rerender({ ready: true });
  act(() => {
    result.current(Number.NaN);
    result.current(0);
    result.current(0.5);
    for (let index = 0; index < 4; index += 1) result.current(0.5);
    for (let index = 0; index < 8; index += 1) result.current(0.25);
  });
  expect(mockReports).toHaveLength(2);
  expect(onEvent).not.toHaveBeenCalled();
  deliverReports();
  expect(onEvent).toHaveBeenNthCalledWith(1, { type: 'metrics', frames: 4, p50: 500, p95: 500, slowFrames: 4 });
  expect(onEvent).toHaveBeenNthCalledWith(2, { type: 'metrics', frames: 8, p50: 250, p95: 250, slowFrames: 8 });
});

test('restarts warm-up on settings changes and discards reports after unmount', () => {
  const onEvent = jest.fn();
  const { result, rerender, unmount } = renderHook(({ settings }: { settings: LabSettings }) => useLabMetrics({
    settings, onEvent, ready: true,
  }), { initialProps: { settings: INITIAL_LAB_SETTINGS } });
  act(() => { result.current(1); });
  rerender({ settings: { ...INITIAL_LAB_SETTINGS, night: true } });
  act(() => {
    for (let index = 0; index < 4; index += 1) result.current(0.5);
  });
  expect(mockReports).toHaveLength(0);
  act(() => { result.current(0.5); });
  expect(mockReports).toHaveLength(1);
  unmount();
  deliverReports();
  expect(onEvent).not.toHaveBeenCalled();
});
