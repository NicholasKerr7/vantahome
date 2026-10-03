import { DEVICES, ROOMS } from '../../packages/home-scene/src/data';
import { useHomeStore, type HomeState, type HouseholdMember } from '../store/useHomeStore';
import type { MembershipSyncResult } from './membership';
import { saveModelRoomBinding, type ModelDeviceBinding } from './modelRoomBinding';

const mockRpc = jest.fn();
const mockConfirm = jest.fn();
const mockSyncMembership = jest.fn();
const mockApplyMembership = jest.fn();
let mockClientAvailable = true;

jest.mock('./supabaseClient', () => ({
  get supabase() { return mockClientAvailable ? { rpc: (...args: unknown[]) => mockRpc(...args) } : null; },
}));
jest.mock('../security/biometricConfirmation', () => ({ confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('./membership', () => ({
  syncMembershipFromSupabase: (...args: unknown[]) => mockSyncMembership(...args),
  applyMembershipSnapshot: (...args: unknown[]) => mockApplyMembership(...args),
}));

const seed = useHomeStore.getState();
const modelRoom = ROOMS.find((room) => DEVICES.filter((device) => device.roomId === room.id && device.kind === 'light').length >= 2)!;
const modelLights = DEVICES.filter((device) => device.roomId === modelRoom.id && device.kind === 'light');
const otherRoomLight = DEVICES.find((device) => device.roomId !== modelRoom.id && device.kind === 'light')!;
const validBinding: ModelDeviceBinding = { deviceId: 'cloud-lamp-left', modelDeviceId: modelLights[0].id };
const administrator: HouseholdMember = { id: 'homeowner', userId: 'homeowner', name: 'Homeowner', role: 'Owner', status: 'home' };
let refreshedMembership: MembershipSyncResult;

beforeEach(() => {
  jest.resetAllMocks();
  mockClientAvailable = true;
  useHomeStore.setState({ ...seed, accountUserId: 'homeowner', authenticatedUserId: 'homeowner', accountHomeId: 'cloud-home', activeHomeId: 'cloud-home',
    activeMemberId: 'homeowner', household: [administrator], membershipReady: true, sessionEpoch: 7,
    rooms: [{ id: 'cloud-room', name: 'Guest suite' }, { id: 'other-cloud-room', name: 'Office' }],
    devices: [
      { id: 'cloud-lamp-left', roomId: 'cloud-room', name: 'Left bedside light', kind: 'light', isOn: false },
      { id: 'cloud-lamp-right', roomId: 'cloud-room', name: 'Right bedside light', kind: 'light', isOn: true },
      { id: 'cloud-tv', roomId: 'cloud-room', name: 'Television', kind: 'tv', isOn: false },
      { id: 'office-lamp', roomId: 'other-cloud-room', name: 'Office light', kind: 'light', isOn: false },
    ],
  });
  refreshedMembership = {
    homeId: 'cloud-home', activeMemberId: 'homeowner', household: [administrator], roomMembers: [], permissionOverrides: [],
    rooms: [{ id: 'cloud-room', name: 'Guest suite', modelRoomId: modelRoom.id }],
    devices: [{ ...useHomeStore.getState().devices[0], modelDeviceId: modelLights[0].id }],
  };
  mockConfirm.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockSyncMembership.mockResolvedValue(refreshedMembership);
  mockApplyMembership.mockReturnValue(true);
});
afterEach(() => { mockClientAvailable = true; useHomeStore.setState(seed); });

test.each(['Member', 'Tenant', 'Guest'] as const)('rejects %s before confirmation or network writes', async (role) => {
  useHomeStore.setState({ household: [{ ...administrator, role }] });
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('Sign in');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { accountUserId: 'other-account' }, { authenticatedUserId: null },
  { accountHomeId: 'other-home' }, { activeHomeId: null }, { activeMemberId: 'missing-member' },
])('rejects unready or inconsistent membership: %j', async (patch) => {
  useHomeStore.setState(patch);
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('Sign in');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rejects missing backend configuration rather than pretending to save locally', async () => {
  mockClientAvailable = false;
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('Sign in');
  expect(mockRpc).not.toHaveBeenCalled();
  expect(useHomeStore.getState().rooms[0].modelRoomId).toBeUndefined();
});

test.each([
  { roomId: 'unknown-cloud-room', modelRoomId: modelRoom.id, bindings: [validBinding] },
  { roomId: 'cloud-room', modelRoomId: 'unknown-model-room', bindings: [validBinding] },
  { roomId: 'cloud-room', modelRoomId: null, bindings: [validBinding] },
])('rejects invalid room connections before biometric confirmation: %j', async ({ roomId, modelRoomId, bindings }) => {
  await expect(saveModelRoomBinding(roomId, modelRoomId, bindings)).rejects.toThrow('valid room connection');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([
  { reason: 'wrong device kind', bindings: [{ deviceId: 'cloud-tv', modelDeviceId: modelLights[0].id }] },
  { reason: 'actual device belongs to another room', bindings: [{ deviceId: 'office-lamp', modelDeviceId: modelLights[0].id }] },
  { reason: 'model device belongs to another room', bindings: [{ deviceId: 'cloud-lamp-left', modelDeviceId: otherRoomLight.id }] },
  { reason: 'missing actual device', bindings: [{ deviceId: 'missing-device', modelDeviceId: modelLights[0].id }] },
  { reason: 'missing model device', bindings: [{ deviceId: 'cloud-lamp-left', modelDeviceId: 'missing-model-device' }] },
  { reason: 'duplicate actual device', bindings: [validBinding, { deviceId: 'cloud-lamp-left', modelDeviceId: modelLights[1].id }] },
  { reason: 'duplicate model device', bindings: [validBinding, { deviceId: 'cloud-lamp-right', modelDeviceId: modelLights[0].id }] },
])('rejects $reason before any write', async ({ bindings }) => {
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, bindings)).rejects.toThrow('Each device must match one device');
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockSyncMembership).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { sessionEpoch: 8 }, { activeHomeId: 'other-home' }, { authenticatedUserId: 'other-account' },
])('rejects a scope change while protected confirmation is pending: %j', async (patch) => {
  let confirm!: () => void;
  mockConfirm.mockReturnValue(new Promise<void>((resolve) => { confirm = resolve; }));
  const request = saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding]);
  useHomeStore.setState(patch);
  confirm();
  await expect(request).rejects.toThrow('Your home changed');
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockSyncMembership).not.toHaveBeenCalled();
});

