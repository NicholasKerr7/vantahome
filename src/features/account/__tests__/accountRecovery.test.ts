import { Buffer } from 'buffer';
import { AccountRecoveryError, loadAccountRecoveryIdentity, requestAccountPasswordRecovery } from '../accountRecovery';
import type { AccountScope } from '../accountIdentity';
import { useHomeStore } from '../../../store/useHomeStore';

const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockBeginFlow = jest.fn();
const mockCancelFlow = jest.fn();
const mockCurrentFlow = jest.fn();
const mockSend = jest.fn();
const mockWait = jest.fn();
jest.mock('buffer', () => jest.requireActual('buffer/'));
jest.mock('../../../services/supabaseClient', () => ({ supabase: { auth: { getSession: () => mockGetSession() } },
  accountAuthVerifier: { auth: { getUser: (...args: unknown[]) => mockGetUser(...args) } } }));
jest.mock('../../../services/authFlow', () => ({
  beginAuthFlow: (...args: unknown[]) => mockBeginFlow(...args), cancelAuthFlow: (...args: unknown[]) => mockCancelFlow(...args),
  isAuthFlowCurrent: (...args: unknown[]) => mockCurrentFlow(...args), sendPasswordRecoveryEmail: (...args: unknown[]) => mockSend(...args),
  waitForAuthExchange: () => mockWait(),
}));

const currentId = 'bc300000-0000-4000-8000-000000000001';
const nextId = 'bc300000-0000-4000-8000-000000000002';
const initial = useHomeStore.getState();
let scope: AccountScope;
let number = 0;

/** Build an untrusted session fixture; the service must still call the Auth verifier. */
function sdkSession(id = currentId) {
  return { data: { session: { access_token: `test.${Buffer.from(JSON.stringify({ session_id: id })).toString('base64')}.test`,
    user: { id: scope.authenticatedUserId, email: 'unverified-cache@example.test' } } }, error: null };
}
/** Control a specific asynchronous boundary without timing-based test races. */
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.resetAllMocks();
  const userId = `account-${++number}`;
  scope = { authenticatedUserId: userId, accountUserId: userId, activeHomeId: null, accountHomeId: null, sessionEpoch: number, membershipReady: false };
  useHomeStore.setState(scope);
  mockGetSession.mockImplementation(async () => sdkSession());
  mockGetUser.mockImplementation(async () => ({ data: { user: { id: scope.authenticatedUserId, email: 'Owner@Example.test', email_confirmed_at: '2026-10-13T10:00:00Z' } }, error: null }));
  mockBeginFlow.mockResolvedValue({ version: 100 });
  mockCancelFlow.mockResolvedValue(undefined);
  mockCurrentFlow.mockReturnValue(true);
  mockSend.mockResolvedValue(undefined);
  mockWait.mockResolvedValue(undefined);
});
afterEach(() => useHomeStore.setState(initial, true));

test('loads only the server-verified email without requiring a household or sending anything', async () => {
  await expect(loadAccountRecoveryIdentity(scope)).resolves.toEqual({ email: 'owner@example.test' });
  expect(mockGetUser).toHaveBeenCalledWith(sdkSession().data.session.access_token);
  expect(mockSend).not.toHaveBeenCalled();
  expect(mockBeginFlow).not.toHaveBeenCalled();
});

test.each([null, '', 'broken', 'a'.repeat(321)])('rejects invalid server email %#', async email => {
  mockGetUser.mockResolvedValue({ data: { user: { id: scope.authenticatedUserId, email, email_confirmed_at: 'today' } }, error: null });
  await expect(loadAccountRecoveryIdentity(scope)).rejects.toBeInstanceOf(AccountRecoveryError);
});

test.each([{ id: 'another', email: 'owner@example.test', email_confirmed_at: 'today' }, { email: 'owner@example.test' }])('rejects wrong or unconfirmed server identity %#', async user => {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toBeInstanceOf(AccountRecoveryError);
  expect(mockSend).not.toHaveBeenCalled();
});

