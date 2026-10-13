import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { cancelSentInvitation, listSentInvitations, type SentHomeInvitation } from '../../services/sentInvitations';
import { SentInvitationsPage } from './SentInvitationsPage';
import { isSentInvitationExpired, sentInvitationDate } from './sentInvitationPresentation';

let mockConnected = true;
jest.mock('../../services/supabaseClient', () => ({ get supabase() { return mockConnected ? {} : null; } }));
jest.mock('../../services/sentInvitations', () => ({
  ...jest.requireActual('../../services/sentInvitations'),
  listSentInvitations: jest.fn(), cancelSentInvitation: jest.fn(),
}));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const initial = useHomeStore.getState();
const now = Date.parse('2026-10-13T12:00:00Z');
const invitation: SentHomeInvitation = {
  id: 'invite', homeId: 'home', homeName: 'Willow House', email: 'guest@example.test', role: 'guest', roomIds: ['kitchen', 'removed-room'],
  createdAt: '2026-10-13T11:00:00Z', expiresAt: '2026-10-20T12:00:00Z',
  accessExpiresAt: '2026-10-14T12:00:00Z', revision: '4', status: 'pending', canCancel: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(now);
  mockConnected = true;
  jest.mocked(listSentInvitations).mockResolvedValue([invitation]);
  jest.mocked(cancelSentInvitation).mockResolvedValue({ id: 'invite', homeId: 'home', revision: '4', status: 'cancelled' });
  useHomeStore.setState({ ...initial, authenticatedUserId: 'owner', accountUserId: 'owner', activeHomeId: 'home', accountHomeId: 'home',
    membershipReady: true, sessionEpoch: 1, activeMemberId: 'owner', memberPermissionOverrides: [],
    rooms: [{ id: 'kitchen', name: 'Kitchen' }],
    household: [{ id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' }] });
});
afterEach(() => { useHomeStore.setState(initial, true); jest.useRealTimers(); });

test('shows canonical home context, room availability and both invitation and Guest deadlines', async () => {
  render(<SentInvitationsPage />);
  await act(async () => {});
  expect(screen.getByText('Willow House')).toBeTruthy();
  expect(screen.getByText('Kitchen · Unavailable room')).toBeTruthy();
  expect(screen.getByText(`Guest access ends ${sentInvitationDate(invitation.accessExpiresAt!)}`)).toBeTruthy();
  expect(screen.getByText(sentInvitationDate(invitation.expiresAt))).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Revoke invitation' })).toBeEnabled();
});

test('requires the explicit review, allows cancellation, and presents authoritative success', async () => {
  render(<SentInvitationsPage />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Revoke invitation' }));
  expect(screen.getByText('Revoke this invitation?')).toBeTruthy();
  expect(screen.getByText(/does not remove an existing member/)).toBeTruthy();
  expect(cancelSentInvitation).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Keep invitation' }));
  expect(screen.queryByText('Revoke this invitation?')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Revoke invitation' }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Confirm revoke' })));
  expect(cancelSentInvitation).toHaveBeenCalledWith(invitation, expect.any(Function));
  expect(screen.getByText(/Invitation revoked/)).toBeTruthy();
  expect(screen.getByText('No pending invitations')).toBeTruthy();
  expect(screen.queryByText(invitation.email)).toBeNull();
});

test('offers Retry after loading failure and restores the page after a verified refresh', async () => {
  jest.mocked(listSentInvitations).mockRejectedValueOnce(new Error('Offline'));
  render(<SentInvitationsPage />);
  await act(async () => {});
  expect(screen.getByRole('alert')).toHaveTextContent(/Could not refresh sent invitations/);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Retry sent invitations' })));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText(invitation.email)).toBeTruthy();
});

test('pages complete invitation records and keeps expired invitations non-actionable', async () => {
  jest.mocked(listSentInvitations).mockResolvedValueOnce([invitation, {
    ...invitation, id: 'old', role: 'member', accessExpiresAt: null, roomIds: [], email: 'member@example.test', status: 'expired', canCancel: false,
  }]);
  render(<SentInvitationsPage />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Next sent invitations' }));
  expect(screen.queryByText(invitation.email)).toBeNull();
  expect(screen.getByText('member@example.test')).toBeTruthy();
  expect(screen.getByText('Whole home')).toBeTruthy();
  expect(screen.getByText('Expired')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Revoke invitation' })).toBeDisabled();
});

test('disables confirmation when the invitation expires while its review is open', async () => {
  jest.mocked(listSentInvitations).mockResolvedValueOnce([{ ...invitation, accessExpiresAt: new Date(now + 1000).toISOString() }]);
  render(<SentInvitationsPage />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Revoke invitation' }));
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('button', { name: 'Confirm revoke' })).toBeDisabled();
  expect(screen.getByText(/Close this review and refresh/)).toBeTruthy();
  expect(cancelSentInvitation).not.toHaveBeenCalled();
});

test('clears private email and any open review when the household session is replaced', async () => {
  render(<SentInvitationsPage />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Revoke invitation' }));
  act(() => { useHomeStore.setState({ authenticatedUserId: null, membershipReady: false, sessionEpoch: 2 }); });
  expect(screen.queryByText('Revoke this invitation?')).toBeNull();
  expect(screen.queryByText(invitation.email)).toBeNull();
  expect(screen.getByText('Invitation access unavailable')).toBeTruthy();
});

test('uses an honest unavailable state in local demo without requesting server records', async () => {
  mockConnected = false;
  render(<SentInvitationsPage />);
  await act(async () => {});
  expect(screen.getByText('Connect your household')).toBeTruthy();
  expect(screen.getByText(/Local demo members do not send an email/)).toBeTruthy();
  expect(listSentInvitations).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Revoke invitation' })).toBeNull();
});

test('fails closed on malformed deadlines and uses the earliest valid Guest cutoff', () => {
  expect(isSentInvitationExpired({ ...invitation, expiresAt: 'invalid' }, now)).toBe(true);
  expect(isSentInvitationExpired({ ...invitation, accessExpiresAt: 'invalid' }, now)).toBe(true);
  expect(isSentInvitationExpired({ ...invitation, accessExpiresAt: new Date(now).toISOString() }, now)).toBe(true);
  expect(sentInvitationDate('invalid')).toBe('Unavailable');
});
