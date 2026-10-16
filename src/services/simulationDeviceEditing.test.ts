import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDefaultDevicePlacement } from '../../packages/home-scene/src/devicePlacement';
import { useHomeStore, type Device, type HomeState } from '../store/useHomeStore';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockConfirm = jest.fn();
const mockSync = jest.fn();
const mockApply = jest.fn();
jest.mock('./supabaseClient', () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRpc(...args), auth: { getUser: () => mockGetUser() },
} }));
jest.mock('../security/biometricConfirmation', () => ({ confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('./membership', () => ({
  syncMembershipFromSupabase: (...args: unknown[]) => mockSync(...args),
  applyMembershipSnapshot: (...args: unknown[]) => mockApply(...args),
}));
import {
  canEditSimulationDevice, loadPendingSimulationDeviceEdit, updateSimulationDevice,
  refreshSimulationDeviceForEdit, SimulationDeviceEditConflictError, SimulationDeviceEditValidationError, type SimulationDeviceEdit,
} from './simulationDeviceEditing';

const initial = useHomeStore.getInitialState();
const owner = { id: 'owner', role: 'Owner' as const, name: 'Owner', status: 'home' as const };
const deviceId = '12700000-0000-4000-8000-000000000001';
const roomId = '32700000-0000-4000-8000-000000000001';
const otherRoomId = '32700000-0000-4000-8000-000000000002';
const placement = createDefaultDevicePlacement('master-bedside-left', 'living')!;
const original: Device = { id: deviceId, name: 'Reading lamp', roomId, kind: 'light', isOn: true, brightness: 63,
  simulationOnly: true, modelDeviceId: `placed-${deviceId}`, modelPlacement: placement, modelRevision: 0 };
const draft: SimulationDeviceEdit = { requestId: '22700000-0000-4000-8000-000000000001', deviceId, expectedRevision: 0,
  name: 'Kitchen lamp', roomId: otherRoomId, placement: createDefaultDevicePlacement('master-bedside-left', 'kitchen')! };
const saved: Device = { ...original, name: draft.name, roomId: draft.roomId, modelPlacement: draft.placement, modelRevision: 1 };
const receipt = { homeId: 'home', deviceId, status: 'updated', revision: 1 };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useHomeStore.setState({ ...initial, accountUserId: 'owner', authenticatedUserId: 'owner', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, sessionEpoch: 8, activeMemberId: 'owner', household: [owner],
    realtime: { enabled: true, wsUrl: '', useMqtt: false },
    rooms: [{ id: roomId, name: 'Living', modelRoomId: 'living' }, { id: otherRoomId, name: 'Kitchen', modelRoomId: 'kitchen' }],
    devices: [original] });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner', email_confirmed_at: '2026-10-01' } }, error: null });
  mockConfirm.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: receipt, error: null });
  mockSync.mockResolvedValue({ homeId: 'home', devices: [saved] });
  mockApply.mockImplementation((result: { devices: Device[] }) => { useHomeStore.setState({ devices: result.devices }); return true; });
});
afterEach(() => useHomeStore.setState(initial));

