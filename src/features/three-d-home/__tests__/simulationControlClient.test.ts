import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { createDefaultSimulationSnapshot, mergeSimulationChanges, parseSimulationRequest, type SimulationSnapshotMessage } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationControlClient } from '../simulationControlClient';
import { SimulationPersistence } from '../simulationPersistence';
import { SimulationSession } from '../simulationSession';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { readGasSetting } from '../../../../packages/home-scene/src/gasSimulation';

/** Drain the hydration, ordered transport and coalesced disk-save queues. */
async function settle(): Promise<void> { for (let index = 0; index < 24; index++) await Promise.resolve(); }

test('rebases rapid edits over older acknowledgements and rejects pre-hydration input', () => {
  let deliver!: (message: SimulationSnapshotMessage) => void;
  const transport = { handleMessage: jest.fn((_input: unknown) => true), dispose: jest.fn() };
  const client = new SimulationControlClient((receive) => { deliver = receive; return transport; });
  client.connect();
  client.setLevel('master-blinds', 33);
  expect(transport.handleMessage).toHaveBeenCalledTimes(1);
  const state = createDefaultSimulationSnapshot();
  const envelope = { channel: 'vantahome-simulation', version: 1, type: 'snapshot', access: FULL_SCENE_ACCESS } as const;
  deliver({ ...envelope, state });
  client.setLevel('master-blinds', 33);
  client.setLevel('master-blinds', 81);
  const first = parseSimulationRequest(transport.handleMessage.mock.calls[1][0]);
  const second = parseSimulationRequest(transport.handleMessage.mock.calls[2][0]);
  if (first?.type !== 'patch' || second?.type !== 'patch') throw new Error('Expected valid control patches');
  const earlier = mergeSimulationChanges(state, first.changes);
  deliver({ ...envelope, state: earlier, acknowledgedRequestId: first.requestId });
  expect(client.getSnapshot().state.deviceStates['master-blinds'].level).toBe(81);
  client.dispose();
  expect(transport.dispose).not.toHaveBeenCalled();
  deliver({ ...envelope, state: mergeSimulationChanges(earlier, second.changes), acknowledgedRequestId: second.requestId });
  expect(transport.dispose).toHaveBeenCalledTimes(1);
});

test('keeps extra controls and a last-moment edit when the native inspector closes and reopens', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) };
  const persistence = new SimulationPersistence(storage);
  const factory = (deliver: (message: SimulationSnapshotMessage) => void, status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' });
  const client = new SimulationControlClient(factory);
  client.connect();
  await settle();
  client.setSetting('master-light', 'brightness', 27);
  client.setSetting('master-light', 'color', '#A0E9FF');
  client.setSetting('entry-gate', 'autoOpenEnabled', true);
  client.setSetting('entry-gate', 'scheduleHour', 19);
  client.setLevel('entry-gate', 76);
  client.dispose();
  await settle();
  const reopened = new SimulationControlClient(factory);
  reopened.connect();
  await settle();
  expect(reopened.getSnapshot().state.deviceStates['master-light']).toMatchObject({ level: 27, settings: { color: '#A0E9FF' } });
  expect(reopened.getSnapshot().state.deviceStates['entry-gate']).toMatchObject({ level: 76, settings: { autoOpenEnabled: true, scheduleHour: 19 } });
  expect(store.getState().devices).toEqual([]);
  expect(storage.setItem).toHaveBeenCalled();
  reopened.dispose();
});

test('disables controls immediately when account identity changes', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  client.connect();
  await settle();
  store.setState({ accountUserId: 'another-account' });
  const previous = client.getSnapshot().state;
  client.toggle('master-light');
  expect(client.getSnapshot()).toMatchObject({ ready: false, status: 'disconnected', state: previous });
  client.dispose();
});

