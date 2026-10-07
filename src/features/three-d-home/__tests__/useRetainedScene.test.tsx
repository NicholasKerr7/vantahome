import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { SCENE_RETENTION_MS, useRetainedScene } from '../useRetainedScene';

let stateChanged: (state: AppStateStatus) => void;
let memoryWarning: () => void;
const remove = jest.fn();
const originalAppState = AppState.currentState;

beforeEach(() => {
  AppState.currentState = 'active';
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') stateChanged = listener;
    if (type === 'memoryWarning') memoryWarning = listener as () => void;
    return { remove };
  });
});
afterEach(() => { AppState.currentState = originalAppState; jest.useRealTimers(); jest.restoreAllMocks(); remove.mockClear(); });

test('a short background visit pauses and preserves the renderer, including brief system overlays', () => {
  const { result, unmount } = renderHook(() => useRetainedScene(true));
  expect(result.current).toEqual({ active: true, retained: true, suspended: false });
  act(() => stateChanged('inactive'));
  expect(result.current.suspended).toBe(true);
  act(() => stateChanged('background'));
  act(() => jest.advanceTimersByTime(SCENE_RETENTION_MS - 1));
  expect(result.current).toEqual({ active: false, retained: true, suspended: true });
  act(() => stateChanged('active'));
  expect(result.current).toEqual({ active: true, retained: true, suspended: false });
  unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});

test('long background and navigation absences release retained graphics', () => {
  const { result, rerender } = renderHook(({ focused }: { focused: boolean }) => useRetainedScene(focused), { initialProps: { focused: true } });
  act(() => stateChanged('background'));
  act(() => jest.advanceTimersByTime(SCENE_RETENTION_MS));
  expect(result.current.retained).toBe(false);
  act(() => stateChanged('active'));
  expect(result.current.retained).toBe(true);
  rerender({ focused: false });
  expect(result.current.suspended).toBe(true);
  act(() => jest.advanceTimersByTime(SCENE_RETENTION_MS));
  expect(result.current.retained).toBe(false);
});

test('a wall-clock check releases graphics after iOS froze the background timer', () => {
  const retainedStates: boolean[] = [];
  renderHook(() => { const state = useRetainedScene(true); retainedStates.push(state.retained); return state; });
  act(() => stateChanged('background'));
  retainedStates.length = 0;
  jest.setSystemTime(Date.now() + SCENE_RETENTION_MS + 1);
  act(() => stateChanged('active'));
  expect(retainedStates).toEqual([false, true]);
});

test('background memory warnings release immediately while an active view remains usable', () => {
  const { result } = renderHook(() => useRetainedScene(true));
  act(() => memoryWarning());
  expect(result.current.retained).toBe(true);
  act(() => stateChanged('background'));
  act(() => memoryWarning());
  expect(result.current.retained).toBe(false);
});

test('a scene that was never admitted or focused does not prepare hidden graphics', () => {
  const { result, rerender } = renderHook(({ focused }: { focused: boolean }) => useRetainedScene(focused), { initialProps: { focused: false } });
  expect(result.current.retained).toBe(false);
  rerender({ focused: true });
  expect(result.current.retained).toBe(true);
});
