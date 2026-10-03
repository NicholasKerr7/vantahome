import { advanceSafetySimulation } from '../../../../packages/home-scene/src/safetySimulation';
import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { canShareDemoDevices, nativeSimulationSnapshotScript, SimulationSession } from '../simulationSession';
import { SimulationPersistence } from '../simulationPersistence';

const request = { channel: 'vantahome-simulation', version: 1, type: 'request' };

/** Make deterministic host/scene fixtures without touching the real account store. */
function setup(overrides: Partial<HomeState> = {}, mode: 'demo' | 'production' = 'demo') {
  const store = createStore<HomeState>(() => ({
    ...useHomeStore.getState(), accountUserId: null, authenticatedUserId: null,
    accountHomeId: null, activeHomeId: null, sessionEpoch: 0,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    household: [{ id: 'owner', name: 'Demo', role: 'Owner', status: 'home', avatarColor: '#000000' }],
    activeMemberId: 'owner',
    devices: [{ id: 'd2', name: 'Light', kind: 'light', roomId: 'r1', isOn: true, brightness: 70 }],
    ...overrides,
  }));
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) };
  const persistence = new SimulationPersistence(storage);
  const deliver = jest.fn();
  const status = jest.fn();
  const session = new SimulationSession(deliver, status, { store, persistence, mode });
  return { store, storage, persistence, deliver, status, session };
}

/** Advance ordered bridge and persistence microtasks. */
async function settle(): Promise<void> { for (let index = 0; index < 16; index += 1) await Promise.resolve(); }

/** Create a valid sparse update without exposing dashboard IDs in the protocol. */
function patch(requestId: number, on: boolean, level = 35) {
  return { ...request, type: 'patch', requestId, changes: { deviceStates: { 'living-light': { on, level } } } };
}

test('hydrates from the demo dashboard and propagates scene edits back without commands', async () => {
  const { session, deliver, store, storage } = setup();
  session.handleMessage(request);
  await settle();
  expect(deliver.mock.lastCall?.[0].state.deviceStates['living-light']).toMatchObject({ on: true, level: 70 });
  session.handleMessage(patch(1, false));
  await settle();
  expect(store.getState().devices[0]).toMatchObject({ id: 'd2', isOn: false, brightness: 35 });
  expect(deliver.mock.lastCall?.[0].acknowledgedRequestId).toBe(1);
  expect(storage.setItem).toHaveBeenCalled();
  session.dispose();
});

test('dashboard updates reach an open scene and survive leaving and reopening', async () => {
  const { session, deliver, store, persistence } = setup();
  session.handleMessage(request);
  await settle();
  store.setState({ devices: [{ ...store.getState().devices[0], isOn: false, brightness: 22 }] });
  expect(deliver.mock.lastCall?.[0].state.deviceStates['living-light']).toMatchObject({ on: false, level: 22 });
  session.handleMessage({ ...request, type: 'patch', requestId: 1, changes: { deviceStates: { 'master-blinds': { on: true, level: 64 } }, motionDisabled: true } });
  await settle();
  session.dispose();
  const reopenedDeliver = jest.fn();
  const reopened = new SimulationSession(reopenedDeliver, jest.fn(), { store, persistence, mode: 'demo' });
  reopened.handleMessage(request);
  await settle();
  expect(reopenedDeliver.mock.lastCall?.[0].state.deviceStates['master-blinds'].level).toBe(64);
  expect(reopenedDeliver.mock.lastCall?.[0].state.motionDisabled).toBe(true);
  reopened.dispose();
});

