import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import PasswordRecoveryScreen from '../PasswordRecoveryScreen';
import Pressable from '../../components/Pressable';
import { useHomeStore } from '../../store/useHomeStore';
import { AppState, type AppStateStatus } from 'react-native';

const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockCompleteSetup = jest.fn();
const mockSignOutAccount = jest.fn();
const mockCaptureRecovery = jest.fn();
const mockCompleteRecovery = jest.fn();
const mockUpdateAccountPassword = jest.fn();
jest.mock('../../services/accountPasswordUpdate', () => ({ updateAccountPassword: (...args: unknown[]) => mockUpdateAccountPassword(...args) }));
jest.mock('../../services/passwordRecoverySetup', () => ({
  capturePasswordRecoverySetup: (...args: unknown[]) => mockCaptureRecovery(...args),
  completePasswordRecoverySetup: (...args: unknown[]) => mockCompleteRecovery(...args),
}));
jest.mock('../../components/CinematicSurface', () => ({ children }: { children: React.ReactNode }) => children);
jest.mock('../../services/supabaseClient', () => ({ supabase: { auth: {
  getUser: () => mockGetUser(), updateUser: (...args: unknown[]) => mockUpdateUser(...args),
} } }));
jest.mock('../../services/authFlow', () => ({
  waitForAuthExchange: jest.fn(async () => undefined),
  completeInvitationPasswordSetup: (...args: unknown[]) => mockCompleteSetup(...args),
}));
jest.mock('../../features/account/accountSession', () => ({ signOutAccount: (...args: unknown[]) => mockSignOutAccount(...args) }));

const initial = useHomeStore.getState();
beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState({ authenticatedUserId: 'alice', accountUserId: 'alice', sessionEpoch: 10 });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockCompleteSetup.mockResolvedValue(undefined);
  mockSignOutAccount.mockResolvedValue(true);
  mockCaptureRecovery.mockResolvedValue({ userId: 'alice', email: 'alice@example.test', bound: null, pending: null });
  mockCompleteRecovery.mockResolvedValue(true);
  mockUpdateAccountPassword.mockImplementation(async (...args: unknown[]) => {
    const response = await mockUpdateUser({ password: args[1] });
    if (response.error) throw response.error;
  });
});
afterEach(() => useHomeStore.setState(initial, true));

/** Exercise password setup through the same labelled fields used by the app. */
async function submitPassword(onComplete: () => void, purpose: 'invitation' | 'recovery' = 'invitation') {
  const screen = render(<PasswordRecoveryScreen purpose={purpose} onComplete={onComplete} />);
  fireEvent.changeText(screen.getByLabelText('New password'), 'new-password');
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-password');
  const action = purpose === 'invitation' ? 'Save password & review invitation' : 'Update password';
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: action })); });
  return screen;
}

test('finishes invitation enrollment only after the verified account password and marker are saved', async () => {
  const onComplete = jest.fn();
  await submitPassword(onComplete);
  expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password' });
  expect(mockCompleteSetup).toHaveBeenCalledWith('alice');
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('does not update a replacement account while verified identity is loading', async () => {
  mockGetUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'bob', sessionEpoch: 11 });
    return { data: { user: { id: 'bob' } }, error: null };
  });
  const onComplete = jest.fn();
  await submitPassword(onComplete);
  expect(mockUpdateUser).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

test('does not release another session while the enrollment marker is being cleared', async () => {
  mockCompleteSetup.mockImplementationOnce(async () => { useHomeStore.setState({ sessionEpoch: 11 }); });
  const onComplete = jest.fn();
  await submitPassword(onComplete);
  expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
});

test('retains the password gate and shows an error when the update fails', async () => {
  mockUpdateUser.mockResolvedValueOnce({ error: new Error('offline') });
  const onComplete = jest.fn();
  const screen = await submitPassword(onComplete);
  expect(screen.getByText(/We could not confirm your password update/)).toBeTruthy();
  expect(mockCompleteSetup).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

test('returns to sign-in only if the scoped account was signed out', async () => {
  mockSignOutAccount.mockResolvedValueOnce(false);
  const onComplete = jest.fn();
  const screen = render(<PasswordRecoveryScreen onComplete={onComplete} />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Return to sign in' })); });
  expect(mockSignOutAccount).toHaveBeenCalledWith(expect.objectContaining({ authenticatedUserId: 'alice', sessionEpoch: 10 }));
  expect(onComplete).not.toHaveBeenCalled();
});

test('recovery releases the password gate only after the verified password update succeeds', async () => {
  let finish!: (value: { error: null }) => void;
  mockUpdateUser.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const onComplete = jest.fn();
  const screen = await submitPassword(onComplete, 'recovery');
  expect(screen.getByText('Set a new password')).toBeTruthy();
  expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password' });
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => { finish({ error: null }); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(mockCompleteSetup).not.toHaveBeenCalled();
});

test('a failed recovery update leaves the gate closed and allows a successful retry', async () => {
  mockUpdateUser.mockResolvedValueOnce({ error: new Error('Offline') });
  const onComplete = jest.fn();
  const screen = await submitPassword(onComplete, 'recovery');
  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.getByText(/We could not confirm your password update/)).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Update password' })); });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(mockUpdateUser).toHaveBeenCalledTimes(2);
  expect(mockCompleteSetup).not.toHaveBeenCalled();
});

test('a recovery update finishing after an account change cannot release the new account', async () => {
  mockUpdateUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'bob', sessionEpoch: 11 });
    return { error: null };
  });
  const onComplete = jest.fn();
  await submitPassword(onComplete, 'recovery');
  expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(mockCompleteSetup).not.toHaveBeenCalled();
});