test('keeps linked gas actions coherent across optimistic updates, acknowledgement, and reopening', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const factory = (deliver: (message: SimulationSnapshotMessage) => void, status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' });
  const client = new SimulationControlClient(factory);
  client.connect();
  await settle();
  client.runAction('kitchen-gas-leak', 'gas-leak-simulate-leak');
  client.runAction('kitchen-gas-leak', 'gas-leak-silence');
  client.runAction('utility-gas-meter', 'gas-meter-open-valve');
  expect(readGasSetting('gas-meter', client.getSnapshot().state.deviceStates['utility-gas-meter'], 'gasValveOpen')).toBe(false);
  client.dispose();
  await settle();
  const reopened = new SimulationControlClient(factory);
  reopened.connect();
  await settle();
  expect(readGasSetting('gas-leak', reopened.getSnapshot().state.deviceStates['kitchen-gas-leak'], 'gasLeakDetected')).toBe(true);
  expect(readGasSetting('gas-leak', reopened.getSnapshot().state.deviceStates['kitchen-gas-leak'], 'gasAlarmSilenced')).toBe(true);
  expect(readGasSetting('gas-meter', reopened.getSnapshot().state.deviceStates['utility-gas-meter'], 'gasValveOpen')).toBe(false);
  reopened.runAction('kitchen-gas-leak', 'gas-leak-clear-leak');
  await settle();
  expect(readGasSetting('gas-meter', reopened.getSnapshot().state.deviceStates['utility-gas-meter'], 'gasValveOpen')).toBe(false);
  reopened.runAction('utility-gas-meter', 'gas-meter-open-valve');
  reopened.runAction('utility-gas-meter', 'gas-meter-use-sample');
  await settle();
  expect(readGasSetting('gas-meter', reopened.getSnapshot().state.deviceStates['utility-gas-meter'], 'gasRemainingKg')).toBe(8.5);
  expect(store.getState().devices).toEqual([]);
  reopened.dispose();
});

test('can reconnect after the setup/cleanup cycle used by React StrictMode', async () => {
  const client = new SimulationControlClient();
  client.connect();
  client.dispose();
  client.connect();
  await settle();
  expect(client.getSnapshot().ready).toBe(true);
  client.dispose();
});

test('synchronizes fire acknowledgment/reset and foreground gate timing across two clients without hardware', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) };
  const persistence = new SimulationPersistence(storage);
  const factory = (deliver: (message: SimulationSnapshotMessage) => void, status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' });
  const clock = new SimulationControlClient(factory);
  const controls = new SimulationControlClient(factory);
  clock.connect(); controls.connect();
  await settle();
  const idleWrites = storage.setItem.mock.calls.length;
  clock.advanceSafety(1);
  await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(idleWrites);
  controls.setSetting('entry-gate', 'autoCloseDelaySec', 5);
  controls.setSetting('entry-gate', 'autoCloseEnabled', true);
  controls.runAction('entry-gate', 'gate-command-open');
  await settle();
  for (let second = 0; second < 6; second++) { clock.advanceSafety(1); await settle(); }
  expect(controls.getSnapshot().state.deviceStates['entry-gate']).toMatchObject({ level: 75, settings: { gatePhase: 'closing' } });
  controls.setSetting('entry-gate', 'gateBeamBlocked', true);
  await settle();
  expect(clock.getSnapshot().state.deviceStates['entry-gate'].level).toBe(100);
  controls.runAction('family-smoke', 'smoke-test-alarm');
  await settle();
  expect(clock.getSnapshot().state.deviceStates['family-smoke'].settings?.fireIncidentActive).toBe(true);
  clock.acknowledgeFire(); clock.resetFire();
  await settle();
  expect(controls.getSnapshot().state.deviceStates['family-smoke'].settings).toMatchObject({ smokeDetected: true, fireIncidentActive: true, fireIncidentAcknowledged: true });
  clock.clearFireSources();
  await settle();
  clock.resetFire();
  await settle();
  expect(controls.getSnapshot().state.deviceStates['family-smoke'].settings?.fireIncidentActive).toBe(false);
  expect(controls.getSnapshot().state.deviceStates['entry-gate'].settings?.gateEmergencyHold).toBe(true);
  expect(store.getState().devices).toEqual([]);
  controls.dispose(); clock.dispose();
});

test.each([
  { deviceId: 'family-smoke', roomIds: ['family'], actionId: 'smoke-test-alarm' },
  { deviceId: 'kitchen-gas-leak', roomIds: ['kitchen'], actionId: 'gas-leak-simulate-leak' },
])('rejects $deviceId collateral safety effects before publishing or sending a partial grant', ({ deviceId, roomIds, actionId }) => {
  let deliver!: (message: SimulationSnapshotMessage) => void;
  const transport = { handleMessage: jest.fn((_input: unknown) => true), dispose: jest.fn() };
  const client = new SimulationControlClient((receive) => { deliver = receive; return transport; });
  client.connect();
  deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: createDefaultSimulationSnapshot(),
    access: { fullHome: false, roomIds, deviceIds: [deviceId], controllableDeviceIds: [deviceId] } });
  const before = client.getSnapshot();
  const listener = jest.fn();
  const unsubscribe = client.subscribe(listener);

  client.runAction(deviceId, actionId);

  expect(client.getSnapshot()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
  expect(transport.handleMessage).toHaveBeenCalledTimes(1);
  expect(transport.handleMessage).toHaveBeenCalledWith({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  unsubscribe();
  client.dispose();
  expect(transport.dispose).toHaveBeenCalledTimes(1);
});
