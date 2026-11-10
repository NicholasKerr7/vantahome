import { createHouseholdSyncTransport, HouseholdSyncError, parseSharedHomeSnapshot, type SharedHomeScope } from './householdSyncTransport';
import { supabase } from '../../services/supabaseClient';

jest.mock('../../services/supabaseClient', () => ({ supabase: {
  auth: { getSession: jest.fn() }, rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn(),
} }));

const client = supabase!;
const HOME = 'ac290000-0000-4000-8000-000000000201';
const USER = 'ac290000-0000-4000-8000-000000000001';
const DEVICE = 'ac290000-0000-4000-8000-000000000401';
const GATE = 'ac290000-0000-4000-8000-000000000404';
const REQUEST = 'ac290000-0000-4000-8000-000000000501';
const CLIENT = 'ac290000-0000-4000-8000-000000000901';
const scope: SharedHomeScope = { userId: USER, homeId: HOME, key: 'account-home', bindings: [
  { deviceId: DEVICE, modelDeviceId: 'living-light' }, { deviceId: GATE, modelDeviceId: 'entry-gate' },
] };

/** A complete authorized response carries only visible per-device revisions. */
function snapshot() {
  return { homeId: HOME, homeName: 'Willow House', enabled: true, serverTimeMs: 1_790_000_000_000,
    devices: [{ deviceId: DEVICE, modelDeviceId: 'living-light', revision: 1, state: { on: true, level: 45 } }], clock: null };
}

/** Hold requests at a deliberate lifecycle boundary without using network or real credentials. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Build a PostgREST-compatible fluent request with observable headers and cancellation. */
function request(data: unknown = snapshot(), error: { code: string; message: string } | null = null) {
  const builder = { setHeader: jest.fn(), abortSignal: jest.fn().mockResolvedValue({ data, error }) };
  builder.setHeader.mockReturnValue(builder);
  jest.mocked(client.rpc).mockReturnValue(builder as unknown as ReturnType<typeof client.rpc>);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(client.auth.getSession).mockResolvedValue({ data: { session: { user: { id: USER }, access_token: 'fixture-token' } }, error: null } as Awaited<ReturnType<typeof client.auth.getSession>>);
});

test('accepts a bounded authorized snapshot without adding private global activity metadata', () => {
  expect(parseSharedHomeSnapshot(snapshot(), scope)).toEqual(snapshot());
  expect(parseSharedHomeSnapshot({ ...snapshot(), enabled: false, devices: [] }, scope).devices).toEqual([]);
});

test.each([
  ['another home', { ...snapshot(), homeId: GATE }],
  ['global activity revision', { ...snapshot(), revision: 9 }],
  ['unverified home name', { ...snapshot(), homeName: ' ' }],
  ['invalid time', { ...snapshot(), serverTimeMs: Number.POSITIVE_INFINITY }],
  ['disabled state with device information', { ...snapshot(), enabled: false }],
  ['unknown registry identity', { ...snapshot(), devices: [{ ...snapshot().devices[0], deviceId: GATE }] }],
  ['mismatched model identity', { ...snapshot(), devices: [{ ...snapshot().devices[0], modelDeviceId: 'entry-gate' }] }],
  ['duplicate row', { ...snapshot(), devices: [snapshot().devices[0], snapshot().devices[0]] }],
  ['zero revision', { ...snapshot(), devices: [{ ...snapshot().devices[0], revision: 0 }] }],
  ['unsafe revision', { ...snapshot(), devices: [{ ...snapshot().devices[0], revision: Number.MAX_SAFE_INTEGER + 1 }] }],
  ['unknown state field', { ...snapshot(), devices: [{ ...snapshot().devices[0], state: { on: true, level: 50, privateRoom: 'bedroom' } }] }],
  ['out-of-range value', { ...snapshot(), devices: [{ ...snapshot().devices[0], state: { on: true, level: 101 } }] }],
  ['unrecognized row metadata', { ...snapshot(), devices: [{ ...snapshot().devices[0], actor: USER }] }],
])('rejects %s before state ingestion', (_name, candidate) => {
  expect(() => parseSharedHomeSnapshot(candidate, scope)).toThrow(HouseholdSyncError);
});

test('matches mutation receipts to the exact request and supported outcome', () => {
  const candidate = { ...snapshot(), requestId: REQUEST, status: 'applied' };
  expect(parseSharedHomeSnapshot(candidate, scope, REQUEST)).toMatchObject({ requestId: REQUEST, status: 'applied' });
  expect(() => parseSharedHomeSnapshot(candidate, scope, CLIENT)).toThrow(HouseholdSyncError);
  expect(() => parseSharedHomeSnapshot({ ...candidate, status: 'queued' }, scope, REQUEST)).toThrow(HouseholdSyncError);
});

test('requires visible gate access and a bounded lease before exposing clock information', () => {
  const candidate = { ...snapshot(), clock: { clientId: CLIENT, expiresAtMs: snapshot().serverTimeMs + 5000 } };
  expect(parseSharedHomeSnapshot(candidate, scope).clock).toEqual(candidate.clock);
  expect(() => parseSharedHomeSnapshot(candidate, { ...scope, bindings: [scope.bindings[0]] })).toThrow(HouseholdSyncError);
  expect(() => parseSharedHomeSnapshot({ ...candidate, clock: { ...candidate.clock, expiresAtMs: snapshot().serverTimeMs + 7000 } }, scope)).toThrow(HouseholdSyncError);
  expect(() => parseSharedHomeSnapshot({ ...candidate, clock: { ...candidate.clock, userId: USER } }, scope)).toThrow(HouseholdSyncError);
});

