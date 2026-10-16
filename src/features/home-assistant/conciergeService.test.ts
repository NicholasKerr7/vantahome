import { conciergeAvailability, requestConcierge } from './conciergeService';
import { supabase } from '../../services/supabaseClient';

jest.mock('../../services/supabaseClient', () => ({ supabase: { auth: { getSession: jest.fn() }, functions: { invoke: jest.fn() } } }));
const session = supabase!.auth.getSession as jest.Mock;
const invoke = supabase!.functions.invoke as jest.Mock;
const scope = { userId: 'owner', homeId: 'home', isCurrent: () => true };
const context = { mode: 'simulation' as const, capturedAt: Date.now(), devices: [{ id: 'lamp', values: { isOn: false } }] };

beforeEach(() => {
  jest.useFakeTimers();
  session.mockReset().mockResolvedValue({ data: { session: { user: { id: 'owner' }, access_token: 'captured-test-token' } }, error: null });
  invoke.mockReset().mockResolvedValue({ data: { available: false }, error: null });
});
afterEach(() => jest.useRealTimers());

test('availability sends no prompt or household context and reports missing provider truthfully', async () => {
  expect(await conciergeAvailability(scope, new AbortController().signal)).toBe(false);
  expect(invoke).toHaveBeenCalledWith('home-concierge', expect.objectContaining({ body: { operation: 'availability', homeId: 'home' },
    headers: { Authorization: 'Bearer captured-test-token' } }));
});

test('sends only the explicit question and permitted snapshot under the captured identity', async () => {
  invoke.mockResolvedValue({ data: { title: 'A brief' }, error: null });
  await requestConcierge(scope, 'What is on?', context, new AbortController().signal);
  expect(invoke.mock.calls[0][1].body).toEqual({ operation: 'ask', question: 'What is on?', context, homeId: 'home' });
});

test.each([
  [401, 'access', 'Your home access changed'],
  [403, 'access', 'Your home access changed'],
  [404, 'unavailable', 'AI is not connected yet'],
  [429, 'limited', 'reached its request limit'],
  [500, 'service', 'service is temporarily unavailable'],
  [502, 'invalid', 'answer could not be verified'],
  [503, 'service', 'service is temporarily unavailable'],
] as const)('gives a useful recovery for HTTP %s without exposing server details', async (status, code, message) => {
  invoke.mockResolvedValue({ data: null, error: { context: new Response('private server details', { status }) } });
  await expect(conciergeAvailability(scope, new AbortController().signal)).rejects.toMatchObject({ code, message: expect.stringContaining(message) });
});

test('keeps transport failures distinct from service and configuration failures', async () => {
  invoke.mockResolvedValue({ data: null, error: new Error('private network details') });
  await expect(conciergeAvailability(scope, new AbortController().signal)).rejects.toMatchObject({
    code: 'network', message: 'The assistant could not connect. Check your connection and try again.',
  });
});

test.each(['different-user', 'revoked-scope', 'cancelled'] as const)('does not send after %s during authentication', async (change) => {
  const abort = new AbortController();
  if (change === 'different-user') session.mockResolvedValue({ data: { session: { user: { id: 'other' }, access_token: 'other' } }, error: null });
  if (change === 'cancelled') abort.abort();
  await expect(conciergeAvailability({ ...scope, isCurrent: () => change !== 'revoked-scope' }, abort.signal)).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});

test('a stalled auth refresh times out without ever dispatching a provider request', async () => {
  session.mockImplementation(() => new Promise(() => undefined));
  const pending = conciergeAvailability(scope, new AbortController().signal);
  const rejected = expect(pending).rejects.toThrow('could not connect');
  await jest.advanceTimersByTimeAsync(25_000);
  await rejected;
  expect(invoke).not.toHaveBeenCalled();
});

test('cancellation bounds a transport that ignores abort without returning its eventual result', async () => {
  invoke.mockImplementation(() => new Promise(() => undefined));
  const abort = new AbortController();
  const pending = conciergeAvailability(scope, abort.signal);
  const rejected = expect(pending).rejects.toThrow();
  await Promise.resolve(); await Promise.resolve();
  abort.abort();
  await rejected;
});

test('a pre-cancelled request does not start authentication or transport work', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(conciergeAvailability(scope, abort.signal)).rejects.toThrow('home access changed');
  expect(session).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

test.each(['authentication', 'transport'])('handles rejection when %s cancels synchronously before returning its promise', async (step) => {
  const abort = new AbortController();
  let failure: Promise<never> | undefined;
  let attached: jest.SpyInstance | undefined;
  const cancelAndReject = () => {
    abort.abort();
    failure = Promise.reject(new Error('private upstream failure'));
    attached = jest.spyOn(failure, 'then');
    return failure;
  };
  if (step === 'authentication') session.mockImplementation(cancelAndReject);
  else invoke.mockImplementation(cancelAndReject);
  await expect(conciergeAvailability(scope, abort.signal)).rejects.toThrow('could not connect');
  expect(attached).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
  await Promise.resolve();
  if (step === 'authentication') expect(invoke).not.toHaveBeenCalled();
});

test('rejects malformed availability and oversized responses', async () => {
  invoke.mockResolvedValue({ data: { available: 'yes' }, error: null });
  await expect(conciergeAvailability(scope, new AbortController().signal)).rejects.toThrow('could not be verified');
  invoke.mockResolvedValue({ data: { text: 'x'.repeat(25_000) }, error: null });
  await expect(requestConcierge(scope, 'Brief', context, new AbortController().signal)).rejects.toThrow('could not be verified');
});
