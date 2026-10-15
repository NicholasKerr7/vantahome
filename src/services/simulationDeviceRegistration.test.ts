import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDefaultDevicePlacement } from '../../packages/home-scene/src/devicePlacement';
import { useHomeStore, type HomeState } from '../store/useHomeStore';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockConfirm = jest.fn();
const mockSync = jest.fn();
const mockApply = jest.fn();
let mockConfigured = true;
jest.mock('./supabaseClient', () => ({ get supabase() { return mockConfigured ? {
  rpc: (...args: unknown[]) => mockRpc(...args), auth: { getUser: () => mockGetUser() },
} : null; } }));
jest.mock('../security/biometricConfirmation', () => ({ confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('./membership', () => ({
  syncMembershipFromSupabase: (...args: unknown[]) => mockSync(...args),
  applyMembershipSnapshot: (...args: unknown[]) => mockApply(...args),
}));
import {
  canManageSimulationDevices, loadPendingSimulationDeviceRegistration,
  registerSimulationDevice, removeSimulationDevice, type SimulationDeviceRegistration,
} from './simulationDeviceRegistration';

const initial = useHomeStore.getInitialState();
const owner = { id: 'owner', role: 'Owner' as const, name: 'Owner', status: 'home' as const };
const deviceId = '12500000-0000-4000-8000-000000000001';
const draft: SimulationDeviceRegistration = {
  requestId: '22500000-0000-4000-8000-000000000001', name: 'Reading lamp', roomId: 'living-room',
  placement: createDefaultDevicePlacement('master-bedside-left', 'living')!,
};
const device = { id: deviceId, name: draft.name, roomId: draft.roomId, kind: 'light' as const,
  isOn: false, simulationOnly: true, modelDeviceId: `placed-${deviceId}`, modelPlacement: draft.placement };
const receipt = { homeId: 'home', deviceId, status: 'created' as const };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockConfigured = true;
  useHomeStore.setState({ ...initial, accountUserId: 'owner', authenticatedUserId: 'owner', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, sessionEpoch: 8, activeMemberId: 'owner', household: [owner],
    realtime: { enabled: true, wsUrl: '', useMqtt: false },
    rooms: [{ id: draft.roomId, name: 'Living room', modelRoomId: 'living' }], devices: [] });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner', email_confirmed_at: '2026-10-01' } }, error: null });
  mockConfirm.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: receipt, error: null });
  mockSync.mockResolvedValue({ homeId: 'home', devices: [device] });
  mockApply.mockReturnValue(true);
});
afterEach(() => useHomeStore.setState(initial));

test.each(['Owner', 'Admin'] as const)('%s saves one simulation registry record, then confirms it by reading the server', async (role) => {
  useHomeStore.setState({ household: [{ ...owner, role }] });
  expect(canManageSimulationDevices(useHomeStore.getState())).toBe(true);
  await expect(registerSimulationDevice(draft)).resolves.toEqual({ deviceId, status: 'created' });
  expect(mockRpc).toHaveBeenCalledWith('register_simulation_device', {
    target_home_id: 'home', target_room_id: draft.roomId, request_id: draft.requestId, device_name: draft.name, placement: draft.placement,
  });
  expect(mockSync).toHaveBeenCalledWith('owner', 'home');
  expect(mockApply).toHaveBeenCalledWith({ homeId: 'home', devices: [device] }, 8);
  expect(await loadPendingSimulationDeviceRegistration()).toBeNull();
  expect(mockConfirm.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'different' },
  { activeHomeId: null }, { accountHomeId: 'different' }, { activeMemberId: 'different' }, { authTaskBlockingHome: true },
  { household: [{ ...owner, role: 'Member' }] }, { household: [{ ...owner, role: 'Guest' }] },
  { household: [{ ...owner, role: 'Tenant' }] },
  { realtime: { enabled: true, wsUrl: 'wss://some-hub.example', useMqtt: false } },
  { realtime: { enabled: true, wsUrl: '', useMqtt: true } },
])('fails closed before networking for inconsistent or unauthorized scope: %j', async (patch) => {
  useHomeStore.setState(patch);
  expect(canManageSimulationDevices(useHomeStore.getState())).toBe(false);
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Sign in');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('missing backend cannot fabricate a local-only authenticated device', async () => {
  mockConfigured = false;
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Sign in');
  expect(mockRpc).not.toHaveBeenCalled();
  expect(useHomeStore.getState().devices).toEqual([]);
});