test('pins every read to the captured account token and canonical household', async () => {
  const builder = request(); const transport = createHouseholdSyncTransport(scope, () => true);
  await expect(transport.read()).resolves.toEqual(snapshot());
  expect(client.rpc).toHaveBeenCalledWith('get_household_simulation', { target_home_id: HOME });
  expect(builder.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer fixture-token');
  expect(builder.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  transport.close();
});

test('never dispatches for a different current signed-in account', async () => {
  request();
  jest.mocked(client.auth.getSession).mockResolvedValue({ data: { session: { user: { id: GATE }, access_token: 'other-fixture-token' } }, error: null } as Awaited<ReturnType<typeof client.auth.getSession>>);
  const transport = createHouseholdSyncTransport(scope, () => true);
  await expect(transport.read()).rejects.toMatchObject({ code: 'scope_changed' });
  expect(client.rpc).not.toHaveBeenCalled(); transport.close();
});

test('does not start an RPC after teardown while authentication was pending', async () => {
  request(); const auth = deferred<Awaited<ReturnType<typeof client.auth.getSession>>>();
  jest.mocked(client.auth.getSession).mockReturnValue(auth.promise);
  const transport = createHouseholdSyncTransport(scope, () => true);
  const operation = transport.read(); transport.close();
  auth.resolve({ data: { session: { user: { id: USER }, access_token: 'fixture-token' } }, error: null } as Awaited<ReturnType<typeof client.auth.getSession>>);
  await expect(operation).rejects.toMatchObject({ code: 'scope_changed' });
  expect(client.rpc).not.toHaveBeenCalled();
});

test('rejects an account change while authentication is pending', async () => {
  request(); let current = true; const auth = deferred<Awaited<ReturnType<typeof client.auth.getSession>>>();
  jest.mocked(client.auth.getSession).mockReturnValue(auth.promise);
  const transport = createHouseholdSyncTransport(scope, () => current);
  const operation = transport.read(); current = false;
  auth.resolve({ data: { session: { user: { id: USER }, access_token: 'fixture-token' } }, error: null } as Awaited<ReturnType<typeof client.auth.getSession>>);
  await expect(operation).rejects.toMatchObject({ code: 'scope_changed' });
  expect(client.rpc).not.toHaveBeenCalled(); transport.close();
});

test('aborts in-flight work on close and rejects an obsolete success response', async () => {
  const builder = request(); const response = deferred<{ data: unknown; error: null }>();
  builder.abortSignal.mockReturnValue(response.promise);
  const transport = createHouseholdSyncTransport(scope, () => true);
  const operation = transport.read(); await Promise.resolve();
  const signal = builder.abortSignal.mock.calls[0][0] as AbortSignal;
  transport.close(); expect(signal.aborted).toBe(true);
  response.resolve({ data: snapshot(), error: null });
  await expect(operation).rejects.toMatchObject({ code: 'scope_changed' });
});

test.each(['VH409', '42501', 'network'])('preserves %s recovery codes without displaying server diagnostics', async (code) => {
  request(null, { code, message: 'private diagnostic text' });
  const transport = createHouseholdSyncTransport(scope, () => true);
  await expect(transport.read()).rejects.toMatchObject({ code });
  await expect(transport.read()).rejects.not.toThrow('private diagnostic text');
  transport.close();
});

test('forwards one command receipt with its exact captured revisions', async () => {
  request({ ...snapshot(), requestId: REQUEST, status: 'applied' });
  const transport = createHouseholdSyncTransport(scope, () => true);
  const changes = [{ deviceId: DEVICE, modelDeviceId: 'living-light', expectedRevision: 1, state: { on: true, level: 30 } }];
  await transport.patch(REQUEST, CLIENT, 'command', changes);
  expect(client.rpc).toHaveBeenCalledWith('patch_household_simulation', {
    target_home_id: HOME, request_id: REQUEST, client_id: CLIENT, intent: 'command', changes,
  });
  transport.close();
});

test('uses scoped INSERT/UPDATE hints only and ignores late events after teardown', () => {
  const handlers: Array<() => void> = []; let status: (status: string) => void = () => undefined;
  const channel = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockImplementation((_type: string, _filter: unknown, handler: () => void) => { handlers.push(handler); return channel; });
  channel.subscribe.mockImplementation((handler: (value: string) => void) => { status = handler; return channel; });
  jest.mocked(client.channel).mockReturnValue(channel as unknown as ReturnType<typeof client.channel>);
  const onChange = jest.fn(); const connection = jest.fn();
  const transport = createHouseholdSyncTransport(scope, () => true);
  const unsubscribe = transport.subscribe(onChange, connection);
  expect(channel.on.mock.calls).toHaveLength(2);
  expect(channel.on.mock.calls.every(([, filter]) => ['INSERT', 'UPDATE'].includes(filter.event)
    && filter.table === 'household_simulation_devices' && filter.filter === `home_id=eq.${HOME}`)).toBe(true);
  handlers[0](); status('SUBSCRIBED');
  expect(onChange).toHaveBeenCalledTimes(1); expect(connection).toHaveBeenLastCalledWith(true);
  transport.close(); handlers[0](); status('CLOSED');
  expect(onChange).toHaveBeenCalledTimes(1); expect(connection).toHaveBeenCalledTimes(1);
  unsubscribe(); expect(client.removeChannel).toHaveBeenCalledWith(channel);
});
