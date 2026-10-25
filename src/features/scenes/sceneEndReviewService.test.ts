import { type HomeState, type Scene } from '../../store/useHomeStore';
import { SimulationPersistence } from '../three-d-home/simulationPersistence';
import { sceneRestorationScope, createSceneReceiptDescriptor } from './sceneRestorationScope';
import { virtualSceneHome } from './sceneTestFixtures';
import { finishSceneEndReview, prepareSceneEndReview } from './sceneEndReview';

/** Create a controlled saved run with isolated disk and observable household mutations. */
async function setup() {
  const scene: Scene = { id: 'evening', name: 'Evening', scope: 'home', roomId: '', actions: [
    { type: 'patch', deviceId: 'registry-device:living-light', patch: { isOn: true, brightness: 20 } },
  ] };
  let state = virtualSceneHome({ scenes: [scene], activeSceneId: scene.id, lastSceneRun: { sceneId: scene.id, ts: 1 } });
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null,
    setItem: jest.fn(async (key: string, value: string) => { disk.set(key, value); }) };
  const persistence = new SimulationPersistence(storage); const scope = sceneRestorationScope(state);
  const before = await persistence.load(scope);
  await persistence.updateWithSceneReceipt(scope, createSceneReceiptDescriptor(state, scene), (snapshot) => ({ ...snapshot,
    deviceStates: { ...snapshot.deviceStates, 'living-light': { ...snapshot.deviceStates['living-light'], on: true, level: 20 } } }));
  const store = { getState: () => state, setState: (patch: Partial<HomeState>) => { state = { ...state, ...patch }; } };
  return { scene, store, persistence, scope, before, storage, disk,
    review: () => prepareSceneEndReview(scene.id, store.getState, persistence) };
}

test('review makes no changes and confirmation restores the recorded values without deleting the scene', async () => {
  const fixture = await setup(); const { store, persistence, scope, before } = fixture;
  const writes = fixture.storage.setItem.mock.calls.length;
  const review = await fixture.review();
  expect(review.model.canRestore).toBe(true);
  expect(review.model.items[0].changes.find((item) => item.label === 'Brightness')).toEqual({ label: 'Brightness', before: `${before.deviceStates['living-light'].level}%`, after: '20%' });
  expect(fixture.storage.setItem).toHaveBeenCalledTimes(writes);
  expect(store.getState().activeSceneId).toBe('evening');
  await finishSceneEndReview(review, 'restore', store, persistence);
  expect((await persistence.load(scope)).deviceStates['living-light']).toEqual(before.deviceStates['living-light']);
  expect(persistence.getSceneReceipt(scope)).toBeNull();
  expect(store.getState().activeSceneId).toBeNull();
  expect(store.getState().scenes).toHaveLength(1);
});

test('keep-current consumes only the receipt and active marker', async () => {
  const fixture = await setup(); const snapshot = await fixture.persistence.load(fixture.scope);
  await finishSceneEndReview(await fixture.review(), 'keep', fixture.store, fixture.persistence);
  expect(await fixture.persistence.load(fixture.scope)).toBe(snapshot);
  expect(fixture.store.getState().activeSceneId).toBeNull();
});

test('later edits are shown accurately and remain unchanged, even when edited back to the scene value', async () => {
  const fixture = await setup();
  await fixture.persistence.update(fixture.scope, (snapshot) => ({ ...snapshot, deviceStates: { ...snapshot.deviceStates,
    'living-light': { ...snapshot.deviceStates['living-light'], level: 45 } } }));
  let review = await fixture.review();
  expect(review.model.canRestore).toBe(false);
  expect(review.model.items[0].changes.find((entry) => entry.label === 'Brightness')?.after).toBe('45%');
  await fixture.persistence.update(fixture.scope, (snapshot) => ({ ...snapshot, deviceStates: { ...snapshot.deviceStates,
    'living-light': { ...snapshot.deviceStates['living-light'], level: 20 } } }));
  review = await fixture.review();
  expect(review.model.items[0].disposition).toBe('skip');
  await expect(finishSceneEndReview(review, 'restore', fixture.store, fixture.persistence)).rejects.toThrow('No previous');
});

