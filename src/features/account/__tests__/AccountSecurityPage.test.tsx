import React from 'react';
import { AppState, ScrollView, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import { AccountSecurityPage } from '../AccountSecurityPage';
import { useAccountSessions } from '../useAccountSessions';
import { useAccountIdentity } from '../useAccountIdentity';
import type { AccountSessionsSnapshot } from '../accountSessions';
import type { AccountScope } from '../accountIdentity';

const mockList = jest.fn();
const mockSignOutOthers = jest.fn();
jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../accountSessions', () => ({
  listAccountSessions: (...args: unknown[]) => mockList(...args),
  signOutOtherAccountSessions: (...args: unknown[]) => mockSignOutOthers(...args),
}));
jest.mock('../accountSession', () => ({ signOutAccount: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));

const currentId = 'ad200000-0000-4000-8000-000000000001';
const otherId = 'ad200000-0000-4000-8000-000000000002';
const scope: AccountScope = { authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a', accountHomeId: 'home-a', sessionEpoch: 2, membershipReady: true };
const initial = useHomeStore.getState();
const listeners = new Set<(state: AppStateStatus) => void>();

/** Use public inventory fields only; the component never receives Auth credentials. */
function snapshot(withOther = true, sessionId = currentId): AccountSessionsSnapshot {
  const current = { id: sessionId, createdAt: null, refreshedAt: null, expiresAt: null,
    deviceLabel: 'ios' as const, isCurrent: true };
  return { currentSessionId: sessionId, checkedAt: Date.now(), sessions: withOther
    ? [current, { ...current, id: otherId, deviceLabel: 'android', isCurrent: false }]
    : [current] };
}

/** Explicitly deliver lifecycle boundaries to every registered foreground listener. */
function lifecycle(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  for (const listener of listeners) listener(state);
}

/** Keep delayed reads/actions controllable without timer-dependent tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** Exercise the production identity subscription and session hook together. */
function useSessionModel() {
  return useAccountSessions(useAccountIdentity().scope);
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    listeners.add(callback);
    return { remove: () => { listeners.delete(callback); } };
  });
  useHomeStore.setState({ ...scope, profile: { name: 'Alice' }, household: [] });
  mockList.mockResolvedValue(snapshot());
  mockSignOutOthers.mockResolvedValue(snapshot(false));
});
afterEach(() => {
  jest.restoreAllMocks();
  useHomeStore.setState(initial, true);
});

