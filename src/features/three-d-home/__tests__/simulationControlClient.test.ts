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
  const transport = { handleMessage: jest.fn((_input: unknown) => true), dispose: jest.fn(), pauseSafety: jest.fn() };
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

test('gas meter preferences and sample counters survive a fresh disk session without reopening its valve', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const persistence = new SimulationPersistence(storage);
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  client.connect(); await settle();
  const id = 'utility-gas-meter';
  client.setSetting(id, 'gasBudgetKg', 40); client.setSetting(id, 'gasRefillAlertPercent', 30);
  client.setSetting(id, 'gasUsageAlerts', false); client.setSetting(id, 'gasRefillAlerts', false);
  client.runAction(id, 'gas-meter-use-sample'); client.runAction(id, 'gas-meter-close-valve'); client.runAction(id, 'gas-meter-refill');
  await settle(); const accepted = client.getSnapshot().state.deviceStates[id];
  expect(accepted).toMatchObject({ on: true, settings: { gasBudgetKg: 40, gasRefillAlertPercent: 30, gasUsageAlerts: false, gasRefillAlerts: false, gasRemainingKg: 12.5, gasTodayKg: 1, gasMonthKg: 6.5, gasValveOpen: false } });
  client.dispose(); await settle();
  const reopenedPersistence = new SimulationPersistence(storage);
  const reopened = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence: reopenedPersistence, mode: 'demo' }));
  reopened.connect(); await settle(); expect(reopened.getSnapshot().state.deviceStates[id]).toEqual(accepted);
  expect(disk.size).toBeGreaterThan(0); reopened.dispose();
});

test('a silenced gas leak and preview test survive a fresh disk session without losing the linked interlock', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const persistence = new SimulationPersistence(storage);
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  client.connect(); await settle();
  const id = 'kitchen-gas-leak', meterId = 'utility-gas-meter';
  client.setSetting(id, 'gasLeakAlerts', false); client.runAction(id, 'gas-leak-simulate-leak');
  client.runAction(id, 'gas-leak-silence'); client.runAction(id, 'gas-leak-self-test'); await settle();
  const accepted = client.getSnapshot().state.deviceStates[id];
  expect(accepted).toMatchObject({ on: true, settings: { gasLeakDetected: true, gasAlarmSilenced: true, gasLeakAlerts: false, gasTestCount: 1, gasTestResult: 'passed' } });
  client.dispose(); await settle();
  const reopenedPersistence = new SimulationPersistence(storage);
  const reopened = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence: reopenedPersistence, mode: 'demo' }));
  reopened.connect(); await settle(); expect(reopened.getSnapshot().state.deviceStates[id]).toEqual(accepted);
  expect(reopened.getSnapshot().state.deviceStates[meterId]).toMatchObject({ settings: { gasValveOpen: false, gasLeakInterlock: true } });
  reopened.runAction(id, 'gas-leak-clear-leak'); await settle();
  expect(reopened.getSnapshot().state.deviceStates[id]).toMatchObject({ settings: { gasLeakDetected: false, gasAlarmSilenced: false, gasTestCount: 1, gasLeakAlerts: false } });
  expect(reopened.getSnapshot().state.deviceStates[meterId]).toMatchObject({ settings: { gasValveOpen: false, gasLeakInterlock: false } });
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
  const transport = { handleMessage: jest.fn((_input: unknown) => true), dispose: jest.fn(), pauseSafety: jest.fn() };
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


