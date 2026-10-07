import { act, renderHook } from '@testing-library/react-native';
import { HOME_RETENTION_MS, useWarmHomeRetention } from './useWarmHomeRetention';

type Input = Parameters<typeof useWarmHomeRetention>[0];
const admitted: Input = { admitted: true, checking: false, scope: 'alice:home:1' };
const checking: Input = { ...admitted, admitted: false, checking: true };

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-07T12:00:00Z')); });
afterEach(() => { jest.useRealTimers(); });

test('a cold check cannot create a retained private tree', () => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: checking });
  expect(hook.result.current).toBe(false);
  act(() => jest.advanceTimersByTime(1000));
  expect(hook.result.current).toBe(false);
});

test('a verified home can remain hidden for one bounded same-scope check', () => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: admitted });
  expect(hook.result.current).toBe(false);
  hook.rerender(checking);
  expect(hook.result.current).toBe(true);
  act(() => jest.advanceTimersByTime(HOME_RETENTION_MS - 1));
  expect(hook.result.current).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(hook.result.current).toBe(false);
  hook.rerender(checking);
  expect(hook.result.current).toBe(false);
  hook.rerender(admitted);
  hook.rerender(checking);
  expect(hook.result.current).toBe(true);
});

test('failure or a blocked state releases the lease and Retry alone cannot resurrect it', () => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: admitted });
  hook.rerender(checking);
  expect(hook.result.current).toBe(true);
  hook.rerender({ ...checking, checking: false });
  expect(hook.result.current).toBe(false);
  hook.rerender(checking);
  expect(hook.result.current).toBe(false);
});

test.each(['bob:home:1', 'alice:other-home:1', 'alice:home:2'])('scope change to %s discards the previous tree', (scope) => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: admitted });
  hook.rerender({ ...checking, scope });
  expect(hook.result.current).toBe(false);
  hook.rerender(checking);
  expect(hook.result.current).toBe(false);
});

test('guest deadline remains authoritative after invalidation clears the household record', () => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: { ...admitted, guestExpiresAt: '2026-10-07T12:00:05Z' } as Input });
  hook.rerender(checking);
  expect(hook.result.current).toBe(true);
  act(() => jest.advanceTimersByTime(5000));
  expect(hook.result.current).toBe(false);
});

test.each(['invalid', '2026-10-07T11:59:59Z'])('invalid or expired guest deadline %s cannot create a lease', (guestExpiresAt) => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: { ...admitted, guestExpiresAt } as Input });
  hook.rerender(checking);
  expect(hook.result.current).toBe(false);
});

test('wall-clock expiry prevents a long return even when the OS froze timers', () => {
  const hook = renderHook(useWarmHomeRetention, { initialProps: admitted });
  hook.rerender(checking);
  jest.setSystemTime(new Date('2026-10-07T12:02:00Z'));
  hook.rerender(checking);
  expect(hook.result.current).toBe(false);
});
