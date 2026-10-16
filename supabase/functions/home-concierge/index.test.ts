import type { ConciergeHandlerDependencies } from '../_shared/conciergeHandler';

let mockDependencies: ConciergeHandlerDependencies;
const mockCaller = { auth: { getUser: jest.fn() }, rpc: jest.fn(), from: jest.fn() };
const mockClient = jest.fn((_request: Request) => mockCaller);
jest.mock('../_shared/supabaseClient.ts', () => ({ getSupabaseClient: (request: Request) => mockClient(request) }));
jest.mock('../_shared/conciergeHandler.ts', () => ({ createConciergeHandler: (deps: ConciergeHandlerDependencies) => {
  mockDependencies = deps;
  return () => new Response();
} }));
jest.mock('../_shared/edgeSecurity.ts', () => ({ createEdgeRequestContext: jest.fn(), enforceEdgeRateLimit: jest.fn(), finalizeEdgeResponse: jest.fn() }));

const homeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deviceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const roomId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const request = new Request('https://edge.example.test/home-concierge');
const environment = globalThis as unknown as { Deno?: { serve: (handler: unknown) => void; env: { get: (name: string) => string | undefined } } };
const originalDeno = environment.Deno;

/** Model Supabase's chain without giving adapter tests any network or privileged client. */
function query(data: unknown) {
  const result = {
    select: jest.fn(), eq: jest.fn(), in: jest.fn(), limit: jest.fn(),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data, error: null }),
  };
  for (const method of [result.select, result.eq, result.in, result.limit]) method.mockReturnValue(result);
  return result;
}

beforeAll(() => {
  environment.Deno = { serve: () => undefined, env: { get: () => undefined } };
  require('./index.ts');
});
afterAll(() => { environment.Deno = originalDeno; });
beforeEach(() => {
  jest.clearAllMocks();
  mockCaller.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mockCaller.rpc.mockResolvedValue({ data: true, error: null });
  mockCaller.from.mockImplementation((table: string) => query(table === 'rooms'
    ? [{ id: roomId, name: 'Living room' }]
    : [{ id: deviceId, name: 'Pendant', kind: 'light', room_id: roomId, simulation_only: true }]));
});

it('authenticates the incoming token and never accepts a caller identity parameter', async () => {
  expect(await mockDependencies.authenticate(request)).toBe(userId);
  expect(mockClient).toHaveBeenCalledWith(request);
  mockCaller.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: new Error('revoked') });
  expect(await mockDependencies.authenticate(request)).toBeNull();
});

it('queries one home with caller RLS, simulation-only registry rows and explicit comfort kinds', async () => {
  const registry = query([{ id: deviceId, name: 'Pendant', kind: 'light', room_id: roomId, simulation_only: true }]);
  const rooms = query([{ id: roomId, name: 'Living room' }]);
  mockCaller.from.mockImplementation((table: string) => table === 'devices' ? registry : rooms);
  expect(await mockDependencies.readHome(request, userId, homeId)).toEqual({ canDraft: true, devices: [
    { id: deviceId, name: 'Pendant', roomName: 'Living room', kind: 'light', controllable: true },
  ] });
  expect(registry.select).toHaveBeenCalledWith('id, name, kind, room_id, simulation_only');
  expect(registry.eq).toHaveBeenCalledWith('home_id', homeId);
  expect(registry.eq).toHaveBeenCalledWith('simulation_only', true);
  expect(registry.in).toHaveBeenCalledWith('kind', ['light', 'ac', 'fan', 'blinds', 'tv', 'speaker']);
  expect(rooms.eq).toHaveBeenCalledWith('home_id', homeId);
  expect(mockCaller.from.mock.calls.map(([table]) => table)).toEqual(['devices', 'rooms']);
  expect(mockCaller.rpc).toHaveBeenCalledWith('can_access_home', { hid: homeId });
});

