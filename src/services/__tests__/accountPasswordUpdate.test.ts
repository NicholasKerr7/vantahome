import { updateAccountPassword } from '../accountPasswordUpdate';
import { useHomeStore } from '../../store/useHomeStore';

const mockGetSession = jest.fn();
const mockVerifyUser = jest.fn();
const mockSharedGetUser = jest.fn();
const mockSdkUpdate = jest.fn();
const mockSdkSignOut = jest.fn();
const mockFetch = jest.fn();

jest.mock('../supabaseClient', () => ({
  accountAuthVerifier: { auth: { getUser: (...args: unknown[]) => mockVerifyUser(...args) } },
  supabase: { auth: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    getUser: (...args: unknown[]) => mockSharedGetUser(...args),
    updateUser: (...args: unknown[]) => mockSdkUpdate(...args),
    signOut: (...args: unknown[]) => mockSdkSignOut(...args),
  } },
}));

const scope = { authenticatedUserId: 'alice', sessionEpoch: 20 };
const initial = useHomeStore.getState();
const originalFetch = global.fetch;
const initialUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const initialKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const password = 'test-password-only';

/** Create SDK-shaped test credentials with no real account or usable secret. */
function session(token = 'test-captured-token', userId = 'alice') {
  return { data: { session: { user: { id: userId }, access_token: token } }, error: null };
}

/** Keep verified identity fixtures limited to the fields required for password setup. */
function verified(userId = 'alice') {
  return { data: { user: { id: userId, email_confirmed_at: '2026-10-13T12:00:00Z' } }, error: null };
}

/** Model an HTTP acknowledgement without adding a network or Auth SDK dependency. */
function response(value: unknown = { id: 'alice' }, ok = true): Response {
  return { ok, json: jest.fn().mockResolvedValue(value) } as unknown as Response;
}

