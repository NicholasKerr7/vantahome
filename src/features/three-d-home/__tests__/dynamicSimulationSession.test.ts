import { createStore } from 'zustand/vanilla';
import { AUTHORED_DEVICES, getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultDevicePlacement, getRuntimePlacements, replaceRuntimeDevices, type RuntimePlacedDevice } from '../../../../packages/home-scene/src/devicePlacement';
import { createDefaultSimulationSnapshot, parseSimulationSnapshotMessage, type SimulationSnapshotMessage } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { SimulationPersistence } from '../simulationPersistence';
import { SimulationSession } from '../simulationSession';

const deviceId = '00000000-0000-4000-8000-000000000001';
const modelId = `placed-${deviceId}`;
const request = { channel: 'vantahome-simulation', version: 1, type: 'request' };
/** Keep every test inside an isolated, verified simulation household. */
function home(role: HouseholdMember['role'] = 'Owner'): HomeState {
  return { ...useHomeStore.getState(), accountUserId: 'person', authenticatedUserId: 'person', activeMemberId: 'person', sessionEpoch: 1,
    accountHomeId: 'home', activeHomeId: 'home', membershipReady: true, authTaskBlockingHome: false,
    household: [{ id: 'person', name: 'Person', role, status: 'home' }], rooms: [{ id: 'room-a', name: 'Living', modelRoomId: 'living' }],
    roomMembers: [{ memberId: 'person', roomIds: ['room-a'] }], memberPermissionOverrides: [],
    devices: [{ id: deviceId, modelDeviceId: modelId, name: 'Reading light', kind: 'light', roomId: 'room-a', isOn: false,
      simulationOnly: true, modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living')! }],
  };
}
/** Drain queued persistence and bridge callbacks deterministically without a wall clock. */
async function settle(): Promise<void> { for (let index = 0; index < 30; index++) await Promise.resolve(); }
/** Exercise a native renderer patch through the actual host authorization path. */
function edit(session: SimulationSession, baseline: SimulationSnapshotMessage, requestId = 1): void {
  session.handleMessage({ ...request, type: 'patch', requestId,
    base: { deviceStates: { [modelId]: baseline.state.deviceStates[modelId] } },
    changes: { deviceStates: { [modelId]: { on: true, level: 37, settings: { color: '#FF9AA2', lightColorMode: 'color' } } } } });
}
afterEach(() => { replaceRuntimeDevices([]); jest.useRealTimers(); });

test('custom device settings survive cold persistence reload without relying on the previous runtime catalog', async () => {
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: jest.fn(async (key: string, value: string) => { disk.set(key, value); }) };
  const store = createStore<HomeState>(() => home());
  const first = jest.fn();
  const initial = new SimulationSession(first, jest.fn(), { store, persistence: new SimulationPersistence(storage), mode: 'development' });
  initial.handleMessage(request); await settle();
  expect(parseSimulationSnapshotMessage(first.mock.lastCall![0])).not.toBeNull();
  edit(initial, first.mock.lastCall![0]); await settle();
  expect(first.mock.lastCall![0].state.deviceStates[modelId]).toMatchObject({ on: true, level: 37 });
  initial.dispose(); replaceRuntimeDevices([]);
  const again = jest.fn();
  const reopened = new SimulationSession(again, jest.fn(), { store, persistence: new SimulationPersistence(storage), mode: 'development' });
  reopened.handleMessage(request); await settle();
  expect(again.mock.lastCall![0].state.deviceStates[modelId]).toEqual({ on: true, level: 37, settings: { color: '#FF9AA2', lightColorMode: 'color' } });
  expect(again.mock.lastCall![0].placements).toHaveLength(1);
  expect(getDevice(modelId)?.name).toBe('Reading light');
  reopened.dispose();
});

test('adding and removing registry rows updates a mounted bridge and preserves unrelated device state', async () => {
  const current = home();
  const store = createStore<HomeState>(() => ({ ...current, devices: [] }));
  const storage = { getItem: async () => null, setItem: jest.fn(async () => undefined) };
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, persistence: new SimulationPersistence(storage), mode: 'development' });
  session.handleMessage(request); await settle();
  expect(deliver.mock.lastCall![0].placements).toEqual([]);
  store.setState({ devices: current.devices }); await settle();
  expect(deliver.mock.lastCall![0].placements).toHaveLength(1);
  expect(deliver.mock.lastCall![0].access.controllableDeviceIds).toContain(modelId);
  expect(parseSimulationSnapshotMessage(deliver.mock.lastCall![0])).not.toBeNull();
  edit(session, deliver.mock.lastCall![0]); await settle();
  store.setState({ devices: [] }); await settle();
  expect(deliver.mock.lastCall![0].placements).toEqual([]);
  expect(deliver.mock.lastCall![0].state.deviceStates[modelId]).toBeUndefined();
  expect(Object.keys(deliver.mock.lastCall![0].state.deviceStates)).toHaveLength(AUTHORED_DEVICES.length);
  expect(parseSimulationSnapshotMessage(deliver.mock.lastCall![0])).not.toBeNull();
  session.dispose();
});