test('shows bounded sanitized session evidence without calling it live device activity', async () => {
  const screen = render(<AccountSecurityPage />);
  await waitFor(() => expect(screen.getByText('This session')).toBeTruthy());
  expect(screen.getByText('Signed in: Unavailable')).toBeTruthy();
  expect(screen.getByText('Session refreshed: Unavailable')).toBeTruthy();
  expect(screen.getByText(/does not mean a device is online/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Next Sign-in'));
  expect(screen.getByText('Android')).toBeTruthy();
  expect(screen.getByText('Other sign-in')).toBeTruthy();
  const form = screen.UNSAFE_getAllByType(ScrollView).find((view) => !view.props.horizontal);
  expect(form?.props).toMatchObject({ bounces: false, overScrollMode: 'never' });
});

test('requires explicit confirmation and retains truthful access-token expiry wording', async () => {
  const screen = render(<AccountSecurityPage />);
  await waitFor(() => expect(screen.getByLabelText('Sign out other sessions')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Sign out other sessions'));
  expect(screen.getByText('Sign out all other sessions?')).toBeTruthy();
  expect(screen.getByText(/Existing access may continue until its current token expires/)).toBeTruthy();
  expect(mockSignOutOthers).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Confirm other-session sign-out'));
  await waitFor(() => expect(screen.getByText(/Other sign-ins have ended/)).toBeTruthy());
  expect(mockSignOutOthers).toHaveBeenCalledWith(expect.objectContaining(scope), currentId, expect.any(Function));
  expect(screen.queryByLabelText('Sign out other sessions')).toBeNull();
  expect(screen.getByText('This session')).toBeTruthy();
});

test('keeps failed revocation ambiguous, removes stale details, and supports explicit refresh', async () => {
  mockSignOutOthers.mockRejectedValueOnce(new Error('private provider details'));
  const screen = render(<AccountSecurityPage />);
  await waitFor(() => expect(screen.getByLabelText('Sign out other sessions')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Sign out other sessions'));
  fireEvent.press(screen.getByLabelText('Confirm other-session sign-out'));
  await waitFor(() => expect(screen.getByText(/could not be fully verified/)).toBeTruthy());
  expect(screen.queryByText('This session')).toBeNull();
  expect(screen.queryByText('private provider details')).toBeNull();
  fireEvent.press(screen.getByLabelText('Refresh sessions'));
  await waitFor(() => expect(screen.getByText('This session')).toBeTruthy());
});

test('local demo makes no session request and offers no remote sign-out action', () => {
  useHomeStore.setState({ authenticatedUserId: null, accountUserId: null });
  const screen = render(<AccountSecurityPage />);
  expect(screen.getByText(/local demo has no account sessions/)).toBeTruthy();
  expect(mockList).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Sign out other sessions')).toBeNull();
});

test.each([{ authenticatedUserId: 'bob', accountUserId: 'bob' }, { sessionEpoch: 3 }])('late reads cannot replace a newer identity snapshot %j', async change => {
  const previous = deferred<AccountSessionsSnapshot>();
  mockList.mockReturnValueOnce(previous.promise).mockResolvedValue(snapshot(false, otherId));
  const screen = renderHook(useSessionModel);
  act(() => { useHomeStore.setState(change); });
  await waitFor(() => expect(screen.result.current.snapshot?.currentSessionId).toBe(otherId));
  await act(async () => { previous.resolve(snapshot()); });
  expect(screen.result.current.snapshot?.currentSessionId).toBe(otherId);
});

test('background clears private details and confirmation; foreground requires a fresh read', async () => {
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  const staleConfirm = screen.result.current.confirmOtherSignOut;
  act(() => lifecycle('background'));
  expect(screen.result.current.snapshot).toBeNull();
  expect(screen.result.current.confirming).toBe(false);
  await act(async () => { await staleConfirm(); });
  expect(mockSignOutOthers).not.toHaveBeenCalled();
  act(() => lifecycle('active'));
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  expect(screen.result.current.confirming).toBe(false);
});

test('a batched background and foreground transition refreshes the cleared session inventory', async () => {
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => { lifecycle('background'); lifecycle('active'); });
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  expect(screen.result.current.loading).toBe(false);
});

test.each(['review', 'biometric'] as const)('inactive system UI preserves a deliberate %s confirmation without refreshing it away', async phase => {
  const pending = deferred<AccountSessionsSnapshot>();
  mockSignOutOthers.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  let request: Promise<void> | undefined;
  if (phase === 'biometric') act(() => { request = screen.result.current.confirmOtherSignOut(); });
  act(() => lifecycle('inactive'));
  expect(screen.result.current.confirming).toBe(true);
  expect(screen.result.current.snapshot).toBeTruthy();
  if (phase === 'biometric') expect((mockSignOutOthers.mock.calls[0][2] as () => boolean)()).toBe(true);
  act(() => lifecycle('active'));
  expect(screen.result.current.confirming).toBe(true);
  expect(mockList).toHaveBeenCalledTimes(1);
  if (phase === 'review') act(() => { request = screen.result.current.confirmOtherSignOut(); });
  await act(async () => { pending.resolve(snapshot(false)); await request; });
  expect(screen.result.current.message).toMatch(/Other sign-ins have ended/);
});

test('inactive followed by actual backgrounding invalidates a pending biometric confirmation', async () => {
  const pending = deferred<AccountSessionsSnapshot>();
  mockSignOutOthers.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  let request!: Promise<void>;
  act(() => { request = screen.result.current.confirmOtherSignOut(); });
  const stillConfirmed = mockSignOutOthers.mock.calls[0][2] as () => boolean;
  act(() => lifecycle('inactive'));
  expect(stillConfirmed()).toBe(true);
  act(() => lifecycle('background'));
  expect(stillConfirmed()).toBe(false);
  expect(screen.result.current.confirming).toBe(false);
  await act(async () => { pending.resolve(snapshot(false)); await request; });
  expect(screen.result.current.snapshot).toBeNull();
  expect(screen.result.current.message).toBeNull();
});

test.each(['cancel', 'unmount', 'account'] as const)('a retained confirmation cannot revoke sessions after %s', async boundary => {
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  const staleConfirm = screen.result.current.confirmOtherSignOut;
  act(() => {
    if (boundary === 'cancel') screen.result.current.cancel();
    else if (boundary === 'unmount') screen.unmount();
    else useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 });
  });
  await act(async () => { await staleConfirm(); });
  expect(mockSignOutOthers).not.toHaveBeenCalled();
});

test('concurrent taps send one request and invalidate its authorization callback when backgrounded', async () => {
  const pending = deferred<AccountSessionsSnapshot>();
  mockSignOutOthers.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  let first!: Promise<void>;
  act(() => {
    const confirm = screen.result.current.confirmOtherSignOut;
    first = confirm();
    void confirm();
  });
  expect(mockSignOutOthers).toHaveBeenCalledTimes(1);
  const stillConfirmed = mockSignOutOthers.mock.calls[0][2] as () => boolean;
  expect(stillConfirmed()).toBe(true);
  act(() => lifecycle('background'));
  expect(stillConfirmed()).toBe(false);
  await act(async () => { pending.resolve(snapshot(false)); await first; });
  expect(screen.result.current.snapshot).toBeNull();
  expect(screen.result.current.message).toBeNull();
});

test('a late action cannot overwrite the inventory or success message of a replacement account', async () => {
  const pending = deferred<AccountSessionsSnapshot>();
  mockSignOutOthers.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  let request!: Promise<void>;
  act(() => { request = screen.result.current.confirmOtherSignOut(); });
  mockList.mockResolvedValue(snapshot(false, otherId));
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 }); });
  await waitFor(() => expect(screen.result.current.snapshot?.currentSessionId).toBe(otherId));
  await act(async () => { pending.resolve(snapshot(false)); await request; });
  expect(screen.result.current.snapshot?.currentSessionId).toBe(otherId);
  expect(screen.result.current.message).toBeNull();
});

test('a foreground refresh racing pending logout is refreshed again after the outcome settles', async () => {
  const pending = deferred<AccountSessionsSnapshot>();
  mockSignOutOthers.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useSessionModel);
  await waitFor(() => expect(screen.result.current.snapshot).toBeTruthy());
  act(() => screen.result.current.requestOtherSignOut());
  let request!: Promise<void>;
  act(() => { request = screen.result.current.confirmOtherSignOut(); });
  act(() => lifecycle('background'));
  act(() => lifecycle('active'));
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  mockList.mockResolvedValue(snapshot(false));
  await act(async () => { pending.resolve(snapshot(false)); await request; });
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.result.current.snapshot?.sessions).toHaveLength(1));
  expect(screen.result.current.busy).toBe(false);
});
