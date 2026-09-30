import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { SimulationPersistence } from '../three-d-home/simulationPersistence';
import { SimulationSession } from '../three-d-home/simulationSession';
import { SimulationControlClient } from '../three-d-home/simulationControlClient';
import { executeVoiceCommand } from './executeVoiceCommand';
import { parseHomeVoiceCommand } from './voiceCommandParser';
import { DEVICES } from '../../../packages/home-scene/src/data';
import { FIRE_PREVIEW_LIGHT_IDS } from '../../../packages/home-scene/src/safetySimulation';
import { getFireIncident } from '../../../packages/home-scene/src/fireSafetySimulation';

const lightIds = DEVICES.filter((device) => device.kind === 'light').map((device) => device.id);

/** Exercise the exact spoken phrase rather than bypassing target resolution with a hand-built command. */
function allLightsOff(client: SimulationControlClient) {
  const parsed = parseHomeVoiceCommand('turn all lights off');
  if ('error' in parsed) throw new Error(parsed.error);
  expect(parsed.command.deviceIds).toHaveLength(37);
  return executeVoiceCommand(client, parsed.command);
}

/** Connect voice and scene to one offline demo host with every modeled light initially on. */
async function sharedDemo() {
  const store = createStore<HomeState>(() => ({
    ...useHomeStore.getState(), accountUserId: null, authenticatedUserId: null,
    accountHomeId: null, activeHomeId: null, sessionEpoch: 0,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    household: [{ id: 'owner', name: 'Demo', role: 'Owner', status: 'home', avatarColor: '#000000' }],
    activeMemberId: 'owner',
    devices: DEVICES.map((device) => ({ id: device.id, name: device.name, kind: device.kind,
      roomId: device.roomId, isOn: device.kind === 'light' || device.defaultOn,
      ...(device.kind === 'light' ? { brightness: 70 } : {}) })),
  }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const factory = (deliver: ConstructorParameters<typeof SimulationSession>[0], status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'demo' });
  const voice = new SimulationControlClient(factory); const scene = new SimulationControlClient(factory);
  voice.connect(); scene.connect(); await settle();
  return { store, persistence, voice, scene, factory };
}

/** Flush bridge hydration and acknowledgements for deterministic native control assertions. */
async function settle(): Promise<void> { for (let index = 0; index < 24; index += 1) await Promise.resolve(); }

test('voice uses shared simulation reducers and the active scene receives the same saved result', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const factory = (deliver: ConstructorParameters<typeof SimulationSession>[0], status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'production' });
  const voice = new SimulationControlClient(factory); const scene = new SimulationControlClient(factory);
  expect(executeVoiceCommand(voice, { type: 'power', deviceIds: ['master-light'], on: false })).toEqual({ status: 'reconnecting' });
  voice.connect(); scene.connect(); await settle();
  executeVoiceCommand(voice, { type: 'brightness', deviceIds: ['bedroom-4-light', 'bedroom-4-bedside-left'], value: 42 });
  executeVoiceCommand(voice, { type: 'temperature', deviceIds: ['bedroom-4-ac'], value: 22 });
  executeVoiceCommand(voice, { type: 'position', deviceIds: ['entry-gate'], value: 100 });
  await settle();
  const states = scene.getSnapshot().state.deviceStates;
  expect(states['bedroom-4-light'].level).toBe(42);
  expect(states['bedroom-4-bedside-left'].level).toBe(42);
  expect(states['bedroom-4-ac'].settings?.tempC).toBe(22);
  expect(states['entry-gate']).toMatchObject({ on: true, level: 100 });
  expect(store.getState().devices).toEqual([]);
  voice.dispose(); scene.dispose();
});