test('a password recovery request uses only the reviewed authoritative email and own flow handle', async () => {
  await requestAccountPasswordRecovery(scope, 'owner@example.test', () => true);
  expect(mockBeginFlow).toHaveBeenCalledWith('recovery', { email: 'owner@example.test' });
  expect(mockSend).toHaveBeenCalledWith({ version: 100 }, 'owner@example.test');
  expect(mockCancelFlow).not.toHaveBeenCalled();
});

test('rejects an outdated reviewed email before beginning an Auth flow', async () => {
  await expect(requestAccountPasswordRecovery(scope, 'old@example.test', () => true)).rejects.toThrow('email changed');
  expect(mockBeginFlow).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

test('cannot send for a replaced same-account session', async () => {
  mockGetUser.mockImplementationOnce(async () => {
    mockGetSession.mockResolvedValue(sdkSession(nextId));
    return { data: { user: { id: scope.authenticatedUserId, email: 'owner@example.test', email_confirmed_at: 'today' } }, error: null };
  });
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('sign-in changed');
  expect(mockSend).not.toHaveBeenCalled();
});

test('rechecks the session after starting the local callback intent and cancels only its own flow', async () => {
  mockBeginFlow.mockImplementationOnce(async () => { mockGetSession.mockResolvedValue(sdkSession(nextId)); return { version: 100 }; });
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('sign-in changed');
  expect(mockCancelFlow).toHaveBeenCalledWith({ version: 100 });
  expect(mockSend).not.toHaveBeenCalled();
});

test.each(['wait', 'verify', 'begin', 'final-session'])('invalidated UI confirmation after %s prevents email dispatch', async boundary => {
  let current = true;
  if (boundary === 'wait') mockWait.mockImplementation(async () => { current = false; });
  if (boundary === 'verify') mockGetUser.mockImplementationOnce(async () => { current = false; return { data: { user: null }, error: null }; });
  if (boundary === 'begin') mockBeginFlow.mockImplementationOnce(async () => { current = false; return { version: 100 }; });
  if (boundary === 'final-session') mockGetSession.mockResolvedValueOnce(sdkSession()).mockResolvedValueOnce(sdkSession()).mockImplementationOnce(async () => { current = false; return sdkSession(); });
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => current)).rejects.toThrow('cancelled');
  expect(mockSend).not.toHaveBeenCalled();
});

test('latches away-and-back account changes while verification is pending', async () => {
  mockGetUser.mockImplementationOnce(async () => {
    useHomeStore.setState({ authenticatedUserId: 'another' }); useHomeStore.setState(scope);
    return { data: { user: { id: scope.authenticatedUserId, email: 'owner@example.test', email_confirmed_at: 'today' } }, error: null };
  });
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('cancelled');
  expect(mockSend).not.toHaveBeenCalled();
});

test('deduplicates requests across component remounts and preserves a one-minute cooldown', async () => {
  const wait = deferred<void>(); mockWait.mockReturnValueOnce(wait.promise);
  const first = requestAccountPasswordRecovery(scope, 'owner@example.test', () => true);
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('already in progress');
  wait.resolve(); await first;
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('one minute');
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('preserves callback intent if the user opens their inbox while an email is being sent', async () => {
  let current = true;
  mockSend.mockImplementationOnce(async () => { current = false; });
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => current)).rejects.toThrow('cancelled');
  expect(mockCancelFlow).not.toHaveBeenCalled();
});

test('keeps uncertain delivery recoverable and never leaks provider errors', async () => {
  mockSend.mockRejectedValueOnce(new Error('https://private/?token=secret user@private.test'));
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('could not be confirmed');
  expect(mockCancelFlow).not.toHaveBeenCalled();
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('one minute');
});

test('normalizes a thrown identity provider failure before it reaches the page', async () => {
  mockGetUser.mockRejectedValueOnce(new Error('private-provider-data'));
  await expect(loadAccountRecoveryIdentity(scope)).rejects.toThrow('could not be verified');
});

test('rejects malformed session identifiers before any provider call or email', async () => {
  mockGetSession.mockResolvedValue(sdkSession('invalid'));
  await expect(requestAccountPasswordRecovery(scope, 'owner@example.test', () => true)).rejects.toThrow('identified');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});