test('revoking a guest room removes the custom fixture and rejects stale control messages', async () => {
  const store = createStore<HomeState>(() => home('Guest'));
  const storage = { getItem: async () => null, setItem: jest.fn(async () => undefined) };
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, persistence: new SimulationPersistence(storage), mode: 'development' });
  session.handleMessage(request); await settle();
  const granted = deliver.mock.lastCall![0];
  expect(granted.access.controllableDeviceIds).toContain(modelId);
  store.setState({ roomMembers: [] }); await settle();
  expect(deliver.mock.lastCall![0].placements).toEqual([]);
  const writes = storage.setItem.mock.calls.length;
  edit(session, granted); await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
  expect(getDevice(modelId)).toBeUndefined();
  session.dispose();
});

test('a saved catalog cannot recreate a device absent from the freshly admitted registry', async () => {
  const device: RuntimePlacedDevice = { id: modelId, name: 'Old fixture', placement: createDefaultDevicePlacement('master-light', 'living')! };
  replaceRuntimeDevices([device]);
  const saved = { channel: 'vantahome-simulation', version: 1, type: 'snapshot', placements: [device], state: createDefaultSimulationSnapshot() };
  replaceRuntimeDevices([]);
  const store = createStore<HomeState>(() => ({ ...home(), devices: [] }));
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, persistence: new SimulationPersistence({ getItem: async () => JSON.stringify(saved), setItem: async () => undefined }), mode: 'development' });
  session.handleMessage(request); await settle();
  expect(deliver.mock.lastCall![0].placements).toEqual([]);
  expect(deliver.mock.lastCall![0].state.deviceStates[modelId]).toBeUndefined();
  expect(getDevice(modelId)).toBeUndefined();
  session.dispose();
});

test('an empty pending disk read retains its captured scope rather than borrowing a switched home catalog', async () => {
  const first: RuntimePlacedDevice = { id: modelId, name: 'First home', placement: createDefaultDevicePlacement('master-light', 'living')! };
  const second: RuntimePlacedDevice = { ...first, id: 'placed-00000000-0000-4000-8000-000000000002', name: 'Other home' };
  let finish: (value: null) => void = () => undefined;
  replaceRuntimeDevices([first]);
  const persistence = new SimulationPersistence({ getItem: () => new Promise<null>((resolve) => { finish = resolve; }), setItem: async () => undefined });
  const pending = persistence.load('first-home'); await settle();
  replaceRuntimeDevices([second]); finish(null);
  const loaded = await pending;
  expect(loaded.deviceStates[second.id]).toBeUndefined();
  expect(loaded.deviceStates[first.id]).toBeDefined();
  expect(getRuntimePlacements()).toEqual([second]);
});

test('guest expiry clears placed metadata without requiring another store update', async () => {
  jest.useFakeTimers();
  const state = home('Guest'); state.household[0].accessExpiresAt = new Date(Date.now() + 1000).toISOString();
  const store = createStore<HomeState>(() => state);
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, persistence: new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }), mode: 'development' });
  session.handleMessage(request); await settle();
  expect(deliver.mock.lastCall![0].placements).toHaveLength(1);
  jest.advanceTimersByTime(1002); await settle();
  expect(deliver.mock.lastCall![0].access.deviceIds).toEqual([]);
  expect(deliver.mock.lastCall![0].placements).toEqual([]);
  expect(parseSimulationSnapshotMessage(deliver.mock.lastCall![0])).not.toBeNull();
  session.dispose();
});

test('an old session revokes itself without sending the next household custom catalog', async () => {
  const store = createStore<HomeState>(() => home());
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, persistence: new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }), mode: 'development' });
  session.handleMessage(request); await settle();
  const secondId = '00000000-0000-4000-8000-000000000002';
  const second = home();
  second.accountHomeId = 'another-home'; second.activeHomeId = 'another-home';
  second.devices = [{ ...second.devices[0], id: secondId, modelDeviceId: `placed-${secondId}`, name: 'Next household lamp' }];
  store.setState(second); await settle();
  const revoked: SimulationSnapshotMessage = deliver.mock.lastCall![0];
  expect(revoked.placements).toEqual([]);
  expect(revoked.access?.deviceIds).toEqual([]);
  expect(Object.keys(revoked.state.deviceStates)).toHaveLength(AUTHORED_DEVICES.length);
  expect(parseSimulationSnapshotMessage(revoked)).not.toBeNull();
  expect(session.canNavigate()).toBe(false);
  expect(getRuntimePlacements().map((device) => device.name)).toEqual(['Next household lamp']);
  session.dispose();
});
