import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';

type ReadResult = { data: unknown[] | null; error: Error | null };

/** Hold one backend response so tests can observe dependencies before data arrives. */
function deferredRead() {
  let resolve!: (result: ReadResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReadResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const mockGetUser = jest.fn();
let mockMemberships: Array<{ home_id: string; role: string }> = [];
let mockRowsError: Error | null = null;
let mockMemberRows: Array<{ user_id: string; role: string; access_expires_at?: string | null; share_interior_layout?: unknown }> = [];
let mockRegistryRows: Record<string, unknown[]> = {};
const mockHomeReads = jest.fn();
const mockReadStarts = jest.fn();
const mockRoomFilters = jest.fn();
let mockPendingReads: Partial<Record<string, Promise<ReadResult>>> = {};
jest.mock('./supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() },
  /** Model the query builder without weakening filtering or active-home assertions. */
  from: (table: string) => {
    let columns = '';
    const query = {
      select(value: string) { columns = value; return query; },
      eq(field: string, value: string) { if (field === 'home_id') mockHomeReads(table, value); return query; },
      order() { return query; },
      in(field: string, values: string[]) { mockRoomFilters(field, values); return query; },
      then(resolve: (value: ReadResult) => unknown, reject?: (error: Error) => unknown) {
        const readKey = table === 'home_members' && columns === 'home_id, role, access_expires_at'
          ? 'memberships' : table;
        mockReadStarts(readKey);
        const rows = table === 'home_members'
          ? columns === 'home_id, role, access_expires_at' ? mockMemberships : mockMemberRows
          : mockRegistryRows[table] ?? [];
        return (mockPendingReads[readKey] ?? Promise.resolve({ data: rows, error: mockRowsError })).then(resolve, reject);
      },
    };
    return query;
  },
} }));

import { applyMembershipSnapshot, syncMembershipFromSupabase, type MembershipSyncResult } from './membership';
import { hydrateHomeAccount, useHomeStore } from '../store/useHomeStore';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await hydrateHomeAccount('alice');
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.test' } }, error: null });
  mockMemberships = [{ home_id: 'oldest-home', role: 'owner' }, { home_id: 'active-home', role: 'member' }];
  mockRowsError = null;
  mockMemberRows = [{ user_id: 'alice', role: 'member' }];
  mockRegistryRows = {};
  mockPendingReads = {};
});

test('ordinary membership synchronization retains the authorized active household', async () => {
  useHomeStore.setState({ accountHomeId: 'active-home' });
  const result = await syncMembershipFromSupabase('alice');
  expect(result?.homeId).toBe('active-home');
  expect(mockHomeReads.mock.calls.every(([, homeId]) => homeId === 'active-home')).toBe(true);
});

test('uses the full name saved during owner enrollment for the current household member', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.test', user_metadata: { full_name: 'Alice Kerr', name: 'Legacy name' } } }, error: null });
  expect((await syncMembershipFromSupabase('alice'))?.household[0].name).toBe('Alice Kerr');
});

test('ignores invalid or empty display-name metadata', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.test', user_metadata: { full_name: {}, name: ' ' } } }, error: null });
  expect((await syncMembershipFromSupabase('alice'))?.household[0].name).toBe('alice@example.test');
});

test('an accepted invitation explicitly selects its home over an existing membership', async () => {
  useHomeStore.setState({ accountHomeId: 'oldest-home' });
  const result = await syncMembershipFromSupabase('alice', 'active-home');
  expect(result?.homeId).toBe('active-home');
});

test('an unauthorized preferred home never falls back to a different home', async () => {
  const result = await syncMembershipFromSupabase('alice', 'unauthorized-home');
  expect(result).toBeNull();
  expect(mockHomeReads).not.toHaveBeenCalled();
});

test('a removed active membership falls back only to another currently authorized home', async () => {
  useHomeStore.setState({ accountHomeId: 'revoked-home' });
  expect((await syncMembershipFromSupabase('alice'))?.homeId).toBe('oldest-home');
});

test('a different authenticated identity cannot query the expected user’s household', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'bob' } }, error: null });
  expect(await syncMembershipFromSupabase('alice')).toBeNull();
  expect(mockHomeReads).not.toHaveBeenCalled();
});

test.each([true, false, undefined, null, 'true', 1])('maps layout sharing only from an explicit server boolean: %j', async (shared) => {
  mockMemberRows = [{ user_id: 'alice', role: 'guest', share_interior_layout: shared }];
  const result = await syncMembershipFromSupabase('alice') as MembershipSyncResult;
  expect(result.household[0].shareInteriorLayout).toBe(shared === true);
  expect(applyMembershipSnapshot(result)).toBe(true);
  expect(useHomeStore.getState().household[0].shareInteriorLayout).toBe(shared === true);
  mockMemberRows = [{ user_id: 'alice', role: 'guest', share_interior_layout: false }];
  const revoked = await syncMembershipFromSupabase('alice') as MembershipSyncResult;
  expect(applyMembershipSnapshot(revoked)).toBe(true);
  expect(useHomeStore.getState().household[0].shareInteriorLayout).toBe(false);
});

