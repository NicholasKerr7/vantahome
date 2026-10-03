import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockList = jest.fn();
const mockRespond = jest.fn();
const mockBootstrap = jest.fn();
const mockSync = jest.fn();
const mockGetUser = jest.fn();
const mockSignOut = jest.fn();
jest.mock('../../services/cloudRegistry', () => ({
  listPendingInvites: (...args: unknown[]) => mockList(...args),
  respondHomeInvite: (...args: unknown[]) => mockRespond(...args),
  bootstrapHome: (...args: unknown[]) => mockBootstrap(...args),
}));
jest.mock('../../services/membership', () => ({
  ...jest.requireActual('../../services/membership'),
  syncMembershipFromSupabase: (...args: unknown[]) => mockSync(...args),
}));
jest.mock('../../services/supabaseClient', () => ({ supabase: { auth: {
  getUser: () => mockGetUser(), signOut: (...args: unknown[]) => mockSignOut(...args),
} } }));
jest.mock('../../services/authFlow', () => ({ cancelAuthFlow: jest.fn(async () => {}), waitForAuthExchange: jest.fn(async () => {}) }));
jest.mock('../../components/CinematicSurface', () => ({ __esModule: true, default: require('react-native').View }));
jest.mock('../../components/VantaHomeMark', () => () => null);
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

import HomeAccessScreen from './HomeAccessScreen';
import { hydrateHomeAccount, useHomeStore } from '../../store/useHomeStore';
import type { HomeInvite } from '../../services/cloudRegistry';
import type { MembershipSyncResult } from '../../services/membership';

const invite: HomeInvite = { id: 'invite-1', home_id: 'invited-home', home_name: 'Hopewell', email: 'alice@example.test', invited_user_id: 'alice', role: 'guest', room_ids: [], status: 'pending', created_at: '2026-10-01' };
/** Build a verified policy snapshot with no device data required for onboarding. */
function snapshot(homeId = invite.home_id): MembershipSyncResult {
  return { homeId, activeMemberId: 'alice', rooms: [], devices: [], household: [{ id: 'alice', name: 'Alice', role: 'Guest', status: 'away' }], roomMembers: [], permissionOverrides: [] };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await hydrateHomeAccount('alice');
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email_confirmed_at: '2026-10-01' } }, error: null });
  mockList.mockResolvedValue([invite]);
  mockRespond.mockResolvedValue({ status: 'accepted', inviteId: invite.id });
  mockBootstrap.mockResolvedValue({ home: { id: 'owner-home', name: 'Hopewell' } });
  mockSync.mockImplementation(async (_userId: string, homeId: string) => snapshot(homeId));
  mockSignOut.mockResolvedValue({ error: null });
});

test('new members see their inbox without automatically creating a household', async () => {
  const screen = render(<HomeAccessScreen userId="alice" email="alice@example.test" onComplete={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  expect(mockList).toHaveBeenCalledWith('alice');
  expect(screen.getByText('alice@example.test')).toBeTruthy();
  expect(screen.getByText('Hopewell')).toBeTruthy();
  expect(mockBootstrap).not.toHaveBeenCalled();
  expect(useHomeStore.getState().membershipReady).toBe(false);
});

test('acceptance enters the invited home only after its authorized membership is synchronized', async () => {
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(mockRespond).toHaveBeenCalledWith(invite.id, 'accept', 'alice');
  expect(mockSync).toHaveBeenCalledWith('alice', 'invited-home');
  expect(useHomeStore.getState().accountHomeId).toBe('invited-home');
});

test('an expired invitation never installs household access', async () => {
  mockRespond.mockRejectedValueOnce(new Error('This invitation has expired.'));
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('This invitation has expired.')).toBeTruthy());
  expect(complete).not.toHaveBeenCalled();
  expect(mockSync).not.toHaveBeenCalled();
  expect(useHomeStore.getState().membershipReady).toBe(false);
});

