import { useHomeStore, type HomeState, type HouseholdMember } from '../store/useHomeStore';
import type { MembershipSyncResult } from './membership';
import type { GuestAccessChange } from '../security/guestAccessExtension';
import { canManageGuestAccessExtension, saveGuestAccessExtension } from './guestAccessExtension';

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
const now = Date.parse('2026-10-07T16:00:00Z');
const initialDeadline = '2026-10-08T16:00:00.000Z';
const savedDeadline = '2026-10-09T16:00:00.000Z';
const change: GuestAccessChange = { expectedExpiresAt: initialDeadline, durationHours: 24 };
const owner: HouseholdMember = { id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' };
const guest: HouseholdMember = { id: 'guest', userId: 'guest', name: 'Guest', role: 'Guest', status: 'away',
  accessExpiresAt: initialDeadline, shareInteriorLayout: true };
let snapshot: MembershipSyncResult;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  mockClientAvailable = true;
  useHomeStore.setState({ ...seed, authenticatedUserId: 'owner', accountUserId: 'owner', activeMemberId: 'owner',
    accountHomeId: 'home', activeHomeId: 'home', sessionEpoch: 7, membershipReady: true, household: [owner, guest],
    rooms: [{ id: 'room', name: 'Assigned room' }],
    devices: [{ id: 'lamp', name: 'Lamp', kind: 'light', roomId: 'room', isOn: false }],
    roomMembers: [{ memberId: 'guest', roomIds: ['room'] }],
    memberPermissionOverrides: [{ memberId: 'guest', permission: 'lock.unlock', allowed: false }],
  });
  const state = useHomeStore.getState();
  snapshot = { homeId: 'home', activeMemberId: 'owner',
    household: [owner, { ...guest, accessExpiresAt: savedDeadline, shareInteriorLayout: false }],
    rooms: state.rooms, devices: state.devices, roomMembers: state.roomMembers, permissionOverrides: state.memberPermissionOverrides };
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mockConfirm.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: savedDeadline, error: null });
  mockSyncMembership.mockImplementation(async () => snapshot);
});

afterEach(() => { jest.restoreAllMocks(); mockClientAvailable = true; useHomeStore.setState(seed); });

test.each(['Member', 'Guest', 'Tenant'] as const)('rejects %s actors before protected confirmation', async (role) => {
  useHomeStore.setState({ household: [{ ...owner, role }, guest] });
  expect(canManageGuestAccessExtension(useHomeStore.getState(), 'guest')).toBe(false);
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('authorized household administrator');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'other' },
  { accountHomeId: 'other-home' }, { activeHomeId: null }, { activeMemberId: 'guest' },
])('rejects inconsistent identity before writes: %j', async (patch) => {
  useHomeStore.setState(patch);
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('authorized household administrator');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rejects a missing cloud client without changing the local grant', async () => {
  mockClientAvailable = false;
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('authorized household administrator');
  expect(useHomeStore.getState().household[1]).toEqual(guest);
});