test.each(['Owner', 'Admin'] as const)('%s saves same identity and settings after authoritative confirmation', async (role) => {
  useHomeStore.setState({ household: [{ ...owner, role }] });
  await expect(updateSimulationDevice(draft)).resolves.toEqual({ deviceId, status: 'updated', revision: 1 });
  expect(useHomeStore.getState().devices).toEqual([saved]);
  expect(mockRpc).toHaveBeenCalledWith('update_simulation_device', { target_home_id: 'home', target_device_id: deviceId,
    target_room_id: draft.roomId, request_id: draft.requestId, expected_revision: 0, device_name: draft.name, placement: draft.placement });
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toBeNull();
  expect(mockConfirm.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'other' }, { accountHomeId: 'other' },
  { authTaskBlockingHome: true }, { household: [{ ...owner, role: 'Guest' }] }, { household: [{ ...owner, role: 'Tenant' }] },
  { household: [{ ...owner, role: 'Member' }] }, { realtime: { enabled: true, wsUrl: 'wss://hub.test', useMqtt: false } },
  { realtime: { enabled: true, wsUrl: '', useMqtt: true } },
])('fails closed before edit for invalid authority: %j', async (patch) => {
  useHomeStore.setState(patch);
  expect(canEditSimulationDevice(useHomeStore.getState(), deviceId)).toBe(false);
  await expect(updateSimulationDevice(draft)).rejects.toThrow('changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<Device>>([{ modelRevision: undefined }, { modelRevision: -1 }, { modelRevision: 0.5 },
  { simulationOnly: false }, { modelPlacement: null }, { modelDeviceId: 'living-light' }])('rejects unauthored editable boundary: %j', async (patch) => {
  useHomeStore.setState({ devices: [{ ...original, ...patch }] });
  expect(canEditSimulationDevice(useHomeStore.getState(), deviceId)).toBe(false);
  await expect(updateSimulationDevice(draft)).rejects.toThrow('compatible');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([{ name: '' }, { name: 'x'.repeat(81) }, { name: 'Bad\nName' }, { requestId: 'bad' }, { expectedRevision: -1 },
  { expectedRevision: 0.5 }, { roomId: roomId }, { placement: createDefaultDevicePlacement('master-light', 'kitchen')! }])('rejects invalid edit before sending: %j', async (patch) => {
  await expect(updateSimulationDevice({ ...draft, ...patch })).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('unknown response persists the exact edit across reopening without changing live device', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(updateSimulationDevice(draft)).rejects.toThrow('Offline');
  expect(useHomeStore.getState().devices).toEqual([original]);
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toEqual(draft);
  mockRpc.mockResolvedValue({ data: { ...receipt, status: 'existing' }, error: null });
  await expect(updateSimulationDevice((await loadPendingSimulationDeviceEdit(deviceId))!)).resolves.toEqual({ deviceId, revision: 1, status: 'existing' });
  expect(mockRpc.mock.calls[0][1]).toEqual(mockRpc.mock.calls[1][1]);
});

test('pending draft cannot be overwritten and an explicit refresh does not discard uncertainty', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(updateSimulationDevice(draft)).rejects.toThrow();
  await expect(updateSimulationDevice({ ...draft, name: 'Different' })).rejects.toThrow('unfinished');
  await refreshSimulationDeviceForEdit(deviceId);
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toEqual(draft);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test('failed disk journal prevents any network write', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk full'));
  await expect(updateSimulationDevice(draft)).rejects.toThrow('Disk full');
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['VH409', 'VH404'])('confirmed %s refreshes latest and releases pending draft for deliberate recovery', async (code) => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(updateSimulationDevice(draft)).rejects.toThrow();
  const latest = code === 'VH409' ? { ...saved, modelRevision: 2, name: 'Another edit' } : null;
  useHomeStore.setState({ devices: latest ? [latest] : [], rooms: [] });
  mockRpc.mockResolvedValue({ data: null, error: { code, message: 'Changed' } });
  mockSync.mockResolvedValue({ homeId: 'home', devices: latest ? [latest] : [] });
  await expect(updateSimulationDevice(draft)).rejects.toMatchObject({ code: latest ? 'conflict' : 'removed', latestDevice: latest });
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toBeNull();
  expect(useHomeStore.getState().devices).toEqual(latest ? [latest] : []);
});

test('a replay receipt never reports an older edit as current or restores its earlier pose', async () => {
  mockRpc.mockResolvedValue({ data: { ...receipt, status: 'existing' }, error: null });
  const newest = { ...saved, name: 'Latest rename', modelRevision: 2 };
  mockSync.mockResolvedValue({ homeId: 'home', devices: [newest] });
  await expect(updateSimulationDevice(draft)).rejects.toBeInstanceOf(SimulationDeviceEditConflictError);
  expect(useHomeStore.getState().devices[0]).toEqual(newest);
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toBeNull();
});

test('conflict refresh failure preserves the receipt until the current record can be established', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'VH409', message: 'Changed' } });
  mockSync.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(updateSimulationDevice(draft)).rejects.toThrow('Disconnected');
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toEqual(draft);
});

test('a server validation rejection lets the editor correct its draft', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Room removed' } });
  await expect(updateSimulationDevice(draft)).rejects.toBeInstanceOf(SimulationDeviceEditValidationError);
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toBeNull();
});

test('unconfirmed refreshed geometry keeps the same request instead of falsely reporting Saved', async () => {
  mockSync.mockResolvedValue({ homeId: 'home', devices: [original] });
  await expect(updateSimulationDevice(draft)).rejects.toThrow('awaiting confirmation');
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toEqual(draft);
});

test.each(['identity', 'confirmation', 'rpc', 'refresh'])('an account switch during %s cannot publish into another session', async (stage) => {
  const switchAccount = () => useHomeStore.setState({ sessionEpoch: 9, authenticatedUserId: 'other' });
  if (stage === 'identity') mockGetUser.mockImplementation(async () => { switchAccount(); return { data: { user: { id: 'owner', email_confirmed_at: 'today' } } }; });
  if (stage === 'confirmation') mockConfirm.mockImplementation(async () => { switchAccount(); });
  if (stage === 'rpc') mockRpc.mockImplementation(async () => { switchAccount(); return { data: receipt, error: null }; });
  if (stage === 'refresh') mockSync.mockImplementation(async () => { switchAccount(); return { homeId: 'home', devices: [saved] }; });
  await expect(updateSimulationDevice(draft)).rejects.toThrow('changed');
  expect(mockApply).not.toHaveBeenCalled();
});

test('duplicate taps cannot run parallel edits for the same fixture', async () => {
  let release!: () => void;
  mockConfirm.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
  const first = updateSimulationDevice(draft);
  while (!release) await Promise.resolve();
  await expect(updateSimulationDevice(draft)).rejects.toThrow('already saving');
  release();
  await first;
  expect(mockRpc).toHaveBeenCalledTimes(1);
});


test('cancelled protected confirmation leaves the draft editable and creates no pending write', async () => {
  mockConfirm.mockRejectedValueOnce(new Error('Cancelled'));
  await expect(updateSimulationDevice(draft)).rejects.toBeInstanceOf(SimulationDeviceEditValidationError);
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toBeNull();
  expect(mockRpc).not.toHaveBeenCalled();
  await expect(updateSimulationDevice({ ...draft, name: 'Changed after cancellation', requestId: '22700000-0000-4000-8000-000000000002' }))
    .rejects.toThrow('awaiting confirmation');
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test('cancelling a retry cannot unlock or erase an already uncertain edit', async () => {
  mockRpc.mockRejectedValueOnce(new Error('Offline'));
  await expect(updateSimulationDevice(draft)).rejects.toThrow('Offline');
  mockConfirm.mockRejectedValueOnce(new Error('Cancelled'));
  await expect(updateSimulationDevice(draft)).rejects.not.toBeInstanceOf(SimulationDeviceEditValidationError);
  expect(await loadPendingSimulationDeviceEdit(deviceId)).toEqual(draft);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
