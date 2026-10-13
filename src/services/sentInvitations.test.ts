import { hydrateHomeAccount, useHomeStore, type HomeState } from '../store/useHomeStore';
import { cancelSentInvitation, canManageSentInvitations, listSentInvitations, type SentHomeInvitation } from './sentInvitations';

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockConfirm = jest.fn();
jest.mock('./supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() }, rpc: (...args: unknown[]) => mockRpc(...args),
} }));
jest.mock('../security/biometricConfirmation', () => ({ confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args) }));
const actor = 'ab100000-0000-4000-8000-000000000001';
const homeId = 'ab200000-0000-4000-8000-000000000001';
const inviteId = 'ab500000-0000-4000-8000-000000000001';
const row = {
  id: inviteId, home_id: homeId, home_name: 'Canonical home', email: 'guest@example.invalid',
  role: 'guest', room_ids: ['ab300000-0000-4000-8000-000000000001'],
  created_at: '2026-10-13T12:00:00Z', expires_at: '2099-10-20T12:00:00Z', access_expires_at: null,
  revision: '1', status: 'pending', can_cancel: true,
};
const invitation: SentHomeInvitation = {
  id: inviteId, homeId, homeName: row.home_name, email: row.email, role: 'guest', roomIds: row.room_ids,
  createdAt: row.created_at, expiresAt: row.expires_at, accessExpiresAt: null, revision: '1', status: 'pending', canCancel: true,
};

/** Hold one external await while the active account or policy changes. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** Seed an authenticated household without borrowing demo identity or role state. */
async function seed(role: 'Owner' | 'Admin' | 'Member' | 'Guest' = 'Owner') {
  await hydrateHomeAccount(null);
  await hydrateHomeAccount(actor);
  useHomeStore.setState({
    activeHomeId: homeId, accountHomeId: homeId, membershipReady: true, activeMemberId: actor,
    household: [{ id: actor, userId: actor, name: 'Account', role, status: 'home' }],
    roomMembers: [], memberPermissionOverrides: [],
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await seed();
  mockGetUser.mockResolvedValue({ data: { user: { id: actor, email_confirmed_at: '2026-10-01T00:00:00Z' } }, error: null });
  mockConfirm.mockResolvedValue(undefined);
  mockRpc.mockImplementation((name: string) => Promise.resolve({
    data: name === 'list_sent_home_invitations' ? [row] : { id: inviteId, home_id: homeId, revision: '2', status: 'cancelled' }, error: null,
  }));
});

test('lists only the verified current home and preserves authoritative expiry and generation', async () => {
  expect(await listSentInvitations()).toEqual([invitation]);
  expect(mockRpc).toHaveBeenCalledWith('list_sent_home_invitations', { target_home_id: homeId });
  expect(mockConfirm).not.toHaveBeenCalled();
});

test('accepts authoritative expired rows without presenting cancellation as available', async () => {
  mockRpc.mockResolvedValue({ data: [{ ...row, status: 'expired', can_cancel: false }], error: null });
  expect(await listSentInvitations()).toEqual([{ ...invitation, status: 'expired', canCancel: false }]);
});

test.each(['Member', 'Guest'] as const)('a %s cannot access the sender inbox with a custom invitation grant', async role => {
  await seed(role);
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: actor, permission: 'member.invite', allowed: true }] });
  expect(canManageSentInvitations(useHomeStore.getState())).toBe(false);
  await expect(listSentInvitations()).rejects.toThrow('access changed');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a restricted Admin cannot open invitations after invitation authority was denied', async () => {
  await seed('Admin');
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: actor, permission: 'member.invite', allowed: false }] });
  await expect(listSentInvitations()).rejects.toThrow('access changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([
  { home_id: 'ab200000-0000-4000-8000-000000000099' }, { role: 'owner' }, { revision: 1 },
  { revision: '9223372036854775808' }, { status: 'accepted' }, { can_cancel: false },
  { expires_at: 'infinity' }, { room_ids: null }, { email: 'not an email' },
  { home_name: null }, { room_ids: [row.room_ids[0], row.room_ids[0]] },
])('rejects malformed or wrong-home data rather than silently hiding it: %j', async patch => {
  mockRpc.mockResolvedValue({ data: [{ ...row, ...patch }], error: null });
  await expect(listSentInvitations()).rejects.toThrow('could not be verified');
});

test.each([null, {}, Array.from({ length: 101 }, () => row), [row, row]])('rejects invalid/duplicate/oversized list envelopes', async data => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(listSentInvitations()).rejects.toThrow('could not be verified');
});

test('filters no data locally when a backend row exceeds current Admin delegation', async () => {
  await seed('Admin');
  mockRpc.mockResolvedValue({ data: [{ ...row, role: 'admin' }], error: null });
  await expect(listSentInvitations()).rejects.toThrow('access changed');
});