test('a queued foreground tick cannot undo a synchronous pause before its host microtask runs', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const factory = (deliver: (message: SimulationSnapshotMessage) => void, status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' });
  const clock = new SimulationControlClient(factory);
  const controls = new SimulationControlClient(factory);
  clock.connect(); controls.connect(); await settle();
  controls.setLevel('entry-gate', 100); await settle();
  controls.setLevel('entry-gate', 0); await settle();
  clock.advanceSafety(1); await settle();
  expect((await persistence.load('demo')).deviceStates['entry-gate'].level).toBe(75);
  clock.advanceSafety(1);
  controls.pauseSafety();
  await settle();
  expect((await persistence.load('demo')).deviceStates['entry-gate']).toMatchObject({ level: 75, settings: { gatePhase: 'paused' } });
  expect(clock.getSnapshot().state.deviceStates['entry-gate']).toMatchObject({ level: 75, settings: { gatePhase: 'paused' } });
  // A fresh explicit close after observing the pause remains usable.
  controls.setLevel('entry-gate', 0); await settle();
  clock.advanceSafety(1); await settle();
  expect((await persistence.load('demo')).deviceStates['entry-gate']).toMatchObject({ level: 50, settings: { gatePhase: 'closing' } });
  clock.dispose(); controls.dispose();
});

/** Refrigerator updates traverse the real client, session and disk path before a fresh session reopens them. */
test('refrigerator targets and every extra preference survive a fresh persistence instance without powering on', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const persistence = new SimulationPersistence(storage);
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  client.connect(); await settle(); client.setPower(['kitchen-fridge'], false);
  for (const [field, value] of Object.entries({ tempC: 4, freezerTempC: -18, fridgeMode: 'vacation', fridgeQuickCool: true, fridgeQuickFreeze: true, fridgeIceMaker: false, fridgeDoorAlarm: false, fridgeEnergySaver: false, fridgeHumidity: 60 })) client.setSetting('kitchen-fridge', field, value);
  client.runAction('kitchen-fridge', 'fridge-temperature-up'); client.runAction('kitchen-fridge', 'fridge-temperature-up'); client.runAction('kitchen-fridge', 'fridge-freezer-down');
  await settle(); const accepted = client.getSnapshot().state.deviceStates['kitchen-fridge'];
  expect(accepted).toMatchObject({ on: false, settings: { tempC: 6, freezerTempC: -19, fridgeMode: 'vacation', fridgeIceMaker: false, fridgeQuickCool: true, fridgeQuickFreeze: true, fridgeDoorAlarm: false, fridgeEnergySaver: false, fridgeHumidity: 60 } });
  client.dispose(); await settle();
  const reopenedPersistence = new SimulationPersistence(storage);
  const reopened = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence: reopenedPersistence, mode: 'demo' }));
  reopened.connect(); await settle(); expect(reopened.getSnapshot().state.deviceStates['kitchen-fridge']).toEqual(accepted); reopened.dispose();
});

/** Coffee recipe edits and explicit activity traverse the real client/session/disk path. */
test('coffee recipe and all extras survive a fresh persistence instance independently of brewing', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const persistence = new SimulationPersistence(storage);
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  const recipe = { coffeeStrength: 'strong', coffeeSizeOz: 12, coffeeCupCount: 2, coffeeTempC: 96, coffeeKeepWarmMin: 30, coffeeGrinder: false, coffeeMilkFrother: true, coffeeAutoBrewTime: '08:00' };
  client.connect(); await settle(); client.runAction('kitchen-coffee', 'coffee-stop');
  for (const [field, value] of Object.entries(recipe)) client.setSetting('kitchen-coffee', field, value);
  client.runAction('kitchen-coffee', 'coffee-cups-up'); client.runAction('kitchen-coffee', 'coffee-cups-up');
  await settle(); expect(client.getSnapshot().state.deviceStates['kitchen-coffee']).toMatchObject({ on: false, settings: { ...recipe, coffeeCupCount: 4 } });
  client.runAction('kitchen-coffee', 'coffee-brew'); await settle();
  const accepted = client.getSnapshot().state.deviceStates['kitchen-coffee']; expect(accepted.on).toBe(true);
  client.dispose(); await settle();
  const reopenedPersistence = new SimulationPersistence(storage);
  const reopened = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence: reopenedPersistence, mode: 'demo' }));
  reopened.connect(); await settle(); expect(reopened.getSnapshot().state.deviceStates['kitchen-coffee']).toEqual(accepted);
  reopened.runAction('kitchen-coffee', 'coffee-stop'); await settle();
  expect(reopened.getSnapshot().state.deviceStates['kitchen-coffee']).toMatchObject({ on: false, settings: { ...recipe, coffeeCupCount: 4 } }); reopened.dispose();
});

