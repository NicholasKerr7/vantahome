import { useHomeStore, type HomeState, type HouseholdMember } from '../store/useHomeStore';
import type { MembershipSyncResult } from './membership';
import { saveMemberInteriorLayout } from './memberLayout';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockConfirm = jest.fn();
const mockSyncMembership = jest.fn();
let mockClientAvailable = true;

jest.mock('./supabaseClient', () => ({
  get supabase() {
    return mockClientAvailable ? { rpc: (...args: unknown[]) => mockRpc(...args), auth: { getUser: () => mockGetUser() } } : null;
  },
}));
jest.mock('../security/biometricConfirmation', () => ({ confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('./membership', () => ({
  ...jest.requireActual<typeof import('./membership')>('./membership'),
  syncMembershipFromSupabase: (...args: unknown[]) => mockSyncMembership(...args),
}));

const seed = useHomeStore.getState();
const owner: HouseholdMember = { id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' };
const guest: HouseholdMember = { id: 'guest', userId: 'guest', name: 'Guest', role: 'Guest', status: 'away', shareInteriorLayout: false };
let snapshot: MembershipSyncResult;

beforeEach(() => {
  jest.resetAllMocks();
  mockClientAvailable = true;
  useHomeStore.setState({ ...seed, authenticatedUserId: 'owner', accountUserId: 'owner', activeMemberId: 'owner',
    accountHomeId: 'home', activeHomeId: 'home', sessionEpoch: 7, membershipReady: true, household: [owner, guest],
    rooms: [{ id: 'private-room', name: 'Private room' }],
    devices: [{ id: 'private-device', name: 'Private light', kind: 'light', roomId: 'private-room', isOn: false }],
    roomMembers: [{ memberId: 'guest', roomIds: [] }], memberPermissionOverrides: [{ memberId: 'guest', permission: 'light.control', allowed: false }],
  });
  const state = useHomeStore.getState();
  snapshot = { homeId: 'home', activeMemberId: 'owner', household: [owner, { ...guest, shareInteriorLayout: true }],
    rooms: state.rooms, devices: state.devices, roomMembers: state.roomMembers, permissionOverrides: state.memberPermissionOverrides };
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mockConfirm.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockSyncMembership.mockImplementation(async () => snapshot);
});

afterEach(() => { mockClientAvailable = true; useHomeStore.setState(seed); });

test.each(['Admin', 'Member', 'Guest', 'Tenant'] as const)('rejects %s authority without prompting or writing', async (role) => {
  useHomeStore.setState({ household: [{ ...owner, role }, guest] });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('home owner');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'other' },
  { accountHomeId: 'other-home' }, { activeHomeId: null }, { activeMemberId: 'guest' },
])('rejects inconsistent membership before network writes: %j', async (patch) => {
  useHomeStore.setState(patch);
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('home owner');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rejects unavailable cloud configuration without a local grant', async () => {
  mockClientAvailable = false;
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('home owner');
  expect(useHomeStore.getState().household[1].shareInteriorLayout).toBe(false);
});

test.each(['Owner', 'Admin', 'Member'] as const)('rejects whole-home %s targets', async (role) => {
  useHomeStore.setState({ household: [owner, { ...guest, role }] });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('Guest or Tenant');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rejects a member from another home before confirmation', async () => {
  await expect(saveMemberInteriorLayout('other-home-guest', true)).rejects.toThrow('Guest or Tenant');
  expect(mockConfirm).not.toHaveBeenCalled();
});

test.each(['2000-01-01T00:00:00Z', 'invalid'])('rejects expired or invalid guest expiry %s', async (accessExpiresAt) => {
  useHomeStore.setState({ household: [owner, { ...guest, accessExpiresAt }] });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('expired');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('allows revoking an expired guest grant', async () => {
  useHomeStore.setState({ household: [owner, { ...guest, shareInteriorLayout: true, accessExpiresAt: '2000-01-01T00:00:00Z' }] });
  snapshot.household = [owner, { ...guest, shareInteriorLayout: false, accessExpiresAt: '2000-01-01T00:00:00Z' }];
  await expect(saveMemberInteriorLayout('guest', false)).resolves.toBeUndefined();
  expect(useHomeStore.getState().household[1].shareInteriorLayout).toBe(false);
});

test('canceled confirmation performs no network write', async () => {
  mockConfirm.mockRejectedValue(new Error('Canceled'));
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('Canceled');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('verifies the authenticated API identity before writing', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('account changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['confirmation', 'identity', 'write', 'refresh'] as const)('rejects a home change while %s is pending', async (phase) => {
  const changeScope = () => useHomeStore.setState({ activeHomeId: 'other-home', accountHomeId: 'other-home' });
  if (phase === 'confirmation') mockConfirm.mockImplementation(async () => { changeScope(); });
  if (phase === 'identity') mockGetUser.mockImplementation(async () => { changeScope(); return { data: { user: { id: 'owner' } }, error: null }; });
  if (phase === 'write') mockRpc.mockImplementation(async () => { changeScope(); return { error: null }; });
  if (phase === 'refresh') mockSyncMembership.mockImplementation(async () => { changeScope(); return snapshot; });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('home changed');
  expect(useHomeStore.getState().accountHomeId).toBe('other-home');
  expect(useHomeStore.getState().household[1].shareInteriorLayout).toBe(false);
  if (phase === 'confirmation' || phase === 'identity') expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([{ sessionEpoch: 8 }, { authenticatedUserId: 'other' }, { membershipReady: false }, { household: [{ ...owner, role: 'Admin' }, guest] }])('revalidates session and authority after confirmation: %j', async (patch) => {
  mockConfirm.mockImplementation(async () => { useHomeStore.setState(patch); });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['Guest', 'Tenant'] as const)('installs a confirmed %s grant atomically without expanding permissions', async (role) => {
  useHomeStore.setState({ household: [owner, { ...guest, role }] });
  snapshot.household = [owner, { ...guest, role, shareInteriorLayout: true }];
  const before = useHomeStore.getState();
  let completeWrite!: () => void;
  mockRpc.mockReturnValue(new Promise<{ error: null }>((resolve) => { completeWrite = () => resolve({ error: null }); }));
  const save = saveMemberInteriorLayout('guest', true);
  // Flush the protected confirmation and verified identity awaits.
  await Promise.resolve();
  await Promise.resolve();
  expect(useHomeStore.getState().household[1].shareInteriorLayout).toBe(false);
  completeWrite();
  await expect(save).resolves.toBeUndefined();
  expect(mockRpc).toHaveBeenCalledWith('set_member_interior_layout', { target_home_id: 'home', target_user_id: 'guest', share_layout: true });
  expect(mockSyncMembership).toHaveBeenCalledWith('owner', 'home');
  const current = useHomeStore.getState();
  expect(current.household[1].shareInteriorLayout).toBe(true);
  expect(current.rooms).toEqual(before.rooms);
  expect(current.devices).toEqual(before.devices);
  expect(current.roomMembers).toEqual(before.roomMembers);
  expect(current.memberPermissionOverrides).toEqual(before.memberPermissionOverrides);
});

test('backend denial preserves all local access state', async () => {
  const before = useHomeStore.getState();
  mockRpc.mockResolvedValue({ error: { message: 'Home owner required' } });
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('Home owner required');
  expect(useHomeStore.getState().household).toBe(before.household);
  expect(mockSyncMembership).not.toHaveBeenCalled();
});

test.each(['missing', 'other-home', 'other-account', 'unavailable'] as const)('never applies an unverified %s refresh', async (failure) => {
  if (failure === 'missing') mockSyncMembership.mockResolvedValue(null);
  if (failure === 'other-home') snapshot.homeId = 'other-home';
  if (failure === 'other-account') snapshot.activeMemberId = 'other';
  if (failure === 'unavailable') mockSyncMembership.mockRejectedValue(new Error('Offline'));
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow();
  expect(useHomeStore.getState().household[1].shareInteriorLayout).toBe(false);
});

test('applies concurrent revocation before reporting that requested consent changed', async () => {
  snapshot.household = [owner];
  await expect(saveMemberInteriorLayout('guest', true)).rejects.toThrow('Member access changed');
  expect(useHomeStore.getState().household).toEqual([owner]);
});