test.each([
  { id: 'other', email_confirmed_at: '2026-10-01T00:00:00Z' }, { id: actor, email_confirmed_at: null },
])('requires the verified email-backed account before either request', async user => {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  await expect(listSentInvitations()).rejects.toThrow('Verify your account email');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['cancelled', 'accepted', 'declined', 'expired'] as const)('returns the actual cancellation race result %s', async status => {
  mockRpc.mockResolvedValue({ data: { id: inviteId, home_id: homeId, revision: '2', status }, error: null });
  expect(await cancelSentInvitation(invitation)).toEqual({ id: inviteId, homeId, revision: '2', status });
  expect(mockConfirm).toHaveBeenCalledWith('Confirm invitation cancellation');
  expect(mockRpc).toHaveBeenCalledWith('cancel_sent_home_invitation', {
    target_home_id: homeId, target_invite_id: inviteId, expected_revision: '1',
  });
});

test('a rejected reissued-generation cancellation remains visible as failure', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Invitation changed. Refresh sent invitations' } });
  await expect(cancelSentInvitation(invitation)).rejects.toThrow('Invitation changed');
});

test.each([null, { id: inviteId, home_id: homeId, status: 'pending', revision: '1' }, { id: inviteId, home_id: 'other', status: 'cancelled', revision: '2' }])('does not claim cancellation without an exact authoritative receipt', async data => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(cancelSentInvitation(invitation)).rejects.toThrow('outcome was not confirmed');
});

test('a regressed generation cannot confirm a reviewed cancellation', async () => {
  mockRpc.mockResolvedValue({ data: { id: inviteId, home_id: homeId, status: 'cancelled', revision: '1' }, error: null });
  await expect(cancelSentInvitation({ ...invitation, revision: '2' })).rejects.toThrow('outcome was not confirmed');
});

test.each(['list', 'cancel'] as const)('a home change after identity verification prevents the %s RPC', async operation => {
  const pending = deferred<Awaited<ReturnType<typeof mockGetUser>>>();
  mockGetUser.mockReturnValue(pending.promise);
  const result = operation === 'list' ? listSentInvitations() : cancelSentInvitation(invitation);
  const rejected = expect(result).rejects.toThrow('access changed');
  await Promise.resolve();
  useHomeStore.setState({ activeHomeId: 'another-home', accountHomeId: 'another-home' });
  pending.resolve({ data: { user: { id: actor, email_confirmed_at: row.created_at } }, error: null });
  await rejected;
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a role change during protected confirmation prevents the cancellation RPC', async () => {
  const confirmation = deferred<void>();
  mockConfirm.mockReturnValue(confirmation.promise);
  const result = cancelSentInvitation(invitation);
  const rejected = expect(result).rejects.toThrow('access changed');
  useHomeStore.setState({ household: useHomeStore.getState().household.map(member => ({ ...member, role: 'Member' })) });
  confirmation.resolve();
  await rejected;
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a dismissed review cannot start protected confirmation', async () => {
  await expect(cancelSentInvitation(invitation, () => false)).rejects.toThrow('was dismissed');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['biometric', 'identity'] as const)('a review dismissed during %s confirmation cannot dispatch cancellation', async stage => {
  const waiting = deferred<unknown>();
  let confirmed = true;
  if (stage === 'biometric') mockConfirm.mockReturnValue(waiting.promise);
  else mockGetUser.mockReturnValue(waiting.promise);
  const result = cancelSentInvitation(invitation, () => confirmed);
  const rejected = expect(result).rejects.toThrow('was dismissed');
  await Promise.resolve();
  confirmed = false;
  waiting.resolve(stage === 'biometric' ? undefined : { data: { user: { id: actor, email_confirmed_at: row.created_at } }, error: null });
  await rejected;
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a temporary policy change cannot revive the old review when permission is restored', async () => {
  const pending = deferred<Awaited<ReturnType<typeof mockGetUser>>>();
  mockGetUser.mockReturnValue(pending.promise);
  const result = listSentInvitations();
  const rejected = expect(result).rejects.toThrow('access changed');
  const original = useHomeStore.getState().memberPermissionOverrides;
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: actor, permission: 'light.control', allowed: false }] });
  useHomeStore.setState({ memberPermissionOverrides: original });
  pending.resolve({ data: { user: { id: actor, email_confirmed_at: row.created_at } }, error: null });
  await rejected;
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['membershipReady', 'activeMemberId', 'accountUserId'] as const)('a temporary %s transition invalidates the old review', async field => {
  const pending = deferred<Awaited<ReturnType<typeof mockGetUser>>>();
  mockGetUser.mockReturnValue(pending.promise);
  const result = listSentInvitations();
  const rejected = expect(result).rejects.toThrow('access changed');
  const original = useHomeStore.getState()[field];
  useHomeStore.setState({ [field]: field === 'membershipReady' ? false : 'other' });
  useHomeStore.setState({ [field]: original });
  pending.resolve({ data: { user: { id: actor, email_confirmed_at: row.created_at } }, error: null });
  await rejected;
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['home', 'account', 'session', 'policy'] as const)('late list data cannot publish after a %s change', async change => {
  const pending = deferred<{ data: unknown; error: null }>();
  mockRpc.mockReturnValue(pending.promise);
  const result = listSentInvitations();
  const rejected = expect(result).rejects.toThrow('access changed');
  await Promise.resolve();
  await Promise.resolve();
  const patch: Partial<HomeState> = change === 'home' ? { activeHomeId: 'other', accountHomeId: 'other' }
    : change === 'account' ? { authenticatedUserId: 'other' }
      : change === 'session' ? { sessionEpoch: useHomeStore.getState().sessionEpoch + 1 }
        : { memberPermissionOverrides: [{ memberId: actor, permission: 'light.control', allowed: false }] };
  useHomeStore.setState(patch);
  pending.resolve({ data: [row], error: null });
  await rejected;
});