test('a known expired invitation displays its deadline and disables acceptance', async () => {
  mockList.mockResolvedValueOnce([{ ...invite, expires_at: '2000-01-01T12:00:00Z' }]);
  const screen = render(<HomeAccessScreen userId="alice" onComplete={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Accept invitation to Hopewell')).toBeTruthy());
  expect(screen.getByText(/^Expired /)).toBeTruthy();
  expect(screen.getByLabelText('Accept invitation to Hopewell')).toBeDisabled();
  expect(screen.getByLabelText('Decline invitation to Hopewell')).not.toBeDisabled();
  fireEvent.press(screen.getByLabelText('Accept invitation to Hopewell'));
  expect(mockRespond).not.toHaveBeenCalled();
});

test('declining removes only that invitation and keeps the person outside the household', async () => {
  mockRespond.mockResolvedValueOnce({ status: 'declined', inviteId: invite.id });
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.getByText('Decline')).toBeTruthy());
  fireEvent.press(screen.getByText('Decline'));
  await waitFor(() => expect(screen.getByText('Invitation declined.')).toBeTruthy());
  expect(screen.queryByText('Accept invitation')).toBeNull();
  expect(mockRespond).toHaveBeenCalledWith(invite.id, 'decline', 'alice');
  expect(mockSync).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

test('a successful invitation with a failed registry read retries synchronization without accepting twice', async () => {
  mockSync.mockRejectedValueOnce(new Error('Offline.'));
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Offline.')).toBeTruthy());
  fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(mockRespond).toHaveBeenCalledTimes(1);
  expect(mockSync).toHaveBeenCalledTimes(2);
});

test('an unrelated membership cannot satisfy invitation acceptance', async () => {
  mockSync.mockResolvedValueOnce(snapshot('other-home'));
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Home access is not confirmed yet. Retry to check your membership.')).toBeTruthy());
  expect(useHomeStore.getState().membershipReady).toBe(false);
  expect(complete).not.toHaveBeenCalled();
});

test('owner setup requires an explicit home name and verified identity', async () => {
  mockList.mockResolvedValueOnce([]);
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.queryByText('Checking your invitations…')).toBeNull());
  fireEvent.press(screen.getByText('Set up my home'));
  expect(screen.getByText('Create my home')).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Home name'), '  Hopewell  ');
  fireEvent.press(screen.getByText('Create my home'));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(mockBootstrap).toHaveBeenCalledWith('Hopewell', 'alice');
  expect(mockSync).toHaveBeenCalledWith('alice', 'owner-home');
});

test('unverified email cannot accept an invitation', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'alice' } }, error: null });
  const screen = render(<HomeAccessScreen userId="alice" onComplete={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Verify your email and sign in again before joining a home.')).toBeTruthy());
  expect(mockRespond).not.toHaveBeenCalled();
});

test.each(['bob', 'alice'])('a late acceptance cannot restore data after a new %s login', async (nextUser) => {
  let finish: (value: { status: 'accepted'; inviteId: string }) => void = () => {};
  mockRespond.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(mockRespond).toHaveBeenCalled());
  await act(async () => { await hydrateHomeAccount(null); await hydrateHomeAccount(nextUser); });
  await act(async () => { finish({ status: 'accepted', inviteId: invite.id }); });
  expect(mockSync).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  expect(useHomeStore.getState().membershipReady).toBe(false);
});

test('existing members can leave the inbox without creating or changing a home', async () => {
  const leave = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={jest.fn()} onContinue={leave} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  expect(screen.queryByText('Set up my home')).toBeNull();
  fireEvent.press(screen.getByText('Return to my home'));
  expect(leave).toHaveBeenCalledTimes(1);
  expect(mockBootstrap).not.toHaveBeenCalled();
});