/** Hold a real async boundary so account and lifecycle races are deterministic. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://account-password.test';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-public-anon-key';
  global.fetch = mockFetch;
  useHomeStore.setState({ ...scope, accountUserId: 'alice' });
  mockGetSession.mockResolvedValue(session());
  mockVerifyUser.mockResolvedValue(verified());
  mockFetch.mockResolvedValue(response());
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  global.fetch = originalFetch;
  useHomeStore.setState(initial, true);
  if (initialUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = initialUrl;
  if (initialKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = initialKey;
});

test('sends one raw PUT bound to the server-verified captured JWT without selecting credentials through an SDK mutation', async () => {
  await expect(updateAccountPassword(scope, password, () => true)).resolves.toBeUndefined();
  expect(mockVerifyUser).toHaveBeenCalledWith('test-captured-token');
  expect(mockGetSession).toHaveBeenCalledTimes(2);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith('https://account-password.test/auth/v1/user', {
    method: 'PUT', redirect: 'error', signal: expect.any(AbortSignal),
    headers: { apikey: 'test-public-anon-key', Authorization: 'Bearer test-captured-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  expect(mockSdkUpdate).not.toHaveBeenCalled();
  expect(mockSharedGetUser).not.toHaveBeenCalled();
  expect(mockSdkSignOut).not.toHaveBeenCalled();
});

test.each(['capture', 'verify', 'recheck'] as const)('rejects account changes during %s before sending a password', async boundary => {
  const change = () => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 21 }); };
  if (boundary === 'capture') mockGetSession.mockImplementationOnce(async () => { change(); return session(); });
  if (boundary === 'verify') mockVerifyUser.mockImplementationOnce(async () => { change(); return verified(); });
  if (boundary === 'recheck') mockGetSession.mockResolvedValueOnce(session()).mockImplementationOnce(async () => { change(); return session(); });
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/account changed/i);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(useHomeStore.getState().authenticatedUserId).toBe('bob');
});

test('a same-account replacement access token is not substituted for the reviewed token', async () => {
  mockGetSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session('test-replacement-token'));
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/sign-in changed/i);
  expect(mockFetch).not.toHaveBeenCalled();
});

test('leaving and returning to an identical account scope cannot revive an abandoned submission', async () => {
  mockVerifyUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 21 });
    useHomeStore.setState({ ...scope, accountUserId: 'alice' });
    return verified();
  });
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/account changed/i);
  expect(mockFetch).not.toHaveBeenCalled();
});

test.each(['initial', 'capture', 'verify', 'recheck'] as const)('a cancelled or backgrounded review at %s never dispatches', async boundary => {
  let current = boundary !== 'initial';
  if (boundary === 'capture') mockGetSession.mockImplementationOnce(async () => { current = false; return session(); });
  if (boundary === 'verify') mockVerifyUser.mockImplementationOnce(async () => { current = false; return verified(); });
  if (boundary === 'recheck') mockGetSession.mockResolvedValueOnce(session()).mockImplementationOnce(async () => { current = false; return session(); });
  await expect(updateAccountPassword(scope, password, () => current)).rejects.toThrow();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('an already-dispatched acknowledgement can finish after backgrounding for the screen to reconcile', async () => {
  const sent = deferred<void>();
  const reply = deferred<Response>();
  let current = true;
  mockFetch.mockImplementationOnce(() => { sent.resolve(); return reply.promise; });
  const update = updateAccountPassword(scope, password, () => current);
  await sent.promise;
  current = false;
  reply.resolve(response());
  await expect(update).resolves.toBeUndefined();
  expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-captured-token');
});

test.each([null, {}, [], 'ok', { id: 'bob' }, { id: null }])('rejects an unconfirmed or wrong-account HTTP response %j', async value => {
  mockFetch.mockResolvedValueOnce(response(value));
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/not confirmed/i);
});

test('a failed HTTP response is not read as successful password setup', async () => {
  const rejected = response({ id: 'alice' }, false);
  mockFetch.mockResolvedValueOnce(rejected);
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/not confirmed/i);
  expect(rejected.json).not.toHaveBeenCalled();
});

test('malformed JSON and transport failures reject without invoking shared SDK mutations', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: jest.fn().mockRejectedValue(new Error('Bad JSON')) });
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow('Bad JSON');
  mockFetch.mockRejectedValueOnce(new Error('Offline'));
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow('Offline');
  expect(mockSdkUpdate).not.toHaveBeenCalled();
  expect(mockSdkSignOut).not.toHaveBeenCalled();
});

test.each([
  { data: { session: null }, error: null },
  { data: { session: { user: { id: 'bob' }, access_token: 'test-token' } }, error: null },
  { data: { session: { user: { id: 'alice' }, access_token: '' } }, error: null },
  { ...session(), error: { message: 'Unavailable' } },
])('rejects an unavailable or mismatched captured SDK session', async value => {
  mockGetSession.mockResolvedValueOnce(value);
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow();
  expect(mockVerifyUser).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test.each([
  { data: { user: null }, error: null },
  verified('bob'),
  { data: { user: { id: 'alice' } }, error: null },
  { ...verified(), error: { code: 'session_not_found' } },
])('requires the isolated verifier to confirm the captured account and its email', async value => {
  mockVerifyUser.mockResolvedValueOnce(value);
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/sign-in/i);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockSharedGetUser).not.toHaveBeenCalled();
  expect(mockSdkSignOut).not.toHaveBeenCalled();
  expect(useHomeStore.getState().authenticatedUserId).toBe('alice');
});

test('an expired captured-token verifier failure cannot mutate a replacement SDK login', async () => {
  mockSharedGetUser.mockImplementation(async () => { useHomeStore.setState({ authenticatedUserId: null }); return { data: { user: null }, error: { code: 'session_not_found' } }; });
  mockVerifyUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 21 });
    return { data: { user: null }, error: { code: 'session_not_found' } };
  });
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow();
  expect(useHomeStore.getState().authenticatedUserId).toBe('bob');
  expect(mockSharedGetUser).not.toHaveBeenCalled();
  expect(mockSdkSignOut).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('deduplicates a pending account update, cleans its subscription, and allows retry after failure', async () => {
  const read = deferred<ReturnType<typeof session>>();
  const stops: jest.Mock[] = [];
  const originalSubscribe = useHomeStore.subscribe;
  jest.spyOn(useHomeStore, 'subscribe').mockImplementation((listener) => {
    const stop = originalSubscribe(listener);
    const tracked = jest.fn(stop);
    stops.push(tracked);
    return tracked;
  });
  mockGetSession.mockReturnValueOnce(read.promise);
  const first = updateAccountPassword(scope, password, () => true);
  const failure = expect(first).rejects.toThrow('Read unavailable');
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/already in progress/i);
  expect(stops[1]).toHaveBeenCalledTimes(1);
  read.reject(new Error('Read unavailable'));
  await failure;
  expect(stops[0]).toHaveBeenCalledTimes(1);
  await expect(updateAccountPassword(scope, password, () => true)).resolves.toBeUndefined();
  expect(stops[2]).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test.each(['http://account-password.test', 'https://name:password@account-password.test',
  'https://account-password.test/path', 'https://account-password.test/?query=1', 'https://account-password.test/#fragment'])('rejects unsafe configured endpoint %s', async url => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = url;
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/unavailable/i);
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('missing public configuration rejects and releases the same-account pending guard', async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  await expect(updateAccountPassword(scope, password, () => true)).rejects.toThrow(/unavailable/i);
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-public-anon-key';
  await expect(updateAccountPassword(scope, password, () => true)).resolves.toBeUndefined();
});

test.each(['short', 'x'.repeat(1025)])('rejects passwords outside the supported input bounds', async value => {
  await expect(updateAccountPassword(scope, value, () => true)).rejects.toThrow(/verified/i);
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test('aborts a stalled HTTP request after its deadline and releases cleanup for a retry', async () => {
  jest.useFakeTimers();
  const sent = deferred<void>();
  mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true });
    sent.resolve();
  }));
  const update = updateAccountPassword(scope, password, () => true);
  const rejected = expect(update).rejects.toThrow('Request aborted');
  await sent.promise;
  jest.advanceTimersByTime(15_000);
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
  await expect(updateAccountPassword(scope, password, () => true)).resolves.toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
});