test.each(['identity', 'permission', 'deleted', 'rerun', 'device-edit', 'cancel'] as const)('rejects %s after review without any restoration', async (change) => {
  const fixture = await setup(); const review = await fixture.review();
  const controller = new AbortController();
  if (change === 'identity') fixture.store.setState({ sessionEpoch: 99 });
  if (change === 'permission') fixture.store.setState({ membershipReady: false });
  if (change === 'deleted') fixture.store.setState({ scenes: [] });
  if (change === 'rerun') await fixture.persistence.updateWithSceneReceipt(fixture.scope,
    createSceneReceiptDescriptor(fixture.store.getState(), fixture.scene), (snapshot) => snapshot);
  if (change === 'device-edit') await fixture.persistence.update(fixture.scope, (snapshot) => ({ ...snapshot, motionDisabled: !snapshot.motionDisabled }));
  if (change === 'cancel') controller.abort();
  const snapshot = await fixture.persistence.load(fixture.scope);
  await expect(finishSceneEndReview(review, 'restore', fixture.store, fixture.persistence, controller.signal)).rejects.toThrow();
  expect(await fixture.persistence.load(fixture.scope)).toBe(snapshot);
});

test('persisted receipts survive restart and session refresh but never transfer to another member', async () => {
  const fixture = await setup();
  fixture.store.setState({ sessionEpoch: 53, lastSceneRun: null });
  const restarted = new SimulationPersistence(fixture.storage);
  const review = await prepareSceneEndReview(fixture.scene.id, fixture.store.getState, restarted);
  expect(review.model.canRestore).toBe(true);
  await finishSceneEndReview(review, 'restore', fixture.store, restarted);
  expect((await restarted.load(fixture.scope)).deviceStates['living-light']).toEqual(fixture.before.deviceStates['living-light']);
  fixture.store.setState({ activeSceneId: fixture.scene.id, activeMemberId: 'other', authenticatedUserId: 'other', accountUserId: 'other',
    household: [{ id: 'other', userId: 'other', name: 'Other', role: 'Member', status: 'home' }] });
  const other = await prepareSceneEndReview(fixture.scene.id, fixture.store.getState, restarted);
  expect(other.model.canRestore).toBe(false);
  expect(other.model.items).toEqual([]);
});

test('legacy runs offer keep-current only and do not fabricate previous settings', async () => {
  const fixture = await setup();
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const review = await prepareSceneEndReview(fixture.scene.id, fixture.store.getState, persistence);
  expect(review.model.canRestore).toBe(false);
  expect(review.model.unavailableReason).toMatch(/not recorded/);
  await finishSceneEndReview(review, 'keep', fixture.store, persistence);
  expect(fixture.store.getState().activeSceneId).toBeNull();
});

test('a cancellation while confirmation hydrates is rechecked inside the mutation', async () => {
  const fixture = await setup(); const review = await fixture.review();
  const controller = new AbortController();
  const original = fixture.persistence.updateSceneReceipt.bind(fixture.persistence);
  jest.spyOn(fixture.persistence, 'updateSceneReceipt').mockImplementation(async (...args) => {
    controller.abort(); return original(...args);
  });
  const snapshot = await fixture.persistence.load(fixture.scope);
  await expect(finishSceneEndReview(review, 'restore', fixture.store, fixture.persistence, controller.signal)).rejects.toThrow('closed');
  expect(await fixture.persistence.load(fixture.scope)).toBe(snapshot);
});

test('a failed save can retry without restoring twice or claiming persistence', async () => {
  const fixture = await setup(); const review = await fixture.review();
  fixture.storage.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(finishSceneEndReview(review, 'restore', fixture.store, fixture.persistence)).rejects.toThrow('could not be saved');
  expect(fixture.persistence.getSceneReceipt(fixture.scope)).toBeNull();
  expect(fixture.store.getState().activeSceneId).toBe('evening');
  const restored = await fixture.persistence.load(fixture.scope);
  expect(restored.deviceStates['living-light']).toEqual(fixture.before.deviceStates['living-light']);
  const refresh = await fixture.review();
  expect(refresh.model.canRestore).toBe(false);
  await finishSceneEndReview(refresh, 'keep', fixture.store, fixture.persistence);
  expect(fixture.store.getState().activeSceneId).toBeNull();
  const restarted = new SimulationPersistence(fixture.storage);
  expect(await restarted.load(fixture.scope)).toEqual(restored);
  expect(restarted.getSceneReceipt(fixture.scope)).toBeNull();
});