test('an interrupted sign-out has a visible error and permits another attempt', async () => {
  mockSignOut.mockResolvedValueOnce({ error: new Error('Offline') });
  const screen = render(<HomeAccessScreen userId="alice" onComplete={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Sign out'));
  await waitFor(() => expect(screen.getByText('Unable to sign out. Please try again.')).toBeTruthy());
  fireEvent.press(screen.getByText('Sign out'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(2));
  expect(mockSignOut).toHaveBeenLastCalledWith({ scope: 'local' });
});

test('owner creation replaces the inbox and returns without losing invitations or the entered name', async () => {
  const screen = render(<HomeAccessScreen userId="alice" email="alice@example.test" onComplete={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Set up my home'));
  expect(screen.queryByText('Your invitations')).toBeNull();
  expect(screen.queryByText('Accept invitation')).toBeNull();
  expect(screen.getByText('alice@example.test')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Home name'), 'Hopewell');
  fireEvent.press(screen.getByLabelText('Back to invitations'));
  expect(screen.getByText('Your invitations')).toBeTruthy();
  expect(screen.getByText('Accept invitation')).toBeTruthy();
  fireEvent.press(screen.getByText('Set up my home'));
  expect(screen.getByLabelText('Home name').props.value).toBe('Hopewell');
  expect(mockBootstrap).not.toHaveBeenCalled();
  expect(mockRespond).not.toHaveBeenCalled();
});

test('an interrupted owner registry read stays on the create page and retries without creating another home', async () => {
  mockList.mockResolvedValueOnce([]);
  mockSync.mockRejectedValueOnce(new Error('Home connection interrupted.'));
  const complete = jest.fn();
  const screen = render(<HomeAccessScreen userId="alice" onComplete={complete} />);
  await waitFor(() => expect(screen.queryByText('Checking your invitations…')).toBeNull());
  fireEvent.press(screen.getByText('Set up my home'));
  fireEvent.changeText(screen.getByLabelText('Home name'), 'Hopewell');
  fireEvent.press(screen.getByText('Create my home'));
  await waitFor(() => expect(screen.getByText('Home connection interrupted.')).toBeTruthy());
  expect(screen.queryByText('Your invitations')).toBeNull();
  expect(screen.getByLabelText('Back to invitations')).toBeDisabled();
  expect(screen.getByText('Create my home')).toBeDisabled();
  fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  expect(mockSync).toHaveBeenCalledTimes(2);
});

test('owner creation errors remain visible alongside the form and allow an explicit resubmission', async () => {
  mockBootstrap.mockRejectedValueOnce(new Error('Unable to reach your home service.'));
  const screen = render(<HomeAccessScreen userId="alice" onComplete={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Set up my home'));
  fireEvent.changeText(screen.getByLabelText('Home name'), 'Hopewell');
  fireEvent.press(screen.getByText('Create my home'));
  await waitFor(() => expect(screen.getByText('Unable to reach your home service.')).toBeTruthy());
  expect(screen.getByText('Retry')).toBeTruthy();
  expect(screen.queryByText('Your invitations')).toBeNull();
  expect(screen.getByLabelText('Back to invitations')).not.toBeDisabled();
  fireEvent.press(screen.getByText('Create my home'));
  await waitFor(() => expect(mockBootstrap).toHaveBeenCalledTimes(2));
});

test('small-phone creation uses compact typography while retaining touch targets and readable text', async () => {
  const dimensions = jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 375, height: 667, scale: 2, fontScale: 1 });
  try {
    const screen = render(<HomeAccessScreen userId="alice" onComplete={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
    expect(screen.getByText('A home that knows you.')).toHaveStyle({ fontSize: 24, lineHeight: 30 });
    fireEvent.press(screen.getByText('Set up my home'));
    expect(screen.getByText('Make it your home')).toHaveStyle({ fontSize: 24, lineHeight: 30 });
    expect(screen.getByLabelText('Home name')).toHaveStyle({ minHeight: 50 });
    expect(screen.getByLabelText('Back to invitations')).toHaveStyle({ minHeight: 44 });
    expect(screen.getByText('Make it your home').props.numberOfLines).toBeUndefined();
  } finally { dimensions.mockRestore(); }
});