test('turn all lights off reaches all 37 lights in the demo host, voice, scene and saved snapshot', async () => {
  const { store, persistence, voice, scene } = await sharedDemo();
  expect(allLightsOff(voice)).toEqual({ status: 'completed' });
  await settle();
  for (const client of [voice, scene]) {
    expect(lightIds.every((id) => client.getSnapshot().state.deviceStates[id].on === false)).toBe(true);
    expect(client.getSnapshot().state.deviceStates['living-light'].on).toBe(false);
  }
  expect(store.getState().devices.filter((device) => device.kind === 'light' && !device.isOn)).toHaveLength(37);
  const saved = await persistence.load('demo');
  expect(lightIds.every((id) => saved.deviceStates[id].on === false)).toBe(true);
  voice.dispose(); scene.dispose();
});

test('reports ten held lights for active, acknowledged and cleared fire previews, then completes after reset', async () => {
  const { store, voice, scene, factory } = await sharedDemo();
  scene.runAction('family-smoke', 'smoke-test-alarm');
  await settle();
  for (const stage of ['active', 'acknowledged', 'cleared'] as const) {
    if (stage === 'acknowledged') scene.acknowledgeFire();
    if (stage === 'cleared') scene.clearFireSources();
    await settle();
    expect(allLightsOff(voice)).toEqual({ status: 'limited', completedCount: 27, requestedCount: 37, fireHeldLightCount: 10 });
    await settle();
    for (const client of [voice, scene]) {
      const states = client.getSnapshot().state.deviceStates;
      expect(lightIds.filter((id) => states[id].on).sort()).toEqual([...FIRE_PREVIEW_LIGHT_IDS].sort());
      expect(FIRE_PREVIEW_LIGHT_IDS.every((id) => states[id].level === 100)).toBe(true);
      expect(getFireIncident(states)).toMatchObject({ active: true, acknowledged: stage !== 'active', canReset: stage === 'cleared' });
    }
    expect(store.getState().devices.filter((device) => device.kind === 'light' && device.isOn).map((device) => device.id).sort()).toEqual([...FIRE_PREVIEW_LIGHT_IDS].sort());
  }
  scene.resetFire();
  await settle();
  expect(allLightsOff(voice)).toEqual({ status: 'completed' });
  await settle();
  expect(store.getState().devices.filter((device) => device.kind === 'light' && !device.isOn)).toHaveLength(37);
  const reopened = new SimulationControlClient(factory);
  reopened.connect(); await settle();
  expect(getFireIncident(reopened.getSnapshot().state.deviceStates).active).toBe(false);
  for (const client of [voice, scene, reopened]) {
    expect(lightIds.every((id) => client.getSnapshot().state.deviceStates[id].on === false)).toBe(true);
  }
  voice.dispose(); scene.dispose(); reopened.dispose();
});

test('reports held brightness, in-progress closing and blocked gate commands without claiming completion', async () => {
  const { voice, scene } = await sharedDemo();
  voice.setLevel('entry-gate', 100);
  expect(executeVoiceCommand(voice, { type: 'position', deviceIds: ['entry-gate'], value: 0 })).toEqual({ status: 'pending' });
  await settle();
  scene.runAction('family-smoke', 'smoke-test-alarm');
  await settle();
  expect(executeVoiceCommand(voice, { type: 'brightness', deviceIds: ['living-light'], value: 20 })).toEqual({
    status: 'limited', completedCount: 0, requestedCount: 1, fireHeldLightCount: 1,
  });
  expect(executeVoiceCommand(voice, { type: 'position', deviceIds: ['entry-gate'], value: 0 })).toEqual({
    status: 'limited', completedCount: 0, requestedCount: 1, fireHeldLightCount: 0,
  });
  await settle();
  voice.dispose(); scene.dispose();
});

test('scope changes retain reconnect feedback and do not execute an all-lights command', async () => {
  const { store, voice, scene } = await sharedDemo();
  const before = voice.getSnapshot().state;
  store.setState({ accountUserId: 'another-account' });
  expect(allLightsOff(voice)).toEqual({ status: 'reconnecting' });
  expect(voice.getSnapshot().state).toBe(before);
  voice.dispose(); scene.dispose();
});
