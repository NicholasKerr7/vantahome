import React from 'react';
import { AppState, ScrollView, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import { AccountRecoveryPanel } from '../AccountRecoveryPanel';
import { AccountSecurityPage } from '../AccountSecurityPage';
import { useAccountIdentity } from '../useAccountIdentity';
import { useAccountRecovery } from '../useAccountRecovery';
import type { AccountScope } from '../accountIdentity';
import { AccountRecoveryError } from '../accountRecovery';

const mockLoad = jest.fn();
const mockRequest = jest.fn();
jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../accountRecovery', () => ({
  AccountRecoveryError: class AccountRecoveryError extends Error {},
  loadAccountRecoveryIdentity: (...args: unknown[]) => mockLoad(...args),
  requestAccountPasswordRecovery: (...args: unknown[]) => mockRequest(...args),
}));
jest.mock('../AccountSessionsPanel', () => ({ AccountSessionsPanel: () => <></> }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));

const scope: AccountScope = { authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: null,
  accountHomeId: null, sessionEpoch: 2, membershipReady: false };
const email = 'verified@example.com';
const initial = useHomeStore.getState();
const listeners = new Set<(state: AppStateStatus) => void>();

/** Deliver lifecycle changes to every production hook without timing assumptions. */
function lifecycle(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
  for (const listener of listeners) listener(state);
}

/** Hold asynchronous service results at the exact security boundary under test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

/** Exercise actual store subscriptions together with the foreground recovery model. */
function useRecoveryModel() {
  return useAccountRecovery(useAccountIdentity().scope);
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    listeners.add(callback);
    return { remove: () => { listeners.delete(callback); } };
  });
  useHomeStore.setState({ ...scope, profile: { name: 'Alice', email: 'unverified-profile@example.com' }, household: [] });
  mockLoad.mockResolvedValue({ email });
  mockRequest.mockResolvedValue(undefined);
});
afterEach(() => { jest.restoreAllMocks(); useHomeStore.setState(initial, true); });

test('shows only server-verified email, including before any home membership is available', async () => {
  const screen = render(<AccountRecoveryPanel />);
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  expect(screen.queryByText('unverified-profile@example.com')).toBeNull();
  expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining(scope));
  expect(screen.getByText(/newest recovery link on this device/)).toBeTruthy();
  expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never' });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('keeps Sessions selected initially and mounts recovery only when deliberately opened', async () => {
  const screen = render(<AccountSecurityPage />);
  expect(screen.getByLabelText('Sessions').props.accessibilityState.selected).toBe(true);
  expect(mockLoad).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Password recovery'));
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  expect(screen.getByLabelText('Password recovery').props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByLabelText('Sessions'));
  expect(screen.queryByText(email)).toBeNull();
});

test('requires review and explicit send, reporting only a request rather than delivery or password change', async () => {
  const screen = render(<AccountRecoveryPanel />);
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Review recovery email'));
  expect(screen.getByText('Send a recovery email?')).toBeTruthy();
  expect(mockRequest).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Send recovery email'));
  await waitFor(() => expect(screen.getByText(/Recovery email requested/)).toBeTruthy());
  expect(screen.getByText(/Your password has not changed/)).toBeTruthy();
  expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining(scope), email, expect.any(Function));
});

test('cancel closes an unsent review without requesting mail', async () => {
  const screen = render(<AccountRecoveryPanel />);
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Review recovery email'));
  fireEvent.press(screen.getByLabelText('Cancel'));
  expect(screen.queryByText('Send a recovery email?')).toBeNull();
  expect(mockRequest).not.toHaveBeenCalled();
});

test('a failed identity read exposes no cached email and offers an explicit retry', async () => {
  mockLoad.mockRejectedValueOnce(new Error('private provider details'));
  const screen = render(<AccountRecoveryPanel />);
  await waitFor(() => expect(screen.getByText(/recovery email could not be verified/)).toBeTruthy());
  expect(screen.queryByText('private provider details')).toBeNull();
  expect(screen.queryByText(email)).toBeNull();
  expect(screen.getByLabelText('Review recovery email').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Refresh email'));
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
});

test('an uncertain request failure hides stale email and asks the person to check their inbox', async () => {
  mockRequest.mockRejectedValueOnce(new Error('private provider details'));
  const screen = render(<AccountRecoveryPanel />);
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Review recovery email'));
  fireEvent.press(screen.getByLabelText('Send recovery email'));
  await waitFor(() => expect(screen.getByText(/Check your inbox before trying again/)).toBeTruthy());
  expect(screen.queryByText('private provider details')).toBeNull();
  expect(screen.queryByText(email)).toBeNull();
});

test('shows a safe cooldown explanation without exposing unexpected provider errors', async () => {
  mockRequest.mockRejectedValueOnce(new AccountRecoveryError('Wait one minute before requesting another recovery email.'));
  const screen = render(<AccountRecoveryPanel />);
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Review recovery email'));
  fireEvent.press(screen.getByLabelText('Send recovery email'));
  await waitFor(() => expect(screen.getByText(/Wait one minute/)).toBeTruthy());
});

test.each([{ authenticatedUserId: null, accountUserId: null }, { authenticatedUserId: 'bob' }])('an unavailable identity cannot request recovery %j', (change) => {
  useHomeStore.setState(change);
  const screen = render(<AccountRecoveryPanel />);
  expect(screen.getByText(/local demo cannot send recovery emails/)).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Review recovery email')).toBeNull();
});

test.each(['cancel', 'unmount', 'account', 'background'] as const)('a retained confirmation cannot send after %s', async (boundary) => {
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => screen.result.current.requestReview());
  const staleConfirm = screen.result.current.confirmRecovery;
  act(() => {
    if (boundary === 'cancel') screen.result.current.cancel();
    else if (boundary === 'unmount') screen.unmount();
    else if (boundary === 'background') lifecycle('background');
    else useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 });
  });
  await act(async () => { await staleConfirm(); });
  expect(mockRequest).not.toHaveBeenCalled();
});