test.each(['Owner', 'Admin', 'Member', 'Tenant'] as const)('rejects %s targets', async (role) => {
  useHomeStore.setState({ household: [owner, { ...guest, role }] });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([null, undefined, 'invalid', 'infinity'])('rejects a Guest without a finite expiry: %s', async (accessExpiresAt) => {
  useHomeStore.setState({ household: [owner, { ...guest, accessExpiresAt }] });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('valid access deadline');
  expect(mockConfirm).not.toHaveBeenCalled();
});

test.each(['owner', 'unknown'])('rejects self or cross-home target: %s', async (target) => {
  await expect(saveGuestAccessExtension(target, change)).rejects.toThrow('invitation authority');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rejects an Admin denied invitation authority', async () => {
  useHomeStore.setState({ household: [{ ...owner, role: 'Admin' }, guest],
    memberPermissionOverrides: [{ memberId: 'owner', permission: 'member.invite', allowed: false }] });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('invitation authority');
  expect(mockConfirm).not.toHaveBeenCalled();
});

test.each(['lock.unlock', 'light.control'] as const)('Admin cannot renew target powers withheld from actor: %s', async (permission) => {
  useHomeStore.setState({ household: [{ ...owner, role: 'Admin' }, guest],
    memberPermissionOverrides: [{ memberId: 'owner', permission, allowed: false },
      { memberId: 'guest', permission: 'lock.unlock', allowed: true }] });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('home owner');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('Admin can preserve a target explicit denial matching their own limitation', async () => {
  useHomeStore.setState({ household: [{ ...owner, role: 'Admin' }, guest],
    memberPermissionOverrides: [{ memberId: 'owner', permission: 'light.control', allowed: false },
      { memberId: 'guest', permission: 'light.control', allowed: false }] });
  expect(canManageGuestAccessExtension(useHomeStore.getState(), 'guest')).toBe(true);
  await expect(saveGuestAccessExtension('guest', change)).resolves.toBe(savedDeadline);
});

test.each<GuestAccessChange>([
  { expectedExpiresAt: '2026-10-08T15:00:00Z', durationHours: 24 },
  { expectedExpiresAt: initialDeadline },
  { expectedExpiresAt: initialDeadline, durationHours: 24, expiresAt: savedDeadline },
  { expectedExpiresAt: initialDeadline, expiresAt: initialDeadline },
  { expectedExpiresAt: initialDeadline, expiresAt: '2028-01-01T00:00:00Z' },
])('rejects an invalid or stale reviewed change: %j', async (invalid) => {
  await expect(saveGuestAccessExtension('guest', invalid)).rejects.toThrow();
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('canceled confirmation never writes', async () => {
  mockConfirm.mockRejectedValue(new Error('Canceled'));
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('Canceled');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('verified API identity must match the initiating account', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('account changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['confirmation', 'identity'] as const)('rechecks current grant after %s resolves', async (phase) => {
  const replaceGrant = () => useHomeStore.setState({ household: [owner, { ...guest, accessExpiresAt: savedDeadline }] });
  if (phase === 'confirmation') mockConfirm.mockImplementation(async () => { replaceGrant(); });
  else mockGetUser.mockImplementation(async () => { replaceGrant(); return { data: { user: { id: 'owner' } }, error: null }; });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('Guest access changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([{ sessionEpoch: 8 }, { authenticatedUserId: 'other' }, { membershipReady: false },
  { household: [{ ...owner, role: 'Member' }, guest] }])('rechecks session and authority after confirmation: %j', async (patch) => {
  mockConfirm.mockImplementation(async () => { useHomeStore.setState(patch); });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('saves exact RPC parameters then installs confirmed deadline without expanding access', async () => {
  const before = useHomeStore.getState();
  let completeWrite!: () => void;
  mockRpc.mockReturnValue(new Promise<{ data: string; error: null }>((resolve) => {
    completeWrite = () => resolve({ data: savedDeadline, error: null });
  }));
  const save = saveGuestAccessExtension('guest', change);
  await Promise.resolve();
  await Promise.resolve();
  expect(useHomeStore.getState().household[1]).toEqual(guest);
  completeWrite();
  await expect(save).resolves.toBe(savedDeadline);
  expect(mockRpc).toHaveBeenCalledWith('extend_guest_access', { target_home_id: 'home', target_user_id: 'guest',
    expected_expires_at: initialDeadline, duration_hours: 24, new_expires_at: null });
  const current = useHomeStore.getState();
  expect(current.household[1].accessExpiresAt).toBe(savedDeadline);
  expect(current.household[1].shareInteriorLayout).toBe(false);
  expect(current.roomMembers).toEqual(before.roomMembers);
  expect(current.memberPermissionOverrides).toEqual(before.memberPermissionOverrides);
  expect(current.rooms).toEqual(before.rooms);
  expect(current.devices).toEqual(before.devices);
});

test('expired Guest can renew without invitation acceptance', async () => {
  const expired = '2026-10-01T00:00:00Z';
  useHomeStore.setState({ household: [owner, { ...guest, accessExpiresAt: expired }] });
  const renewed = '2026-10-08T16:00:00.000Z';
  mockRpc.mockResolvedValue({ data: renewed, error: null });
  snapshot.household[1].accessExpiresAt = renewed;
  await expect(saveGuestAccessExtension('guest', { expectedExpiresAt: expired, durationHours: 24 })).resolves.toBe(renewed);
});

test('custom deadline is passed instead of duration', async () => {
  await expect(saveGuestAccessExtension('guest', { expectedExpiresAt: initialDeadline, expiresAt: savedDeadline })).resolves.toBe(savedDeadline);
  expect(mockRpc).toHaveBeenCalledWith('extend_guest_access', expect.objectContaining({ duration_hours: null, new_expires_at: savedDeadline }));
});

test('server denial leaves the original grant and layout consent untouched', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Guest access changed. Review the latest deadline' } });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('Guest access changed');
  expect(useHomeStore.getState().household[1]).toEqual(guest);
  expect(mockSyncMembership).not.toHaveBeenCalled();
});

test.each(['missing', 'wrong-home', 'wrong-account', 'offline', 'invalid-response'] as const)('reports saved-but-refresh-required after %s failure', async (failure) => {
  if (failure === 'missing') mockSyncMembership.mockResolvedValue(null);
  if (failure === 'wrong-home') snapshot.homeId = 'other-home';
  if (failure === 'wrong-account') snapshot.activeMemberId = 'other';
  if (failure === 'offline') mockSyncMembership.mockRejectedValue(new Error('Offline'));
  if (failure === 'invalid-response') mockRpc.mockResolvedValue({ data: 'infinity', error: null });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('Guest access was saved. Reopen your home');
  expect(useHomeStore.getState().household[1]).toEqual(guest);
});

test.each(['write', 'refresh'] as const)('never installs old account data when home changes during %s', async (phase) => {
  const switchHome = () => useHomeStore.setState({ activeHomeId: 'other-home', accountHomeId: 'other-home' });
  if (phase === 'write') mockRpc.mockImplementation(async () => { switchHome(); return { data: savedDeadline, error: null }; });
  else mockSyncMembership.mockImplementation(async () => { switchHome(); return snapshot; });
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('Guest access was saved. Reopen your home');
  expect(useHomeStore.getState().accountHomeId).toBe('other-home');
  expect(useHomeStore.getState().household[1]).toEqual(guest);
});

test.each(['removed', 'changed'] as const)('applies concurrent %s membership before reporting a changed result', async (kind) => {
  if (kind === 'removed') snapshot.household = [owner];
  else snapshot.household[1].accessExpiresAt = '2026-10-10T16:00:00.000Z';
  await expect(saveGuestAccessExtension('guest', change)).rejects.toThrow('saved, then changed');
  expect(useHomeStore.getState().household).toEqual(snapshot.household);
});
