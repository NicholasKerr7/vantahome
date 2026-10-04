import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import PasswordRecoveryScreen from '../PasswordRecoveryScreen';
import { useHomeStore } from '../../store/useHomeStore';

const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockCompleteSetup = jest.fn();
const mockSignOutAccount = jest.fn();
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
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockCompleteSetup.mockResolvedValue(undefined);
  mockSignOutAccount.mockResolvedValue(true);
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
  expect(screen.getByText(/We could not save your password/)).toBeTruthy();
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
  expect(screen.getByText(/We could not save your password/)).toBeTruthy();
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