test('an unavailable membership read remains an error, not a prompt to create a home', async () => {
  mockRowsError = new Error('Offline');
  await expect(syncMembershipFromSupabase('alice')).rejects.toThrow('Offline');
});

test('a prior session snapshot cannot be installed after the same user signs in again', async () => {
  const epoch = useHomeStore.getState().sessionEpoch;
  const result = await syncMembershipFromSupabase('alice') as MembershipSyncResult;
  await hydrateHomeAccount(null);
  await hydrateHomeAccount('alice');
  expect(applyMembershipSnapshot(result, epoch)).toBe(false);
  expect(useHomeStore.getState().membershipReady).toBe(false);
});

test('an authorized home switch retains account identity while replacing household data', async () => {
  useHomeStore.setState({ accountHomeId: 'oldest-home', profile: { name: 'Alice Kerr', email: 'alice@example.test', timeFormat: '12h', tempUnit: 'C', timezone: 'Auto' }, userName: 'Alice' });
  const result = await syncMembershipFromSupabase('alice', 'active-home') as MembershipSyncResult;
  expect(applyMembershipSnapshot(result, useHomeStore.getState().sessionEpoch)).toBe(true);
  expect(useHomeStore.getState().profile.name).toBe('Alice Kerr');
  expect(useHomeStore.getState().userName).toBe('Alice');
  expect(useHomeStore.getState().accountHomeId).toBe('active-home');
});


test('maps authoritative guest expiry and UUID model bindings without inferring display names', async () => {
  const accessExpiresAt = '2099-01-01T00:00:00Z';
  mockMemberRows = [{ user_id: 'alice', role: 'guest', access_expires_at: accessExpiresAt }];
  mockRegistryRows = {
    rooms: [{ id: 'room-uuid', name: 'Private guest suite', model_room_id: 'bedroom-1' }],
    devices: [{ id: 'device-uuid', room_id: 'room-uuid', name: 'Bedside lamp', kind: 'light', model_device_id: 'bedroom-1-light', simulation_only: true, device_state: { state: { isOn: true, simulationOnly: false }, updated_at: '2026-10-03T12:00:00Z' } }],
    room_members: [{ room_id: 'room-uuid', user_id: 'alice' }],
  };
  const result = await syncMembershipFromSupabase('alice') as MembershipSyncResult;
  expect(result.household[0]).toEqual(expect.objectContaining({ role: 'Guest', accessExpiresAt }));
  expect(result.rooms).toEqual([{ id: 'room-uuid', name: 'Private guest suite', modelRoomId: 'bedroom-1' }]);
  expect(result.devices[0]).toEqual(expect.objectContaining({ id: 'device-uuid', roomId: 'room-uuid', modelDeviceId: 'bedroom-1-light', simulationOnly: true }));
  expect(applyMembershipSnapshot(result)).toBe(true);
  useHomeStore.setState({ devices: [{ ...result.devices[0], observedAt: Date.parse('2099-01-01T00:00:00Z'), modelDeviceId: 'old-binding', simulationOnly: false, isOn: false }] });
  expect(applyMembershipSnapshot(result)).toBe(true);
  expect(useHomeStore.getState().devices[0]).toEqual(expect.objectContaining({ modelDeviceId: 'bedroom-1-light', simulationOnly: true, isOn: false }));
});