test('cancellation of protected confirmation cannot submit a mapping', async () => {
  mockConfirm.mockRejectedValue(new Error('Sensitive action was not confirmed.'));
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('not confirmed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([
  { reason: 'administrator role removed', patch: { household: [{ ...administrator, role: 'Member' as const }] }, error: 'homeowner or administrator' },
  { reason: 'membership refresh pending', patch: { membershipReady: false }, error: 'homeowner or administrator' },
  { reason: 'device removed', patch: { devices: [] }, error: 'Each device must match' },
  { reason: 'room removed', patch: { rooms: [] }, error: 'valid room connection' },
])('revalidates $reason after the protected prompt resolves', async ({ patch, error }) => {
  let confirm!: () => void;
  mockConfirm.mockReturnValue(new Promise<void>((resolve) => { confirm = resolve; }));
  const request = saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding]);
  useHomeStore.setState(patch);
  confirm();
  await expect(request).rejects.toThrow(error);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockSyncMembership).not.toHaveBeenCalled();
});

test.each(['Owner', 'Admin'] as const)('%s submits one atomic mapping and installs its refreshed membership', async (role) => {
  useHomeStore.setState({ household: [{ ...administrator, role }] });
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).resolves.toBeUndefined();
  expect(mockConfirm).toHaveBeenCalledWith('Confirm 3D room connections');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('set_model_room_binding', {
    target_room_id: 'cloud-room', target_model_room_id: modelRoom.id, device_bindings: [validBinding],
  });
  expect(mockSyncMembership).toHaveBeenCalledWith('homeowner', 'cloud-home');
  expect(mockApplyMembership).toHaveBeenCalledWith(refreshedMembership, 7);
  expect(mockConfirm.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
  expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(mockSyncMembership.mock.invocationCallOrder[0]);
});

test('disconnects a room explicitly with no residual device mappings', async () => {
  await expect(saveModelRoomBinding('cloud-room', null, [])).resolves.toBeUndefined();
  expect(mockRpc).toHaveBeenCalledWith('set_model_room_binding', { target_room_id: 'cloud-room', target_model_room_id: null, device_bindings: [] });
});

test('propagates a backend rejection without refreshing or inventing local bindings', async () => {
  const before = useHomeStore.getState();
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Model room already connected.' } });
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('Model room already connected.');
  expect(mockSyncMembership).not.toHaveBeenCalled();
  expect(mockApplyMembership).not.toHaveBeenCalled();
  expect(useHomeStore.getState().rooms).toBe(before.rooms);
  expect(useHomeStore.getState().devices).toBe(before.devices);
});

test.each(['missing membership', 'rejected snapshot'] as const)('reports saved-but-unrefreshed state for %s without claiming success', async (failure) => {
  const before = useHomeStore.getState();
  if (failure === 'missing membership') mockSyncMembership.mockResolvedValue(null);
  else mockApplyMembership.mockReturnValue(false);
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('Connections were saved. Reopen your home');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().rooms).toBe(before.rooms);
  expect(useHomeStore.getState().devices).toBe(before.devices);
  if (failure === 'missing membership') expect(mockApplyMembership).not.toHaveBeenCalled();
});

test('a failed membership refresh remains a failure even after the mapping was saved', async () => {
  mockSyncMembership.mockRejectedValue(new Error('Membership refresh unavailable.'));
  await expect(saveModelRoomBinding('cloud-room', modelRoom.id, [validBinding])).rejects.toThrow('Membership refresh unavailable.');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockApplyMembership).not.toHaveBeenCalled();
  expect(useHomeStore.getState().rooms[0].modelRoomId).toBeUndefined();
});