test.each(['master-blinds', 'entry-gate', 'entry-door'])('native power routines move %s and retain the normalized position', async (id) => {
  const kind = id === 'master-blinds' ? 'blinds' : id === 'entry-gate' ? 'gate' : 'door';
  const { session, deliver, store } = setup({ devices: [{ id, kind, name: 'Positioned device', roomId: 'master', isOn: false, openPercent: 0 }] });
  session.handleMessage(request);
  await settle();
  store.setState({ devices: [{ ...store.getState().devices[0], isOn: true }] });
  expect(deliver.mock.lastCall?.[0].state.deviceStates[id]).toMatchObject({ on: true, level: 100 });
  expect(store.getState().devices[0]).toMatchObject({ isOn: true, openPercent: 100 });
  store.setState({ devices: [{ ...store.getState().devices[0], isOn: false }] });
  if (kind === 'gate') {
    expect(deliver.mock.lastCall?.[0].state.deviceStates[id]).toMatchObject({ level: 100, settings: { gatePhase: 'closing' } });
    expect(store.getState().devices[0]).toMatchObject({ isOn: true, openPercent: 100 });
    for (let second = 0; second < 4; second += 1) {
      const states = deliver.mock.lastCall![0].state.deviceStates;
      session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId: second + 1, changes: { deviceStates: advanceSafetySimulation(states, 1) } });
      await settle();
    }
  }
  expect(deliver.mock.lastCall?.[0].state.deviceStates[id]).toMatchObject({ on: false, level: 0 });
  expect(store.getState().devices[0]).toMatchObject({ isOn: false, openPercent: 0 });
  store.setState({ devices: [{ ...store.getState().devices[0], isOn: true, openPercent: 40 }] });
  expect(deliver.mock.lastCall?.[0].state.deviceStates[id]).toMatchObject({ on: true, level: 40 });
  session.dispose();
});

test.each([
  { accountUserId: 'account' }, { authenticatedUserId: 'account' },
  { accountHomeId: 'house' }, { activeHomeId: 'house' },
  { realtime: { enabled: true, useMqtt: false, wsUrl: '' } },
  { realtime: { enabled: false, useMqtt: true, wsUrl: '' } },
  { activeMemberId: 'someone-else' },
])('isolates household, transport, and member contexts %#', async (overrides) => {
  const { session, store, deliver } = setup(overrides);
  expect(canShareDemoDevices(store.getState(), 'demo')).toBe(false);
  session.handleMessage(request);
  await settle();
  expect(deliver.mock.lastCall?.[0].access.deviceIds).toEqual([]);
  expect(deliver.mock.lastCall?.[0].state.deviceStates['living-light']).toEqual({ on: false, level: 0 });
  session.handleMessage(patch(1, false));
  await settle();
  expect(store.getState().devices[0].isOn).toBe(true);
  session.dispose();
});

test('production never projects simulated patches into real device state', async () => {
  const { session, store } = setup({}, 'production');
  session.handleMessage(request);
  session.handleMessage(patch(1, false));
  await settle();
  expect(store.getState().devices[0].isOn).toBe(true);
  session.dispose();
});

test('invalidates synchronously on account change and discards late messages', async () => {
  const { session, store, status, deliver } = setup();
  session.handleMessage(request);
  await settle();
  const count = deliver.mock.calls.length;
  store.setState({ authenticatedUserId: 'new-user' });
  session.handleMessage(patch(1, false));
  await settle();
  expect(status).toHaveBeenLastCalledWith('disconnected');
  expect(deliver).toHaveBeenCalledTimes(count + 1);
  expect(deliver.mock.lastCall?.[0].access.roomIds).toEqual([]);
  expect(store.getState().devices[0].isOn).toBe(true);
});

test('rejects invalid messages, pre-handshake edits and replayed patches', async () => {
  const { session, store, deliver } = setup();
  expect(session.handleMessage({ ...patch(1, false), token: 'unexpected' })).toBe(false);
  expect(session.handleMessage({ ...patch(1, false), changes: { deviceStates: { d2: { on: false, level: 35 } } } })).toBe(false);
  session.handleMessage(patch(1, false));
  await settle();
  expect(store.getState().devices[0].isOn).toBe(true);
  session.handleMessage(request);
  session.handleMessage(patch(2, false));
  session.handleMessage(patch(1, true));
  await settle();
  expect(store.getState().devices[0].isOn).toBe(false);
  expect(deliver.mock.lastCall?.[0].acknowledgedRequestId).toBe(2);
  session.dispose();
});