/** Native preview changes must survive the full client/session/disk boundary, not just an in-memory store. */
test('microwave duration, power and mode survive fresh-session reopening and Stop clears duration only', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null, setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const persistence = new SimulationPersistence(storage);
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  client.connect(); await settle(); client.runAction('kitchen-microwave', 'microwave-stop');
  client.setSetting('kitchen-microwave', 'microwaveMode', 'Defrost'); client.setSetting('kitchen-microwave', 'microwavePower', 7);
  client.runAction('kitchen-microwave', 'microwave-power-up'); client.runAction('kitchen-microwave', 'microwave-power-up');
  await settle(); expect(client.getSnapshot().state.deviceStates['kitchen-microwave']).toMatchObject({ on: false, settings: { microwavePower: 9, microwaveMode: 'Defrost', timeRemainingSec: 0 } });
  client.runAction('kitchen-microwave', 'microwave-start'); client.runAction('kitchen-microwave', 'microwave-add-30'); await settle();
  const accepted = client.getSnapshot().state.deviceStates['kitchen-microwave']; expect(accepted).toMatchObject({ on: true, settings: { timeRemainingSec: 90 } });
  client.dispose(); await settle();
  const reopenedPersistence = new SimulationPersistence(storage);
  const reopened = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence: reopenedPersistence, mode: 'demo' }));
  reopened.connect(); await settle(); expect(reopened.getSnapshot().state.deviceStates['kitchen-microwave']).toEqual(accepted);
  reopened.runAction('kitchen-microwave', 'microwave-stop'); await settle();
  expect(reopened.getSnapshot().state.deviceStates['kitchen-microwave']).toMatchObject({ on: false, settings: { timeRemainingSec: 0, microwavePower: 9, microwaveMode: 'Defrost' } }); reopened.dispose();
});

/** Cooktop settings and independent power must survive new persistence/session instances. */
test.each([false, true])('cooktop preferences survive disk reopening with power %s and subsequent off/on changes', async (on) => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const disk = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => { disk.set(key, value); },
  };
  const persistence = new SimulationPersistence(storage);
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' }));
  const id = 'kitchen-stove';
  const preferences = { burnerLevel: 3, stoveTimerMin: 15, stoveMode: 'sear', stoveLock: true };
  client.connect();
  await settle();
  client.setPower([id], on);
  for (const [field, value] of Object.entries(preferences)) client.setSetting(id, field, value);
  client.runAction(id, 'stove-heat-up');
  client.runAction(id, 'stove-heat-up');
  client.runAction(id, 'stove-timer-up');
  await settle();
  const accepted = client.getSnapshot().state.deviceStates[id];
  const savedPreferences = { ...preferences, burnerLevel: 5, stoveTimerMin: 20 };
  expect(accepted).toMatchObject({ on, settings: savedPreferences });
  client.dispose();
  await settle();

  const reopenedPersistence = new SimulationPersistence(storage);
  const reopened = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence: reopenedPersistence, mode: 'demo' }));
  reopened.connect();
  await settle();
  expect(reopened.getSnapshot().state.deviceStates[id]).toEqual(accepted);
  reopened.setPower([id], false);
  await settle();
  expect(reopened.getSnapshot().state.deviceStates[id]).toMatchObject({ on: false, settings: savedPreferences });
  reopened.setPower([id], true);
  await settle();
  expect(reopened.getSnapshot().state.deviceStates[id]).toMatchObject({ on: true, settings: savedPreferences });
  const persisted = await new SimulationPersistence(storage).load('demo');
  expect(persisted.deviceStates[id]).toMatchObject({ on: true, settings: savedPreferences });
  expect(disk.size).toBeGreaterThan(0);
  reopened.dispose();
});
