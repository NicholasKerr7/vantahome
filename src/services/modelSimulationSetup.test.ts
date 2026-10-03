import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEVICES, ROOMS } from '../../packages/home-scene/src/data';
import { useHomeStore, type HomeState } from '../store/useHomeStore';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockSync = jest.fn();
const mockApply = jest.fn();
let mockConfigured = true;
jest.mock('./supabaseClient', () => ({ get supabase() { return mockConfigured ? {
  rpc: (...args: unknown[]) => mockRpc(...args), auth: { getUser: () => mockGetUser() },
} : null; } }));
jest.mock('./membership', () => ({
  syncMembershipFromSupabase: (...args: unknown[]) => mockSync(...args),
  applyMembershipSnapshot: (...args: unknown[]) => mockApply(...args),
}));
import { canPrepareModelSimulation, prepareModelSimulation } from './modelSimulationSetup';

const initial = useHomeStore.getInitialState();
const owner = { id: 'owner', role: 'Owner' as const, name: 'Owner', status: 'home' as const };
const receipt = { homeId: 'home', status: 'created', catalogVersion: 1, roomCount: 20, deviceCount: 92 };

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigured = true;
  useHomeStore.setState({ ...initial, accountUserId: 'owner', authenticatedUserId: 'owner', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, sessionEpoch: 8, activeMemberId: 'owner', household: [owner], rooms: [], devices: [] });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner', email_confirmed_at: '2026-10-01' } }, error: null });
  mockRpc.mockResolvedValue({ data: receipt, error: null });
  mockSync.mockResolvedValue({ homeId: 'home' });
  mockApply.mockReturnValue(true);
});
afterEach(() => useHomeStore.setState(initial));

test('explicit owner action writes only the active home then installs the authorized registry', async () => {
  expect(canPrepareModelSimulation(useHomeStore.getState())).toBe(true);
  expect(mockRpc).not.toHaveBeenCalled();
  await expect(prepareModelSimulation()).resolves.toBeUndefined();
  expect(mockRpc).toHaveBeenCalledWith('create_model_simulation', { target_home_id: 'home' });
  expect(mockSync).toHaveBeenCalledWith('owner', 'home');
  expect(mockApply).toHaveBeenCalledWith({ homeId: 'home' }, 8);
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'different' },
  { activeHomeId: null }, { accountHomeId: 'different' }, { activeMemberId: 'different' },
  { household: [{ ...owner, role: 'Admin' }] }, { household: [{ ...owner, role: 'Guest' }] },
  { rooms: [{ id: 'existing', name: 'Existing' }] },
  { devices: [{ id: 'existing', name: 'Existing', kind: 'light', roomId: 'missing-room', isOn: false }] },
])('rejects unready, non-owner, or configured homes before networking: %j', async (patch) => {
  useHomeStore.setState(patch);
  expect(canPrepareModelSimulation(useHomeStore.getState())).toBe(false);
  await expect(prepareModelSimulation()).rejects.toThrow('owner of an empty home');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('missing configuration cannot fabricate a local model catalog', async () => {
  mockConfigured = false;
  await expect(prepareModelSimulation()).rejects.toThrow('Sign in');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([{ id: 'different', email_confirmed_at: '2026-10-01' }, { id: 'owner' }, null])('requires confirmed current identity: %j', async (user) => {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  await expect(prepareModelSimulation()).rejects.toThrow('Verify your email');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { sessionEpoch: 9 }, { activeHomeId: 'different' }, { household: [{ ...owner, role: 'Member' }] },
  { rooms: [{ id: 'newly-created', name: 'New room' }] },
])('rechecks scope after identity verification: %j', async (patch) => {
  mockGetUser.mockImplementation(async () => {
    useHomeStore.setState(patch);
    return { data: { user: { id: 'owner', email_confirmed_at: '2026-10-01' } }, error: null };
  });
  await expect(prepareModelSimulation()).rejects.toThrow('Your home changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('RPC rejection leaves local rooms untouched', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'Existing rooms require explicit bindings.' }, data: null });
  await expect(prepareModelSimulation()).rejects.toThrow('Existing rooms');
  expect(mockSync).not.toHaveBeenCalled();
  expect(useHomeStore.getState().rooms).toEqual([]);
});

test.each([null, {}, { ...receipt, homeId: 'different' }, { ...receipt, status: 'pending' }, { ...receipt, deviceCount: 0 }])('rejects an unconfirmed server receipt: %j', async (data) => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(prepareModelSimulation()).rejects.toThrow('not confirmed');
  expect(mockSync).not.toHaveBeenCalled();
});

test('idempotent existing receipt can finish interrupted membership loading', async () => {
  mockRpc.mockResolvedValue({ data: { ...receipt, status: 'existing' }, error: null });
  await expect(prepareModelSimulation()).resolves.toBeUndefined();
  expect(mockApply).toHaveBeenCalledTimes(1);
});

test('sign-out during creation cannot install rooms into a later session', async () => {
  mockRpc.mockImplementation(async () => {
    useHomeStore.setState({ sessionEpoch: 9 });
    return { data: receipt, error: null };
  });
  await expect(prepareModelSimulation()).rejects.toThrow('Your home changed');
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
});

test('a household switch during registry refresh discards its late result', async () => {
  mockSync.mockImplementation(async () => { useHomeStore.setState({ activeHomeId: 'new-home' }); return { homeId: 'home' }; });
  await expect(prepareModelSimulation()).rejects.toThrow('Reopen your home');
  expect(mockApply).not.toHaveBeenCalled();
});

test('a failed registry read does not claim local readiness', async () => {
  mockSync.mockRejectedValue(new Error('Connection interrupted. Retry setup.'));
  await expect(prepareModelSimulation()).rejects.toThrow('Connection interrupted');
  expect(mockApply).not.toHaveBeenCalled();
  expect(useHomeStore.getState().devices).toEqual([]);
});

test('the server catalog contains the exact reviewed authored identities, names, kinds and room links', () => {
  const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/017_model_simulation_setup.sql'), 'utf8');
  const rooms = migration.match(/\$model_rooms\$([\s\S]*?)\$model_rooms\$/)?.[1];
  const devices = migration.match(/\$model_devices\$([\s\S]*?)\$model_devices\$/)?.[1];
  expect(JSON.parse(rooms!)).toEqual(ROOMS.map(({ id, name }) => ({ id, name })));
  expect(JSON.parse(devices!)).toEqual(DEVICES.map(({ id, name, roomId, kind }) => ({ id, name, roomId, kind })));
});