test.each([
  { name: '' }, { name: ' '.repeat(4) }, { name: 'x'.repeat(81) }, { name: 'Lamp\nwrong' },
  { requestId: 'not-a-request-id' }, { roomId: 'other-room' },
  { placement: { ...draft.placement, modelRoomId: 'kitchen' } },
  { placement: { ...draft.placement, position: [100, 0.7, 100] } },
  { placement: { ...draft.placement, mount: 'ceiling' } },
])('rejects invalid draft data before authentication: %j', async (patch) => {
  await expect(registerSimulationDevice({ ...draft, ...patch } as SimulationDeviceRegistration)).rejects.toThrow();
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([{ id: 'different', email_confirmed_at: 'today' }, { id: 'owner' }, null])('requires a currently confirmed backend identity: %j', async (user) => {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Verify your email');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { sessionEpoch: 9 }, { activeHomeId: 'other-home' }, { household: [{ ...owner, role: 'Member' }] },
  { realtime: { enabled: true, wsUrl: '', useMqtt: true } },
])('rechecks account, role and transport after confirmed identity: %j', async (patch) => {
  mockGetUser.mockImplementation(async () => {
    useHomeStore.setState(patch);
    return { data: { user: { id: 'owner', email_confirmed_at: 'today' } }, error: null };
  });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('rechecks room binding after protected confirmation', async () => {
  mockConfirm.mockImplementation(async () => { useHomeStore.setState({ rooms: [] }); });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('connected 3D room');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('protected cancellation cannot persist or send a draft', async () => {
  mockConfirm.mockRejectedValue(new Error('Cancelled'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Cancelled');
  expect(mockRpc).not.toHaveBeenCalled();
  expect(await loadPendingSimulationDeviceRegistration()).toBeNull();
});

test('an uncertain network result retains the exact request across wizard reopen and idempotent retry', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Offline');
  expect(useHomeStore.getState().devices).toEqual([]);
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
  mockRpc.mockResolvedValue({ data: { ...receipt, status: 'existing' }, error: null });
  await expect(registerSimulationDevice((await loadPendingSimulationDeviceRegistration())!)).resolves.toEqual({ deviceId, status: 'existing' });
  expect(mockRpc.mock.calls[0][1].request_id).toEqual(mockRpc.mock.calls[1][1].request_id);
  expect(await loadPendingSimulationDeviceRegistration()).toBeNull();
});

test('a different draft cannot overwrite a pending recovery receipt', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Connection interrupted'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('interrupted');
  await expect(registerSimulationDevice({ ...draft, name: 'Different lamp' })).rejects.toThrow('Resume the unfinished');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
});

test('a pending receipt is isolated from another household', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Offline');
  useHomeStore.setState({ accountHomeId: 'other', activeHomeId: 'other' });
  expect(await loadPendingSimulationDeviceRegistration()).toBeNull();
  useHomeStore.setState({ accountHomeId: 'home', activeHomeId: 'home' });
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
});

test('reopening after a room is removed still reconciles the immutable pending receipt', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Offline');
  useHomeStore.setState({ rooms: [] });
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
  mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'This device was already removed. Start a new draft to add another' } });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('already removed');
  expect(await loadPendingSimulationDeviceRegistration()).toBeNull();
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

test('failed recovery-journal storage prevents any server write', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('Storage unavailable');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a malformed recovery journal cannot silently start a new device', async () => {
  await AsyncStorage.setItem('vantahome.simulation-device-registration.v1:owner:home', '{not json');
  await expect(loadPendingSimulationDeviceRegistration()).rejects.toThrow('needs attention');
  await expect(registerSimulationDevice(draft)).rejects.toThrow('needs attention');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a confirmed validation rejection releases the draft without inventing a local device', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'This home already has 32 placed simulation devices' } });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('32 placed');
  expect(await loadPendingSimulationDeviceRegistration()).toBeNull();
  expect(mockSync).not.toHaveBeenCalled();
});

test.each([null, {}, { ...receipt, homeId: 'other' }, { ...receipt, deviceId: 'wrong' }, { ...receipt, status: 'pending' }])('invalid receipt keeps recovery metadata and cannot publish a ghost: %j', async (data) => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('could not be confirmed');
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
  expect(mockSync).not.toHaveBeenCalled();
});

test.each([
  { homeId: 'home', devices: [] }, { homeId: 'other', devices: [device] },
  { homeId: 'home', devices: [{ ...device, simulationOnly: false }] },
  { homeId: 'home', devices: [{ ...device, modelPlacement: null }] },
])('a saved receipt needs authoritative registry confirmation: %j', async (result) => {
  mockSync.mockResolvedValue(result);
  await expect(registerSimulationDevice(draft)).rejects.toThrow('device was saved');
  expect(mockApply).not.toHaveBeenCalled();
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
});

test('a failed registry refresh reports the committed write and preserves the retry identifier', async () => {
  mockSync.mockRejectedValue(new Error('Offline'));
  await expect(registerSimulationDevice(draft)).rejects.toThrow('will not create a duplicate');
  expect(mockApply).not.toHaveBeenCalled();
  expect(await loadPendingSimulationDeviceRegistration()).toEqual(draft);
});

test('late completion cannot install a device into a later login session', async () => {
  mockRpc.mockImplementation(async () => { useHomeStore.setState({ sessionEpoch: 9 }); return { data: receipt, error: null }; });
  await expect(registerSimulationDevice(draft)).rejects.toThrow('changed');
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
});

test('parallel submissions cannot overwrite the same home recovery journal', async () => {
  let finish!: (value: unknown) => void;
  mockGetUser.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const pending = registerSimulationDevice(draft);
  await expect(registerSimulationDevice({ ...draft, name: 'Second lamp' })).rejects.toThrow('already saving');
  finish({ data: { user: { id: 'owner', email_confirmed_at: 'today' } }, error: null });
  await expect(pending).resolves.toEqual({ deviceId, status: 'created' });
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test('deletion is confirmed by absence from the refreshed server registry', async () => {
  useHomeStore.setState({ devices: [device] });
  mockRpc.mockResolvedValue({ data: deviceId, error: null });
  mockSync.mockResolvedValue({ homeId: 'home', devices: [] });
  await expect(removeSimulationDevice(deviceId)).resolves.toBeUndefined();
  expect(mockRpc).toHaveBeenCalledWith('remove_simulation_device', { target_home_id: 'home', target_device_id: deviceId });
  expect(mockApply).toHaveBeenCalledWith({ homeId: 'home', devices: [] }, 8);
});

test.each([{ simulationOnly: false }, { modelPlacement: null }])('authored or physical devices cannot enter placed-device deletion: %j', async (patch) => {
  useHomeStore.setState({ devices: [{ ...device, ...patch }] });
  await expect(removeSimulationDevice(deviceId)).rejects.toThrow('user-placed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('deletion rejects a registry response that still contains the device', async () => {
  useHomeStore.setState({ devices: [device] });
  mockRpc.mockResolvedValue({ data: deviceId, error: null });
  await expect(removeSimulationDevice(deviceId)).rejects.toThrow('device was removed');
  expect(mockApply).not.toHaveBeenCalled();
});
