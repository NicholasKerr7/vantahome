import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationPersistence } from '../three-d-home/simulationPersistence';
import { modelSimulationScope } from '../three-d-home/modelSceneAccess';
import { useHomeStore, type Scene } from '../../store/useHomeStore';
import { simulationPersistence } from '../three-d-home/simulationPersistence';
import { availableStarterScenes } from './starterScenes';
import { runSimulationScene } from './simulationSceneExecution';
import { virtualSceneHome } from './sceneTestFixtures';
import { sceneRestorationIdentity } from './sceneRestorationScope';

/** Each test has an isolated persisted simulation and no hardware client. */
function persistence(getItem = async (): Promise<string | null> => null) {
  return new SimulationPersistence({ getItem, setItem: jest.fn(async () => undefined) });
}

test('executes authenticated preview settings without resetting live time, safety or unrelated devices', async () => {
  const home = virtualSceneHome();
  const scene: Scene = { ...availableStarterScenes(home)[1].draft, id: 'movie' }; home.scenes = [scene];
  const store = persistence();
  const scope = modelSimulationScope(home, false);
  const before = await store.load(scope);
  const runId = await runSimulationScene(home, scene, () => home, undefined, store);
  expect(runId).toEqual(expect.any(String));
  const receipt = store.getSceneReceipt(scope);
  expect(receipt).toMatchObject({ runId, sceneId: scene.id, identityKey: sceneRestorationIdentity(home) });
  const light = receipt?.devices.find((device) => device.deviceId === 'living-light');
  expect(light?.changes).toContainEqual({ field: 'level', before: before.deviceStates['living-light'].level, after: 20 });
  const result = await store.load(scope);
  expect(result.deviceStates['family-tv'].on).toBe(true);
  expect(result.deviceStates['family-light'].level).toBe(15);
  expect(result.deviceStates['living-light'].level).toBe(20);
  expect(result.deviceStates['entry-gate']).toBe(before.deviceStates['entry-gate']);
  expect(result.deviceStates['kitchen-gas-leak']).toBe(before.deviceStates['kitchen-gas-leak']);
  expect(result.lightingMode).toBe(before.lightingMode);
});

test('rejects mixed devices, forbidden fields and invalid grants before any partial scene is saved', async () => {
  const home = virtualSceneHome();
  const scene: Scene = { ...availableStarterScenes(home)[1].draft, id: 'movie' }; home.scenes = [scene];
  const store = persistence(); const scope = modelSimulationScope(home, false);
  const original = await store.load(scope);
  const mixed = { ...home, devices: home.devices.map((device) => device.modelDeviceId === 'family-tv' ? { ...device, simulationOnly: false } : device) };
  await expect(runSimulationScene(mixed, scene, () => mixed, undefined, store)).rejects.toThrow('mix');
  const invalid = { ...scene, actions: [...scene.actions, { type: 'patch' as const, deviceId: 'registry-device:family-light', patch: { observedAt: 123 } }] };
  home.scenes = [invalid];
  await expect(runSimulationScene(home, invalid, () => home, undefined, store)).rejects.toThrow('setting');
  expect(await store.load(scope)).toBe(original);
});

test.each(['identity', 'permission', 'deletion', 'blocking'] as const)('rejects %s changes while storage hydrates', async (change) => {
  let release!: (value: string | null) => void;
  const hydration = new Promise<string | null>((resolve) => { release = resolve; });
  const read = jest.fn(() => hydration);
  const store = persistence(read);
  const home = virtualSceneHome(); const scene: Scene = { ...availableStarterScenes(home)[1].draft, id: 'movie' }; home.scenes = [scene];
  let current = home;
  const operation = runSimulationScene(home, scene, () => current, undefined, store);
  await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(1);
  current = change === 'identity' ? { ...home, sessionEpoch: 53 } : change === 'deletion' ? { ...home, scenes: [] } : change === 'blocking' ? { ...home, authTaskBlockingHome: true } : { ...home, membershipReady: false };
  release(null);
  await expect(operation).rejects.toThrow();
  expect(await store.load(modelSimulationScope(home, false))).toEqual(createDefaultSimulationSnapshot());
});