test('native response encoding treats script-like strings as literal data', () => {
  const state = createDefaultSimulationSnapshot();
  state.deviceStates['living-light'].settings = { color: '</script>\u2028\u2029' };
  const script = nativeSimulationSnapshotScript({ ...request, type: 'snapshot', version: 1, channel: 'vantahome-simulation', state });
  expect(script).not.toContain('</script>');
  expect(script).toContain('\\u003c/script>\\u2028\\u2029');
  expect(script).toContain("CustomEvent('vantahome-simulation'");
});

test('a renderer delivery failure cannot break dashboard edits or strand an active bridge', async () => {
  const { session, store, status, deliver } = setup();
  session.handleMessage(request);
  await settle();
  deliver.mockImplementation(() => { throw new Error('Renderer terminated'); });
  expect(() => store.setState({ devices: [{ ...store.getState().devices[0], brightness: 42 }] })).not.toThrow();
  expect(status).toHaveBeenLastCalledWith('disconnected');
  session.handleMessage(patch(1, false));
  await settle();
  expect(store.getState().devices[0]).toMatchObject({ isOn: true, brightness: 42 });
});

test('shares every scene device across open native and WebView sessions without losing concurrent edits', async () => {
  const { session, deliver, store, persistence } = setup();
  const voiceDeliver = jest.fn();
  const voice = new SimulationSession(voiceDeliver, jest.fn(), { store, persistence, mode: 'demo' });
  session.handleMessage(request);
  voice.handleMessage(request);
  await settle();
  const initial = deliver.mock.lastCall![0].state;
  session.handleMessage({ ...request, type: 'patch', requestId: 1, changes: { deviceStates: {
    'bedroom-4-bedside-right': { ...initial.deviceStates['bedroom-4-bedside-right'], level: 31 },
  } } });
  voice.handleMessage({ ...request, type: 'patch', requestId: 1, changes: { deviceStates: {
    'bedroom-4-bedside-right': { ...initial.deviceStates['bedroom-4-bedside-right'], settings: { color: '#A0E9FF' } },
    'bath-7-fan': { ...initial.deviceStates['bath-7-fan'], on: false },
  } } });
  await settle();
  for (const receive of [deliver, voiceDeliver]) {
    expect(receive.mock.lastCall![0].state.deviceStates['bedroom-4-bedside-right']).toMatchObject({ level: 31, settings: { color: '#A0E9FF' } });
    expect(receive.mock.lastCall![0].state.deviceStates['bath-7-fan'].on).toBe(false);
  }
  expect((await persistence.load('demo')).deviceStates['bedroom-4-bedside-right']).toMatchObject({ level: 31, settings: { color: '#A0E9FF' } });
  session.dispose(); voice.dispose();
});

test('scope changes disconnect every subscribed surface before a different account can receive updates', async () => {
  const { session, store, persistence } = setup();
  const voiceDeliver = jest.fn(); const voiceStatus = jest.fn();
  const voice = new SimulationSession(voiceDeliver, voiceStatus, { store, persistence, mode: 'demo' });
  session.handleMessage(request); voice.handleMessage(request); await settle();
  const count = voiceDeliver.mock.calls.length;
  store.setState({ authenticatedUserId: 'other-account' });
  persistence.save('demo', { ...createDefaultSimulationSnapshot(), motionDisabled: true });
  await settle();
  expect(voiceStatus).toHaveBeenLastCalledWith('disconnected');
  expect(voiceDeliver).toHaveBeenCalledTimes(count + 1);
  expect(voiceDeliver.mock.lastCall?.[0].access.roomIds).toEqual([]);
  voice.dispose();
});
