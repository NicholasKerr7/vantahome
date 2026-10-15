import { act, renderHook } from '@testing-library/react-native';
import { PLACEMENT_PREVIEW_TIMEOUT_MS, usePlacementPreviewReadiness } from '../usePlacementPreviewReadiness';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('offers recovery when bootstrap or geometry never acknowledges a rendered frame, and grants a fresh retry', () => {
  const { result, rerender, unmount } = renderHook<ReturnType<typeof usePlacementPreviewReadiness>, { attempt: number }>(({ attempt }) => usePlacementPreviewReadiness(attempt, 'living'), { initialProps: { attempt: 0 } });
  act(() => jest.advanceTimersByTime(PLACEMENT_PREVIEW_TIMEOUT_MS));
  expect(result.current[0]).toBe('error');
  rerender({ attempt: 1 });
  expect(result.current[0]).toBe('loading');
  act(() => result.current[1]('ready'));
  act(() => jest.advanceTimersByTime(PLACEMENT_PREVIEW_TIMEOUT_MS));
  expect(result.current[0]).toBe('ready');
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('a different room requires its own rendered frame and cleanup cancels the deadline', () => {
  const { result, rerender, unmount } = renderHook<ReturnType<typeof usePlacementPreviewReadiness>, { room: string }>(({ room }) => usePlacementPreviewReadiness(0, room), { initialProps: { room: 'living' } });
  act(() => result.current[1]('ready'));
  rerender({ room: 'grounds' });
  expect(result.current[0]).toBe('loading');
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