it('stops on denied or failed membership without reading rooms or registry data', async () => {
  mockCaller.rpc.mockResolvedValue({ data: false, error: null });
  expect(await mockDependencies.readHome(request, userId, homeId)).toBeNull();
  expect(mockCaller.from).not.toHaveBeenCalled();
  mockCaller.rpc.mockResolvedValue({ data: null, error: new Error('database failure') });
  await expect(mockDependencies.readHome(request, userId, homeId)).rejects.toThrow('Home access unavailable');
});

it('keeps read visibility separate from action and scene-management permissions', async () => {
  mockCaller.rpc.mockImplementation(async (name: string, args: Record<string, string>) => ({
    data: name === 'can_access_home' || args.requested_permission === 'device.view', error: null,
  }));
  expect(await mockDependencies.readHome(request, userId, homeId)).toEqual({ canDraft: false, devices: [
    { id: deviceId, name: 'Pendant', roomName: 'Living room', kind: 'light', controllable: false },
  ] });
});

it('does not reveal any fixture when device.view is denied', async () => {
  mockCaller.rpc.mockImplementation(async (name: string, args: Record<string, string>) => ({
    data: name === 'can_access_home' || args.requested_permission !== 'device.view', error: null,
  }));
  expect(await mockDependencies.readHome(request, userId, homeId)).toEqual({ canDraft: false, devices: [] });
});

it.each([
  ['light', 'light.control'], ['ac', 'climate.control'], ['fan', 'device.control'],
  ['blinds', 'device.control'], ['tv', 'device.control'], ['speaker', 'device.control'],
])('uses the SQL action permission for %s without a generic-control shortcut', async (kind, permission) => {
  mockCaller.from.mockImplementation((table: string) => query(table === 'rooms'
    ? [{ id: roomId, name: 'Living room' }]
    : [{ id: deviceId, name: 'Comfort device', kind, room_id: roomId, simulation_only: true }]));
  mockCaller.rpc.mockImplementation(async (name: string, args: Record<string, string>) => ({
    data: name === 'can_access_home' || args.requested_permission !== permission, error: null,
  }));
  expect((await mockDependencies.readHome(request, userId, homeId))?.devices).toEqual([
    expect.objectContaining({ kind, controllable: false }),
  ]);
  expect(mockCaller.rpc).toHaveBeenCalledWith('effective_member_has_action_permission', {
    target_home_id: homeId, target_user_id: userId, requested_permission: permission,
  });
});

it.each(['window', 'door', 'gate', 'garage', 'smoke', 'camera', 'gas-meter', 'gas-leak', 'stove'])('excludes %s even if a registry mock bypasses query filtering', async (kind) => {
  mockCaller.from.mockImplementation((table: string) => query(table === 'rooms'
    ? [{ id: roomId, name: 'Living room' }]
    : [{ id: deviceId, name: 'Forbidden', kind, room_id: roomId, simulation_only: true }]));
  expect((await mockDependencies.readHome(request, userId, homeId))?.devices).toEqual([]);
});

it.each([{ simulation_only: false }, { room_id: 'foreign-room' }])('excludes live or inaccessible-room devices', async (invalid) => {
  mockCaller.from.mockImplementation((table: string) => query(table === 'rooms'
    ? [{ id: roomId, name: 'Living room' }]
    : [{ id: deviceId, name: 'Pendant', kind: 'light', room_id: roomId, simulation_only: true, ...invalid }]));
  expect((await mockDependencies.readHome(request, userId, homeId))?.devices).toEqual([]);
});

it('fails closed on a permission RPC error', async () => {
  mockCaller.rpc.mockImplementation(async (name: string) => name === 'can_access_home'
    ? { data: true, error: null } : { data: null, error: new Error('permission failed') });
  await expect(mockDependencies.readHome(request, userId, homeId)).rejects.toThrow('Permissions unavailable');
});

it('does not claim provider readiness without the server key', () => {
  expect(mockDependencies.configured()).toBe(false);
});