test('starts independent reads together and room grants as soon as rooms arrive, then applies one complete policy', async () => {
  const members = deferredRead();
  const rooms = deferredRead();
  const devices = deferredRead();
  const overrides = deferredRead();
  const grants = deferredRead();
  mockPendingReads = {
    home_members: members.promise,
    rooms: rooms.promise,
    devices: devices.promise,
    member_permission_overrides: overrides.promise,
    room_members: grants.promise,
  };
  useHomeStore.setState({ accountHomeId: 'active-home', membershipReady: false });
  const installed = jest.fn((snapshot: MembershipSyncResult | null) => snapshot && applyMembershipSnapshot(snapshot));
  const synchronization = syncMembershipFromSupabase('alice').then(installed);

  await waitFor(() => expect(mockReadStarts.mock.calls.map(([table]) => table)).toEqual(
    expect.arrayContaining(['home_members', 'rooms', 'devices', 'member_permission_overrides']),
  ));
  expect(mockReadStarts).not.toHaveBeenCalledWith('room_members');
  expect(mockHomeReads.mock.calls.every(([, homeId]) => homeId === 'active-home')).toBe(true);
  expect(installed).not.toHaveBeenCalled();

  rooms.resolve({ data: [{ id: 'living-room', name: 'Living room' }], error: null });
  await waitFor(() => expect(mockReadStarts).toHaveBeenCalledWith('room_members'));
  expect(mockRoomFilters).toHaveBeenCalledWith('room_id', ['living-room']);
  expect(installed).not.toHaveBeenCalled();
  expect(useHomeStore.getState().membershipReady).toBe(false);

  members.resolve({ data: [{ user_id: 'alice', role: 'guest', access_expires_at: '2099-01-01T00:00:00Z' }], error: null });
  devices.resolve({ data: [], error: null });
  grants.resolve({ data: [{ room_id: 'living-room', user_id: 'alice' }], error: null });
  expect(installed).not.toHaveBeenCalled();
  overrides.resolve({ data: [{ user_id: 'alice', permission: 'lock.unlock', allowed: false }], error: null });

  expect(await synchronization).toBe(true);
  expect(installed).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState()).toEqual(expect.objectContaining({
    membershipReady: true,
    rooms: [{ id: 'living-room', name: 'Living room' }],
    roomMembers: [{ memberId: 'alice', roomIds: ['living-room'] }],
    memberPermissionOverrides: [{ memberId: 'alice', permission: 'lock.unlock', allowed: false }],
  }));
});

test('does not start household reads while home authorization is still unresolved', async () => {
  const memberships = deferredRead();
  mockPendingReads.memberships = memberships.promise;
  const synchronization = syncMembershipFromSupabase('alice', 'unauthorized-home');
  await waitFor(() => expect(mockReadStarts).toHaveBeenCalledWith('memberships'));
  expect(mockHomeReads).not.toHaveBeenCalled();
  memberships.resolve({ data: [{ home_id: 'active-home', role: 'guest' }], error: null });
  expect(await synchronization).toBeNull();
  expect(mockHomeReads).not.toHaveBeenCalled();
});

test.each(['home_members', 'rooms', 'devices', 'room_members', 'member_permission_overrides'])(
  'a failed %s read rejects the whole snapshot without replacing existing policy',
  async (failedRead) => {
    const failure = deferredRead();
    mockPendingReads[failedRead] = failure.promise;
    mockRegistryRows.rooms = [{ id: 'living-room', name: 'Living room' }];
    const previousOverrides = [{ memberId: 'alice', permission: 'light.control' as const, allowed: false }];
    const previousRooms = [{ id: 'prior-room', name: 'Prior room' }];
    useHomeStore.setState({ membershipReady: false, rooms: previousRooms, memberPermissionOverrides: previousOverrides });
    const installed = jest.fn((snapshot: MembershipSyncResult | null) => snapshot && applyMembershipSnapshot(snapshot));
    const synchronization = syncMembershipFromSupabase('alice').then(installed);
    const rejected = expect(synchronization).rejects.toThrow('Read unavailable');

    await waitFor(() => expect(mockReadStarts).toHaveBeenCalledWith(failedRead));
    failure.resolve({ data: null, error: new Error('Read unavailable') });
    await rejected;
    expect(installed).not.toHaveBeenCalled();
    expect(useHomeStore.getState()).toEqual(expect.objectContaining({
      membershipReady: false,
      rooms: previousRooms,
      memberPermissionOverrides: previousOverrides,
    }));
    if (failedRead === 'rooms') expect(mockReadStarts).not.toHaveBeenCalledWith('room_members');
  },
);

test('a rejected permission transport fails promptly while other reads are still pending', async () => {
  const devices = deferredRead();
  const overrides = deferredRead();
  mockPendingReads = { devices: devices.promise, member_permission_overrides: overrides.promise };
  const synchronization = syncMembershipFromSupabase('alice');
  const rejected = expect(synchronization).rejects.toThrow('Network request failed');
  await waitFor(() => expect(mockReadStarts).toHaveBeenCalledWith('devices'));
  overrides.reject(new Error('Network request failed'));
  await rejected;
  expect(useHomeStore.getState().membershipReady).toBe(false);
  devices.resolve({ data: [], error: null });
});

test('an empty room registry skips room grants without skipping permission overrides', async () => {
  mockRegistryRows.member_permission_overrides = [{ user_id: 'alice', permission: 'light.control', allowed: false }];
  const result = await syncMembershipFromSupabase('alice');
  expect(mockReadStarts).not.toHaveBeenCalledWith('room_members');
  expect(result?.roomMembers).toEqual([]);
  expect(result?.permissionOverrides).toEqual([{ memberId: 'alice', permission: 'light.control', allowed: false }]);
});
