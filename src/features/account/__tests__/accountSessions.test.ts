import { Buffer } from 'buffer';
import { listAccountSessions, signOutOtherAccountSessions } from '../accountSessions';
import type { AccountScope } from '../accountIdentity';
import { useHomeStore } from '../../../store/useHomeStore';

const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockSharedGetUser = jest.fn();
const mockRpc = jest.fn();
const mockSignOut = jest.fn();
const mockConfirm = jest.fn();
// Run token parsing with React Native's installed polyfill, which lacks Node's base64url codec.
jest.mock('buffer', () => jest.requireActual('buffer/'));
jest.mock('../../../services/supabaseClient', () => ({ accountAuthVerifier: {
  auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
}, supabase: {
  auth: { getSession: () => mockGetSession(), getUser: (...args: unknown[]) => mockSharedGetUser(...args),
    admin: { signOut: (...args: unknown[]) => mockSignOut(...args) } },
  rpc: (...args: unknown[]) => mockRpc(...args),
} }));
jest.mock('../../../security/biometricConfirmation', () => ({ confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args) }));

const currentId = 'ad200000-0000-4000-8000-000000000001';
const otherId = 'ad200000-0000-4000-8000-000000000002';
const replacementId = 'ad200000-0000-4000-8000-000000000003';
const scope: AccountScope = { authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a', accountHomeId: 'home-a', sessionEpoch: 2, membershipReady: true };
const initial = useHomeStore.getState();

/** Build an explicitly untrusted token fixture containing only the identifier under test. */
function token(id = currentId): string {
  const claims = Buffer.from(JSON.stringify({ session_id: id })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `test.${claims}.test`;
}

/** Match only the Auth fields consumed by the service without real credentials. */
function sdkSession(id = currentId, userId = 'alice') {
  return { data: { session: { user: { id: userId }, access_token: token(id) } }, error: null };
}

/** Keep inventory fixtures in the server's restricted response shape. */
function row(id = currentId, isCurrent = true) {
  return { id, created_at: '2026-10-13T12:00:00Z', refreshed_at: null, expires_at: null,
    device_label: 'ios', is_current: isCurrent };
}

/** Control a real asynchronous boundary instead of relying on timer ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.resetAllMocks();
  useHomeStore.setState(scope);
  mockGetSession.mockResolvedValue(sdkSession());
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null });
  mockRpc.mockResolvedValue({ data: [row()], error: null });
  mockSignOut.mockResolvedValue({ data: null, error: null });
  mockConfirm.mockResolvedValue(undefined);
});
afterEach(() => useHomeStore.setState(initial, true));

test('loads a sanitized own-session inventory and preserves unknown timestamps', async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ ...row(), created_at: null }, row(otherId, false)], error: null });
  const snapshot = await listAccountSessions(scope);
  expect(snapshot.currentSessionId).toBe(currentId);
  expect(snapshot.sessions[0]).toEqual({ id: currentId, createdAt: null, refreshedAt: null, expiresAt: null, deviceLabel: 'ios', isCurrent: true });
  expect(mockRpc).toHaveBeenCalledWith('list_my_account_sessions');
  expect(JSON.stringify(snapshot)).not.toContain(token());
  expect(mockSharedGetUser).not.toHaveBeenCalled();
});

test.each(['bob', null])('rejects an SDK session belonging to %s before requesting inventory', async userId => {
  mockGetSession.mockResolvedValue({ data: { session: userId ? { user: { id: userId }, access_token: token() } : null }, error: null });
  await expect(listAccountSessions(scope)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('requires the server-verified Auth user to match the displayed account', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'bob' } }, error: null });
  await expect(listAccountSessions(scope)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('an obsolete verification failure cannot clear a replacement login through the shared Auth client', async () => {
  mockSharedGetUser.mockImplementation(async () => {
    useHomeStore.setState({ authenticatedUserId: null });
    return { data: { user: null }, error: { code: 'session_not_found' } };
  });
  mockGetUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 });
    return { data: { user: null }, error: { code: 'session_not_found' } };
  });
  await expect(listAccountSessions(scope)).rejects.toThrow();
  expect(mockSharedGetUser).not.toHaveBeenCalled();
  expect(useHomeStore.getState().authenticatedUserId).toBe('bob');
});

test.each([
  null, [], [row(otherId, false)], [row(), row()], [{ ...row(), is_current: false }],
  [{ ...row(), device_label: '<script>private client</script>' }], [{ ...row(), created_at: 'not a date' }],
  [{ ...row(), refreshed_at: undefined }], Array.from({ length: 51 }, () => row()),
])('rejects malformed or unconfirmed inventory response %#', async data => {
  mockRpc.mockResolvedValueOnce({ data, error: null });
  await expect(listAccountSessions(scope)).rejects.toThrow();
});

test('rejects a malformed session claim before querying the inventory', async () => {
  mockGetSession.mockResolvedValue(sdkSession('invalid-session'));
  await expect(listAccountSessions(scope)).rejects.toThrow();
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([{ authenticatedUserId: 'bob' }, { sessionEpoch: 3 }])('discards a late inventory across identity boundaries %j', async patch => {
  const pending = deferred<{ data: ReturnType<typeof row>[]; error: null }>();
  mockRpc.mockReturnValueOnce(pending.promise);
  const result = listAccountSessions(scope);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  useHomeStore.setState(patch);
  pending.resolve({ data: [row()], error: null });
  await expect(result).rejects.toThrow();
});

test('uses the exact reviewed token with the supported others scope and verifies the result', async () => {
  const snapshot = await signOutOtherAccountSessions(scope, currentId);
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockSignOut).toHaveBeenCalledWith(token(), 'others');
  expect(snapshot.sessions).toHaveLength(1);
  expect(snapshot.sessions[0].isCurrent).toBe(true);
});

test.each([401, 403, 404, 500])('never treats Auth logout %i as confirmed revocation', async status => {
  mockSignOut.mockResolvedValue({ data: null, error: { status, message: 'Server rejection' } });
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow(/could not be confirmed/);
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rejects a replacement login for the same user before calling logout', async () => {
  mockGetSession.mockResolvedValue(sdkSession(replacementId));
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow(/changed/);
  expect(mockSignOut).not.toHaveBeenCalled();
});

test('does not revoke a replacement same-user session arriving during server verification', async () => {
  mockGetUser.mockImplementationOnce(async () => {
    mockGetSession.mockResolvedValue(sdkSession(replacementId));
    return { data: { user: { id: 'alice' } }, error: null };
  });
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow();
  expect(mockSignOut).not.toHaveBeenCalled();
});

test('reports an ambiguous outcome when inventory refresh fails after a confirmed logout request', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Offline' } });
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

test('does not claim success while any other sign-in is still listed', async () => {
  mockRpc.mockResolvedValueOnce({ data: [row(), row(otherId, false)], error: null });
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow(/still listed/);
});

test('serializes simultaneous other-session requests for the same login and permits retry afterward', async () => {
  const biometric = deferred<void>();
  mockConfirm.mockReturnValueOnce(biometric.promise);
  const first = signOutOtherAccountSessions(scope, currentId);
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow(/already in progress/);
  biometric.resolve();
  await first;
  await signOutOtherAccountSessions(scope, currentId);
  expect(mockSignOut).toHaveBeenCalledTimes(2);
});

test('an account change during biometric confirmation prevents all revocation work', async () => {
  mockConfirm.mockImplementationOnce(async () => { useHomeStore.setState({ authenticatedUserId: 'bob', sessionEpoch: 3 }); });
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow();
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockSignOut).not.toHaveBeenCalled();
});

test('biometric cancellation leaves sessions untouched and clears the concurrency guard', async () => {
  mockConfirm.mockRejectedValueOnce(new Error('Cancelled'));
  await expect(signOutOtherAccountSessions(scope, currentId)).rejects.toThrow('Cancelled');
  expect(mockSignOut).not.toHaveBeenCalled();
  await expect(signOutOtherAccountSessions(scope, currentId)).resolves.toBeTruthy();
});

test.each(['biometric', 'verification'])('invalidated confirmation after %s never sends logout', async boundary => {
  let current = true;
  if (boundary === 'biometric') mockConfirm.mockImplementationOnce(async () => { current = false; });
  else mockGetUser.mockImplementationOnce(async () => {
    current = false;
    return { data: { user: { id: 'alice' } }, error: null };
  });
  await expect(signOutOtherAccountSessions(scope, currentId, () => current)).rejects.toThrow(/cancelled/);
  expect(mockSignOut).not.toHaveBeenCalled();
});