test('a retained sign-out handler cannot target the account mounted after this screen was removed', async () => {
  const onComplete = jest.fn();
  const screen = render(<PasswordRecoveryScreen onComplete={onComplete} />);
  const press = screen.UNSAFE_getAllByType(Pressable).find(node => node.props.children?.props?.children === 'Return to sign in')!.props.onPress;
  screen.unmount();
  useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 11 });
  await act(async () => { press(); });
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockSignOutAccount).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

test('changing accounts during sign-out verification prevents dispatch and cleanup', async () => {
  mockGetUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 11 });
    return { data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null };
  });
  const screen = render(<PasswordRecoveryScreen onComplete={jest.fn()} />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Return to sign in' })); });
  expect(mockSignOutAccount).not.toHaveBeenCalled();
  expect(mockCompleteRecovery).not.toHaveBeenCalled();
});

test('failed local sign-out preserves unfinished recovery for the next launch', async () => {
  mockSignOutAccount.mockRejectedValueOnce(new Error('Offline'));
  const screen = render(<PasswordRecoveryScreen onComplete={jest.fn()} />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Return to sign in' })); });
  expect(mockCaptureRecovery).toHaveBeenCalledWith('alice', 'alice@example.test');
  expect(mockCompleteRecovery).not.toHaveBeenCalled();
  expect(screen.getByText(/could not sign out/)).toBeTruthy();
});

test('only acknowledged local sign-out allows reviewed recovery cleanup', async () => {
  mockSignOutAccount.mockImplementationOnce(async () => {
    expect(mockCompleteRecovery).not.toHaveBeenCalled();
    return true;
  });
  const screen = render(<PasswordRecoveryScreen onComplete={jest.fn()} />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Return to sign in' })); });
  expect(mockCompleteRecovery).toHaveBeenCalledWith(expect.objectContaining({ userId: 'alice' }));
});

test('a newer recovery intent prevents an older saved-password completion from releasing the gate', async () => {
  mockCompleteRecovery.mockResolvedValueOnce(false);
  const onComplete = jest.fn();
  const screen = await submitPassword(onComplete, 'recovery');
  expect(mockUpdateAccountPassword).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.getByText(/password was saved, but setup is still pending/)).toBeTruthy();
});

test('unmounting while identity verification is pending prevents password mutation', async () => {
  let resolve!: (value: unknown) => void;
  mockGetUser.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = await submitPassword(jest.fn(), 'recovery');
  screen.unmount();
  await act(async () => { resolve({ data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null }); });
  expect(mockUpdateAccountPassword).not.toHaveBeenCalled();
});

test.each(['background', 'inactive'] as const)('a %s transition during verification has explicit credential behavior', async next => {
  let appState!: (state: AppStateStatus) => void;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appState = callback; return { remove: jest.fn() };
  });
  mockGetUser.mockImplementationOnce(async () => {
    appState(next);
    return { data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null };
  });
  const onComplete = jest.fn();
  await submitPassword(onComplete, 'recovery');
  expect(mockUpdateAccountPassword).toHaveBeenCalledTimes(next === 'inactive' ? 1 : 0);
  expect(onComplete).toHaveBeenCalledTimes(next === 'inactive' ? 1 : 0);
  listener.mockRestore();
});

test('a confirmed save finishing in background waits for explicit foreground continuation', async () => {
  let appState!: (state: AppStateStatus) => void;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appState = callback; return { remove: jest.fn() };
  });
  mockUpdateAccountPassword.mockImplementationOnce(async () => { appState('background'); });
  const onComplete = jest.fn();
  const screen = await submitPassword(onComplete, 'recovery');
  expect(onComplete).not.toHaveBeenCalled();
  expect(mockCompleteRecovery).not.toHaveBeenCalled();
  expect(screen.getByText('Your password was saved. Continue to finish account setup.')).toBeTruthy();
  await act(async () => { appState('active'); fireEvent.press(screen.getByRole('button', { name: 'Continue to your account' })); });
  expect(mockCompleteRecovery).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(mockUpdateAccountPassword).toHaveBeenCalledTimes(1);
  listener.mockRestore();
});