test('scope changes away and back still invalidate a captured review before React rerenders', async () => {
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => screen.result.current.requestReview());
  const staleConfirm = screen.result.current.confirmRecovery;
  act(() => { useHomeStore.setState({ sessionEpoch: 3 }); useHomeStore.setState(scope); });
  await act(async () => { await staleConfirm(); });
  expect(mockRequest).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  expect(screen.result.current.confirming).toBe(false);
});

test('background hides private email and foreground reloads it without restoring a confirmation', async () => {
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => screen.result.current.requestReview());
  act(() => lifecycle('background'));
  expect(screen.result.current.email).toBeNull();
  expect(screen.result.current.confirming).toBe(false);
  act(() => lifecycle('active'));
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  expect(screen.result.current.confirming).toBe(false);
});

test('a batched background and foreground transition still refreshes the verified address', async () => {
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => { lifecycle('background'); lifecycle('active'); });
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  expect(screen.result.current.loading).toBe(false);
});

test('temporary biometric inactive state preserves the deliberately requested action', async () => {
  const pending = deferred<void>();
  mockRequest.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => screen.result.current.requestReview());
  let request!: Promise<void>;
  act(() => { request = screen.result.current.confirmRecovery(); });
  const stillConfirmed = mockRequest.mock.calls[0][2] as () => boolean;
  act(() => lifecycle('inactive'));
  expect(stillConfirmed()).toBe(true);
  act(() => lifecycle('active'));
  expect(mockLoad).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(); await request; });
  expect(screen.result.current.message).toMatch(/Recovery email requested/);
});

test.each(['background', 'unmount', 'account'] as const)('an in-flight request loses authorization after %s and cannot display stale success', async (boundary) => {
  const pending = deferred<void>();
  mockRequest.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => screen.result.current.requestReview());
  let request!: Promise<void>;
  act(() => { request = screen.result.current.confirmRecovery(); });
  const stillConfirmed = mockRequest.mock.calls[0][2] as () => boolean;
  act(() => {
    if (boundary === 'unmount') screen.unmount();
    else if (boundary === 'background') lifecycle('background');
    else useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 });
  });
  expect(stillConfirmed()).toBe(false);
  await act(async () => { pending.resolve(); await request; });
  expect(screen.result.current.message).toBeNull();
});

test('duplicate taps share one request and refresh cannot replace a pending confirmation', async () => {
  const pending = deferred<void>();
  mockRequest.mockReturnValueOnce(pending.promise);
  const screen = renderHook(useRecoveryModel);
  await waitFor(() => expect(screen.result.current.email).toBe(email));
  act(() => screen.result.current.requestReview());
  const confirm = screen.result.current.confirmRecovery;
  let request!: Promise<void>;
  act(() => { request = confirm(); void confirm(); screen.result.current.refresh(); });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mockLoad).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(); await request; });
  expect(screen.result.current.busy).toBe(false);
});

test('a late identity read cannot leak a previous email into a new account', async () => {
  const previous = deferred<{ email: string }>();
  mockLoad.mockReturnValueOnce(previous.promise).mockResolvedValue({ email: 'bob@example.com' });
  const screen = renderHook(useRecoveryModel);
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 }); });
  await waitFor(() => expect(screen.result.current.email).toBe('bob@example.com'));
  await act(async () => { previous.resolve({ email }); });
  expect(screen.result.current.email).toBe('bob@example.com');
});

test('switching tabs invalidates an unsent recovery confirmation', async () => {
  const screen = render(<AccountSecurityPage />);
  fireEvent.press(screen.getByLabelText('Password recovery'));
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Review recovery email'));
  fireEvent.press(screen.getByLabelText('Sessions'));
  fireEvent.press(screen.getByLabelText('Password recovery'));
  await waitFor(() => expect(screen.getByText(email)).toBeTruthy());
  expect(screen.queryByText('Send a recovery email?')).toBeNull();
  expect(mockRequest).not.toHaveBeenCalled();
});
