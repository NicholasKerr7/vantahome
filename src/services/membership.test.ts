import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetUser = jest.fn();
let mockMemberships: Array<{ home_id: string; role: string }> = [];
let mockRowsError: Error | null = null;
const mockHomeReads = jest.fn();
jest.mock('./supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() },
  /** Model the query builder without weakening filtering or active-home assertions. */
  from: (table: string) => {
    let columns = '';
    const query = {
      select(value: string) { columns = value; return query; },
      eq(field: string, value: string) { if (field === 'home_id') mockHomeReads(table, value); return query; },
      order() { return query; },
      in() { return query; },
      then(resolve: (value: unknown) => unknown) {
        const rows = table === 'home_members'
          ? columns === 'home_id, role' ? mockMemberships : [{ user_id: 'alice', role: 'member' }]
          : [];
        return Promise.resolve({ data: rows, error: mockRowsError }).then(resolve);
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
});

test('ordinary membership synchronization retains the authorized active household', async () => {
  useHomeStore.setState({ accountHomeId: 'active-home' });
  const result = await syncMembershipFromSupabase('alice');
  expect(result?.homeId).toBe('active-home');
  expect(mockHomeReads.mock.calls.every(([, homeId]) => homeId === 'active-home')).toBe(true);
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
