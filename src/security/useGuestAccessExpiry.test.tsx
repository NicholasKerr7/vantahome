import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useShallow } from 'zustand/react/shallow';
import { selectVisibleRooms, useHomeStore } from '../store/useHomeStore';
import { useGuestAccessExpiry } from './useGuestAccessExpiry';

const seed = useHomeStore.getState();
const now = Date.parse('2026-10-03T12:00:00Z');
const removeListener = jest.fn();
let changeAppState: (state: AppStateStatus) => void;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
  jest.clearAllMocks();
  useHomeStore.setState({ ...seed, accountUserId: 'guest', authenticatedUserId: 'guest', accountHomeId: 'home', activeHomeId: 'home',
    activeMemberId: 'guest', sessionEpoch: 4, membershipReady: true,
    household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home', accessExpiresAt: new Date(now + 1000).toISOString() }],
    rooms: [{ id: 'assigned-room', name: 'Guest bedroom' }], roomMembers: [{ memberId: 'guest', roomIds: ['assigned-room'] }],
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    changeAppState = listener;
    return { remove: removeListener };
  });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); useHomeStore.setState(seed); });

/** Observe a real permission selector, whose clock must refresh without new server or user events. */
function useGuestRooms() {
  useGuestAccessExpiry();
  return useHomeStore(useShallow(selectVisibleRooms));
}

test('revokes displayed room access at the deadline and notifies only once for that grant', () => {
  const { result, unmount } = renderHook(useGuestRooms);
  const changes = jest.fn();
  const unsubscribe = useHomeStore.subscribe((state, previous) => { if (state.household !== previous.household) changes(); });
  expect(result.current.map((room) => room.id)).toEqual(['assigned-room']);
  act(() => { jest.advanceTimersByTime(999); });
  expect(result.current).toHaveLength(1);
  expect(changes).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(2); });
  expect(result.current).toEqual([]);
  expect(changes).toHaveBeenCalledTimes(1);
  act(() => { changeAppState('active'); changeAppState('active'); jest.advanceTimersByTime(3000); });
  expect(changes).toHaveBeenCalledTimes(1);
  unsubscribe(); unmount();
});

test('rechecks expired access on resume when the native timer was suspended in the background', () => {
  const { result, unmount } = renderHook(useGuestRooms);
  act(() => { changeAppState('background'); jest.setSystemTime(now + 60_000); });
  expect(result.current).toHaveLength(1);
  act(() => { changeAppState('active'); });
  expect(result.current).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
  unmount();
});

test('an extended guest grant replaces its old timer and expires at the new deadline', () => {
  const { result, unmount } = renderHook(useGuestRooms);
  act(() => {
    useHomeStore.setState({ household: [{ ...useHomeStore.getState().household[0], accessExpiresAt: new Date(now + 5000).toISOString() }] });
    jest.advanceTimersByTime(1001);
  });
  expect(result.current).toHaveLength(1);
  act(() => { jest.advanceTimersByTime(4000); });
  expect(result.current).toEqual([]);
  unmount();
});

test('switching to a non-guest clears the old deadline without invalidating the new household', () => {
  const { result, unmount } = renderHook(useGuestRooms);
  act(() => {
    useHomeStore.setState({ activeMemberId: 'owner', accountUserId: 'owner', authenticatedUserId: 'owner', sessionEpoch: 5,
      household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }] });
  });
  const household = useHomeStore.getState().household;
  act(() => { jest.advanceTimersByTime(5000); changeAppState('active'); });
  expect(result.current).toHaveLength(1);
  expect(useHomeStore.getState().household).toBe(household);
  expect(jest.getTimerCount()).toBe(0);
  unmount();
});

test.each(['invalid-date', new Date(now - 1).toISOString()])('invalid or already-expired grant %s invalidates once without scheduling a loop', (accessExpiresAt) => {
  useHomeStore.setState({ household: [{ ...useHomeStore.getState().household[0], accessExpiresAt }] });
  const changes = jest.fn();
  const unsubscribe = useHomeStore.subscribe((state, previous) => { if (state.household !== previous.household) changes(); });
  const { result, unmount } = renderHook(useGuestRooms);
  expect(result.current).toEqual([]);
  expect(changes).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  act(() => { changeAppState('active'); });
  expect(changes).toHaveBeenCalledTimes(1);
  unsubscribe(); unmount();
});

test('an unbounded guest grant creates no deadline timer', () => {
  useHomeStore.setState({ household: [{ ...useHomeStore.getState().household[0], accessExpiresAt: null }] });
  const { result, unmount } = renderHook(useGuestRooms);
  act(() => { jest.advanceTimersByTime(60_000); changeAppState('active'); });
  expect(result.current).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
  unmount();
});

test('unmount removes both the deadline and foreground listener', () => {
  const { unmount } = renderHook(useGuestRooms);
  expect(jest.getTimerCount()).toBe(1);
  unmount();
  const household = useHomeStore.getState().household;
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(jest.getTimerCount()).toBe(0);
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().household).toBe(household);
});
