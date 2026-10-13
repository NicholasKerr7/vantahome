import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { cancelSentInvitation, listSentInvitations, type SentHomeInvitation, type SentInvitationCancellation } from '../../services/sentInvitations';
import { useSentInvitations } from './useSentInvitations';

jest.mock('../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../../services/sentInvitations', () => ({
  ...jest.requireActual('../../services/sentInvitations'),
  listSentInvitations: jest.fn(), cancelSentInvitation: jest.fn(),
}));

const initial = useHomeStore.getState();
const now = Date.parse('2026-10-13T12:00:00Z');
const invitation: SentHomeInvitation = {
  id: 'invite', homeId: 'home', homeName: 'Willow House', email: 'guest@example.test', role: 'guest', roomIds: ['kitchen'],
  createdAt: '2026-10-13T11:00:00Z', expiresAt: '2026-10-20T12:00:00Z',
  accessExpiresAt: '2026-10-14T12:00:00Z', revision: '4', status: 'pending', canCancel: true,
};
const cancelled: SentInvitationCancellation = { id: invitation.id, homeId: invitation.homeId, revision: '4', status: 'cancelled' };
const lifecycleListeners = new Set<(state: AppStateStatus) => void>();

/** Hold one external reply while the test changes a session, policy or visible confirmation. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(now);
  lifecycleListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    lifecycleListeners.add(listener);
    return { remove: () => { lifecycleListeners.delete(listener); } };
  });
  jest.mocked(listSentInvitations).mockResolvedValue([invitation]);
  jest.mocked(cancelSentInvitation).mockResolvedValue(cancelled);
  useHomeStore.setState({ ...initial, authenticatedUserId: 'owner', accountUserId: 'owner', activeHomeId: 'home', accountHomeId: 'home',
    membershipReady: true, sessionEpoch: 1, activeMemberId: 'owner', memberPermissionOverrides: [],
    household: [{ id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' }] });
});
afterEach(() => { useHomeStore.setState(initial, true); jest.restoreAllMocks(); jest.useRealTimers(); });

test('loads server records and awaits a reviewed, authoritative cancellation without changing members', async () => {
  const response = deferred<SentInvitationCancellation>();
  jest.mocked(cancelSentInvitation).mockReturnValue(response.promise);
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  expect(result.current.invitations).toEqual([invitation]);
  await act(async () => { await result.current.revoke(); });
  expect(cancelSentInvitation).not.toHaveBeenCalled();
  act(() => result.current.reviewInvitation(invitation));
  const revoke = result.current.revoke;
  await act(async () => { void revoke(); void revoke(); });
  expect(cancelSentInvitation).toHaveBeenCalledTimes(1);
  expect(result.current.invitations).toHaveLength(1);
  expect(result.current.outcome).toBeNull();
  expect(result.current.busy).toBe('revoke');
  await act(async () => { response.resolve(cancelled); });
  expect(result.current.invitations).toEqual([]);
  expect(result.current.outcome).toContain('Invitation revoked');
  expect(useHomeStore.getState().household).toEqual([{ id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' }]);
});

test.each(['accepted', 'declined', 'expired'] as const)('describes the actual %s race without claiming a revoke', async status => {
  jest.mocked(cancelSentInvitation).mockResolvedValue({ ...cancelled, status });
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  await act(async () => { await result.current.revoke(); });
  expect(result.current.outcome).toContain(status);
  expect(result.current.outcome).not.toContain('Invitation revoked');
  expect(result.current.invitations).toHaveLength(status === 'expired' ? 1 : 0);
  if (status === 'expired') expect(result.current.invitations[0].canCancel).toBe(false);
});

test('keeps a failed mutation unconfirmed and requires a fresh list before another review', async () => {
  jest.mocked(cancelSentInvitation).mockRejectedValueOnce(new Error('Uncertain server response'));
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  await act(async () => { await result.current.revoke(); });
  expect(result.current.error).toContain('Revocation was not confirmed');
  expect(result.current.invitations).toEqual([invitation]);
  expect(result.current.outcome).toBeNull();
  act(() => result.current.reviewInvitation(invitation));
  expect(result.current.review).toBeNull();
  await act(async () => { await result.current.refresh(); });
  act(() => result.current.reviewInvitation(invitation));
  expect(result.current.review).toBe(invitation);
});

test('exposes list failure and preserves the last verified records until a successful retry', async () => {
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  jest.mocked(listSentInvitations).mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.error).toContain('Could not refresh');
  expect(result.current.invitations).toEqual([invitation]);
  act(() => result.current.reviewInvitation(invitation));
  expect(result.current.review).toBeNull();
  jest.mocked(listSentInvitations).mockResolvedValueOnce([]);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.invitations).toEqual([]);
  expect(result.current.loaded).toBe(true);
  expect(result.current.error).toBeNull();
});

test.each(['success', 'failure'] as const)('hides delayed load %s after a session change and keeps the new load', async outcome => {
  const response = deferred<SentHomeInvitation[]>();
  jest.mocked(listSentInvitations).mockReturnValueOnce(response.promise).mockResolvedValueOnce([]);
  const { result } = renderHook(useSentInvitations);
  await act(async () => { useHomeStore.setState({ sessionEpoch: 2 }); });
  await act(async () => { if (outcome === 'success') response.resolve([invitation]); else response.reject(new Error('Private old failure')); });
  expect(result.current.invitations).toEqual([]);
  expect(result.current.error).toBeNull();
  expect(result.current.loaded).toBe(true);
});

test.each(['success', 'failure'] as const)('discards revoke %s when the current home changes', async outcome => {
  const response = deferred<SentInvitationCancellation>();
  jest.mocked(cancelSentInvitation).mockReturnValueOnce(response.promise);
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  await act(async () => { void result.current.revoke(); });
  jest.mocked(listSentInvitations).mockResolvedValueOnce([]);
  await act(async () => { useHomeStore.setState({ activeHomeId: 'other', accountHomeId: 'other' }); });
  expect(result.current.review).toBeNull();
  expect(result.current.invitations).toEqual([]);
  await act(async () => { if (outcome === 'success') response.resolve(cancelled); else response.reject(new Error('Private old failure')); });
  expect(result.current.error).toBeNull();
  expect(result.current.outcome).toBeNull();
});

test('invalidates old callbacks even when the policy changes away and back before React renders', async () => {
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  const { revoke, refresh, reviewInvitation } = result.current;
  await act(async () => {
    useHomeStore.setState({ memberPermissionOverrides: [{ memberId: 'owner', permission: 'member.invite', allowed: false }] });
    useHomeStore.setState({ memberPermissionOverrides: [] });
    await revoke();
    await refresh();
    reviewInvitation(invitation);
  });
  expect(cancelSentInvitation).not.toHaveBeenCalled();
  expect(listSentInvitations).toHaveBeenCalledTimes(2);
  expect(result.current.review).toBeNull();
});

test('hides loaded emails and confirmation immediately on loss of authority', async () => {
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  const staleRevoke = result.current.revoke;
  act(() => { useHomeStore.setState({ household: [{ id: 'owner', userId: 'owner', name: 'Owner', role: 'Member', status: 'home' }] }); });
  expect(result.current.authorized).toBe(false);
  expect(result.current.review).toBeNull();
  expect(result.current.invitations).toEqual([]);
  await act(async () => { await staleRevoke(); });
  expect(cancelSentInvitation).not.toHaveBeenCalled();
});

test('expires an open review at the Guest deadline and rechecks stale button callbacks', async () => {
  const expiring = { ...invitation, accessExpiresAt: new Date(now + 1000).toISOString() };
  jest.mocked(listSentInvitations).mockResolvedValueOnce([expiring]);
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(expiring));
  const staleRevoke = result.current.revoke;
  act(() => { jest.advanceTimersByTime(1000); });
  expect(result.current.now).toBe(now + 1000);
  await act(async () => { await staleRevoke(); });
  expect(cancelSentInvitation).not.toHaveBeenCalled();
});

test('refresh invalidates an old review and prevents a reissued generation from being revoked', async () => {
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  const staleRevoke = result.current.revoke;
  jest.mocked(listSentInvitations).mockResolvedValueOnce([{ ...invitation, revision: '5' }]);
  await act(async () => { await result.current.refresh(); await staleRevoke(); });
  expect(cancelSentInvitation).not.toHaveBeenCalled();
  act(() => result.current.reviewInvitation(invitation));
  expect(result.current.review).toBeNull();
});

test('ignores a completed response and retained callbacks after leaving the page', async () => {
  const response = deferred<SentHomeInvitation[]>();
  jest.mocked(listSentInvitations).mockReturnValueOnce(response.promise);
  const hook = renderHook(useSentInvitations);
  const staleRefresh = hook.result.current.refresh;
  hook.unmount();
  await act(async () => { response.resolve([invitation]); await staleRefresh(); });
  expect(listSentInvitations).toHaveBeenCalledTimes(1);
});

test('backgrounding clears the private review and resume requires a fresh list and new confirmation', async () => {
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  const retained = result.current.revoke;
  act(() => { lifecycleListeners.forEach(listener => listener('inactive')); });
  expect(result.current.review).toBe(invitation);
  act(() => { lifecycleListeners.forEach(listener => listener('background')); });
  expect(result.current.invitations).toEqual([]);
  expect(result.current.review).toBeNull();
  await act(async () => { await retained(); });
  expect(cancelSentInvitation).not.toHaveBeenCalled();
  await act(async () => { lifecycleListeners.forEach(listener => listener('active')); });
  expect(listSentInvitations).toHaveBeenCalledTimes(2);
  expect(result.current.review).toBeNull();
});

test.each(['background', 'unmount'] as const)('invalidates a pending biometric/service gate on %s', async transition => {
  const response = deferred<SentInvitationCancellation>();
  jest.mocked(cancelSentInvitation).mockReturnValueOnce(response.promise);
  const hook = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => hook.result.current.reviewInvitation(invitation));
  await act(async () => { void hook.result.current.revoke(); });
  const confirmed = jest.mocked(cancelSentInvitation).mock.calls[0][1]!;
  expect(confirmed()).toBe(true);
  if (transition === 'unmount') hook.unmount();
  else act(() => { lifecycleListeners.forEach(listener => listener('background')); });
  expect(confirmed()).toBe(false);
  await act(async () => { response.reject(new Error('Confirmation no longer current')); });
});

test('rechecks the list after an already-dispatched revoke settles later than resume refresh', async () => {
  const response = deferred<SentInvitationCancellation>();
  jest.mocked(cancelSentInvitation).mockReturnValueOnce(response.promise);
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  await act(async () => { void result.current.revoke(); });
  act(() => { lifecycleListeners.forEach(listener => listener('background')); });
  await act(async () => { lifecycleListeners.forEach(listener => listener('active')); });
  expect(result.current.invitations).toEqual([invitation]);
  jest.mocked(listSentInvitations).mockResolvedValueOnce([]);
  await act(async () => { response.resolve(cancelled); });
  expect(listSentInvitations).toHaveBeenCalledTimes(3);
  expect(result.current.invitations).toEqual([]);
  expect(result.current.outcome).toBeNull();
});

test('keeps the requested biometric review during a temporary iOS inactive prompt', async () => {
  const response = deferred<SentInvitationCancellation>();
  jest.mocked(cancelSentInvitation).mockReturnValueOnce(response.promise);
  const { result } = renderHook(useSentInvitations);
  await act(async () => {});
  act(() => result.current.reviewInvitation(invitation));
  await act(async () => { void result.current.revoke(); });
  const confirmed = jest.mocked(cancelSentInvitation).mock.calls[0][1]!;
  act(() => { lifecycleListeners.forEach(listener => listener('inactive')); });
  expect(confirmed()).toBe(true);
  act(() => { lifecycleListeners.forEach(listener => listener('active')); });
  await act(async () => { response.resolve(cancelled); });
  expect(result.current.outcome).toContain('Invitation revoked');
});