test('concurrent scenes reduce against the latest canonical snapshot instead of overwriting each other', async () => {
  const home = virtualSceneHome();
  const first: Scene = { id: 'first', name: 'Light', scope: 'home', roomId: '', actions: [{ type: 'patch', deviceId: 'registry-device:living-light', patch: { brightness: 12 } }] };
  const second: Scene = { id: 'second', name: 'TV', scope: 'home', roomId: '', actions: [{ type: 'patch', deviceId: 'registry-device:family-tv', patch: { volume: 73 } }] };
  home.scenes = [first, second]; const store = persistence();
  const [firstRun, secondRun] = await Promise.all([runSimulationScene(home, first, () => home, undefined, store), runSimulationScene(home, second, () => home, undefined, store)]);
  expect(firstRun).not.toBe(secondRun);
  expect(store.getSceneReceipt(modelSimulationScope(home, false))?.runId).toBe(secondRun);
  expect(store.getSceneReceipt(modelSimulationScope(home, false))?.sceneId).toBe('second');
  const result = await store.load(modelSimulationScope(home, false));
  expect(result.deviceStates['living-light'].level).toBe(12);
  expect(result.deviceStates['family-tv'].settings?.volume).toBe(73);
});

test.each([
  { type: 'toggle', deviceId: 'registry-device:family-tv', on: 'off' },
  { type: 'patch', deviceId: 'registry-device:master-smoke', patch: { isOn: false } },
])('malformed power and fake monitoring power reject the entire saved transaction %#', async (action) => {
  const home = virtualSceneHome();
  const scene = { id: 'invalid', name: 'Invalid', scope: 'home', roomId: '', actions: [action] } as unknown as Scene;
  home.scenes = [scene]; const store = persistence();
  await expect(runSimulationScene(home, scene, () => home, undefined, store)).rejects.toThrow('power');
  expect(await store.load(modelSimulationScope(home, false))).toEqual(createDefaultSimulationSnapshot());
});

test('a completed old-home transaction cannot publish last-used metadata after its final await', async () => {
  const home = virtualSceneHome(); const scene: Scene = { ...availableStarterScenes(home)[1].draft, id: 'movie' }; home.scenes = [scene];
  useHomeStore.setState(home);
  const update = jest.spyOn(simulationPersistence, 'updateWithSceneReceipt').mockImplementation(async (_scope, _descriptor, reduce) => {
    reduce(createDefaultSimulationSnapshot());
    useHomeStore.setState({ sessionEpoch: home.sessionEpoch + 1, scenes: [], activeSceneId: null, lastSceneRun: null });
  });
  try {
    await useHomeStore.getState().runScene(scene.id);
    expect(useHomeStore.getState().activeSceneId).toBeNull();
    expect(useHomeStore.getState().lastSceneRun).toBeNull();
  } finally { update.mockRestore(); }
});


test('repeated runs of the same scene have distinct receipts and capture the actual immediate baseline', async () => {
  const home = virtualSceneHome();
  const scene: Scene = { id: 'same', name: 'Same', scope: 'home', roomId: '', actions: [{ type: 'toggle', deviceId: 'registry-device:living-light' }] };
  home.scenes = [scene]; const store = persistence(); const scope = modelSimulationScope(home, false);
  const firstRun = await runSimulationScene(home, scene, () => home, undefined, store);
  const first = await store.load(scope);
  const secondRun = await runSimulationScene(home, scene, () => home, undefined, store);
  expect(firstRun).not.toBe(secondRun);
  expect(store.getSceneReceipt(scope)?.runId).toBe(secondRun);
  expect(store.getSceneReceipt(scope)?.devices.find((device) => device.deviceId === 'living-light')?.changes)
    .toContainEqual({ field: 'on', before: first.deviceStates['living-light'].on, after: !first.deviceStates['living-light'].on });
});

test('same-scene virtual runs publish only their latest committed receipt metadata', async () => {
  const initialState = useHomeStore.getState();
  const home = virtualSceneHome(); const scene: Scene = { ...availableStarterScenes(home)[1].draft, id: 'repeated-movie' }; home.scenes = [scene];
  useHomeStore.setState(home);
  const update = simulationPersistence.updateWithSceneReceipt.bind(simulationPersistence);
  let release!: () => void; let committed!: () => void;
  const firstCommitted = new Promise<void>((resolve) => { committed = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const spy = jest.spyOn(simulationPersistence, 'updateWithSceneReceipt').mockImplementation(async (scope, descriptor, reducer) => {
    await update(scope, descriptor, reducer);
    if (++calls === 1) { committed(); await held; }
  });
  try {
    const first = useHomeStore.getState().runScene(scene.id);
    await firstCommitted;
    await useHomeStore.getState().runScene(scene.id);
    const newer = useHomeStore.getState().lastSceneRun;
    release(); await first;
    expect(useHomeStore.getState().lastSceneRun).toBe(newer);
  } finally { release(); spy.mockRestore(); useHomeStore.setState(initialState, true); }
});
