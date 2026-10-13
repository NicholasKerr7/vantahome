import { beginPasswordRecoverySetup, bindPasswordRecoverySetup, capturePasswordRecoverySetup, completePasswordRecoverySetup, discardPasswordRecoveryIntent, needsPasswordRecoverySetup } from '../passwordRecoverySetup';
import { secureSessionStorage } from '../secureSessionStorage';

const mockGetUser = jest.fn();
const mockValues = new Map<string, string>();
jest.mock('../secureSessionStorage', () => ({ secureSessionStorage: {
  getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
} }));
jest.mock('../supabaseClient', () => ({ supabase: { auth: { getUser: () => mockGetUser() } } }));

const pendingKey = 'vantahome.auth.password-recovery.pending';
const aliceKey = 'vantahome.auth.password-recovery.user.alice';
const bobKey = 'vantahome.auth.password-recovery.user.bob';
beforeEach(() => {
  mockValues.clear(); jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.test', email_confirmed_at: '2026-10-13T10:00:00Z' } }, error: null });
});

test('no completion intent means no extra network verification or password gate', async () => {
  expect(await needsPasswordRecoverySetup('alice')).toBe(false);
  expect(mockGetUser).not.toHaveBeenCalled();
});

test('the pending callback bridges the SDK authentication event and then binds to the same account', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', null);
  expect(await needsPasswordRecoverySetup('alice')).toBe(true);
  await bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' });
  expect(mockValues.has(pendingKey)).toBe(false);
  expect(await needsPasswordRecoverySetup('alice')).toBe(true);
});

test.each([{ id: 'bob', email: 'alice@example.test' }, { id: 'alice', email: 'bob@example.test' }])('cannot bind a signed-in recovery to mismatched account/email %#', async user => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  await expect(bindPasswordRecoverySetup(intent, user)).rejects.toThrow('different account');
  expect(mockValues.has(aliceKey)).toBe(false);
});

test('a different signed-in account cannot inherit an email-only callback record', async () => {
  await beginPasswordRecoverySetup('bob@example.test', null);
  expect(await needsPasswordRecoverySetup('alice')).toBe(false);
});

test('neither pending nor bound callback-started work ages into home admission', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', null);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
  expect(await needsPasswordRecoverySetup('alice')).toBe(true);
  clock.mockRestore();
  await bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' });
  const later = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 24 * 60 * 60 * 1000);
  expect(await needsPasswordRecoverySetup('alice')).toBe(true);
  later.mockRestore();
});

test('a verified callback whose binding write failed remains recoverable after an hour or cold restart', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', null);
  jest.mocked(secureSessionStorage.setItem).mockRejectedValueOnce(new Error('Temporary write failure'));
  await expect(bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' })).rejects.toThrow('write failure');
  expect(mockValues.has(aliceKey)).toBe(false);
  const later = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
  expect(await needsPasswordRecoverySetup('alice')).toBe(true);
  later.mockRestore();
});

test('completion conditionally clears only the reviewed account record', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  await bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' });
  mockValues.set(bobKey, 'other-account-data');
  const completion = await capturePasswordRecoverySetup('alice', 'alice@example.test');
  expect(await completePasswordRecoverySetup(completion)).toBe(true);
  expect(mockValues.has(aliceKey)).toBe(false);
  expect(mockValues.get(bobKey)).toBe('other-account-data');
  expect(mockGetUser).not.toHaveBeenCalled();
});

test('an older acknowledged update cannot remove a newly bound recovery for the same account', async () => {
  const first = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  await bindPasswordRecoverySetup(first, { id: 'alice', email: 'alice@example.test' });
  const completion = await capturePasswordRecoverySetup('alice', 'alice@example.test');
  const next = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  await bindPasswordRecoverySetup(next, { id: 'alice', email: 'alice@example.test' });
  expect(await completePasswordRecoverySetup(completion)).toBe(false);
  expect(JSON.parse(mockValues.get(aliceKey)!).requestId).toBe(next.requestId);
});

test('an older completion cannot remove a newer pending callback for the same account', async () => {
  const first = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  const completion = await capturePasswordRecoverySetup('alice', 'alice@example.test');
  const next = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  expect(await completePasswordRecoverySetup(completion)).toBe(false);
  await discardPasswordRecoveryIntent(first);
  expect(JSON.parse(mockValues.get(pendingKey)!).requestId).toBe(next.requestId);
});

test('a captured pending record can finish after the same request was bound by the SDK callback', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', null);
  const completion = await capturePasswordRecoverySetup('alice', 'alice@example.test');
  await bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' });
  expect(await completePasswordRecoverySetup(completion)).toBe(true);
  expect(mockValues.has(aliceKey)).toBe(false);
});

test('another account pending callback is preserved when finishing this account', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  await bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' });
  const completion = await capturePasswordRecoverySetup('alice', 'alice@example.test');
  const other = await beginPasswordRecoverySetup('bob@example.test', null);
  expect(await completePasswordRecoverySetup(completion)).toBe(true);
  expect(JSON.parse(mockValues.get(pendingKey)!).requestId).toBe(other.requestId);
});

test('unknown damaged global data is never erased by account cleanup', async () => {
  const completion = await capturePasswordRecoverySetup('alice', 'alice@example.test');
  mockValues.set(pendingKey, '{corrupt');
  await expect(completePasswordRecoverySetup(completion)).rejects.toThrow('unavailable');
  expect(mockValues.get(pendingKey)).toBe('{corrupt');
  await expect(needsPasswordRecoverySetup('alice')).rejects.toThrow('unavailable');
});

test('storage read errors and server verification failures remain closed', async () => {
  await beginPasswordRecoverySetup('alice@example.test', 'alice');
  mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('offline') });
  await expect(needsPasswordRecoverySetup('alice')).rejects.toThrow('verify');
  jest.mocked(secureSessionStorage.getItem).mockRejectedValueOnce(new Error('Secure store unavailable'));
  await expect(needsPasswordRecoverySetup('alice')).rejects.toThrow('unavailable');
});

test('completion refuses a bound record claiming the wrong account', async () => {
  mockValues.set(aliceKey, JSON.stringify({ requestId: 'test', email: 'alice@example.test', userId: 'bob', createdAt: Date.now() }));
  await expect(capturePasswordRecoverySetup('alice', 'alice@example.test')).rejects.toThrow('does not match');
  await expect(needsPasswordRecoverySetup('alice')).rejects.toThrow('does not match');
});

test('a confirmed email change cannot bypass unfinished recovery bound to the same Auth user', async () => {
  const intent = await beginPasswordRecoverySetup('alice@example.test', 'alice');
  await bindPasswordRecoverySetup(intent, { id: 'alice', email: 'alice@example.test' });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'changed@example.test', email_confirmed_at: 'today' } }, error: null });
  expect(await needsPasswordRecoverySetup('alice')).toBe(true);
  const completion = await capturePasswordRecoverySetup('alice', 'changed@example.test');
  expect(await completePasswordRecoverySetup(completion)).toBe(true);
});

test('replaced pending callback cannot bind over a new request', async () => {
  const first = await beginPasswordRecoverySetup('alice@example.test', null);
  const next = await beginPasswordRecoverySetup('alice@example.test', null);
  await expect(bindPasswordRecoverySetup(first, { id: 'alice', email: 'alice@example.test' })).rejects.toThrow('replaced');
  expect(JSON.parse(mockValues.get(pendingKey)!).requestId).toBe(next.requestId);
});
