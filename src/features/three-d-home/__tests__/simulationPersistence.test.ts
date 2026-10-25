import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationPersistence } from '../simulationPersistence';
import { applySceneRestoration, type SceneRestorationDescriptor } from '../../scenes/sceneRestorationModel';

/** Drain persistence microtasks without relying on wall-clock delays. */
async function settle(): Promise<void> { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }

test('adds gas devices on upgrade without resetting the previous 90-device simulation', async () => {
  const legacy = createDefaultSimulationSnapshot();
  delete legacy.deviceStates['utility-gas-meter'];
  delete legacy.deviceStates['kitchen-gas-leak'];
  legacy.deviceStates['master-bedside-left'] = { on: false, level: 23, settings: { color: '#FF9AA2', lightColorMode: 'color' } };
  legacy.deviceStates['master-blinds'] = { on: true, level: 37 };
  legacy.lightingMode = 'night';
  legacy.night = true;
  const storage = { getItem: jest.fn().mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: legacy })), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  const status = jest.fn();
  persistence.subscribe('demo', status);
  const restored = await persistence.load('demo');
  expect(restored.deviceStates['master-bedside-left']).toEqual(legacy.deviceStates['master-bedside-left']);
  expect(restored.deviceStates['master-blinds']).toEqual(legacy.deviceStates['master-blinds']);
  expect(restored.lightingMode).toBe('night');
  expect(restored.deviceStates['utility-gas-meter'].on).toBe(true);
  expect(restored.deviceStates['kitchen-gas-leak'].on).toBe(true);
  expect(Object.keys(restored.deviceStates)).toHaveLength(92);
  expect(status).toHaveBeenLastCalledWith('saved');
});

test('preserves a malformed cache and rejects defaults and writes until a valid retry', async () => {
  const storage = { getItem: jest.fn().mockResolvedValue('{"token":"private"}'), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  const statuses = jest.fn();
  persistence.subscribe('demo', statuses);
  await expect(persistence.load('demo')).rejects.toMatchObject({ reason: 'corrupt' });
  expect(() => persistence.save('demo', createDefaultSimulationSnapshot())).toThrow('original data has been kept');
  const reduce = jest.fn((state) => state);
  await expect(persistence.update('demo', reduce)).rejects.toMatchObject({ reason: 'corrupt' });
  expect(reduce).not.toHaveBeenCalled();
  expect(statuses).toHaveBeenLastCalledWith('corrupt');
  expect(storage.setItem).not.toHaveBeenCalled();
  const original = { ...createDefaultSimulationSnapshot(), motionDisabled: true };
  storage.getItem.mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: original }));
  expect(await persistence.load('demo')).toEqual(original);
  expect(statuses).toHaveBeenLastCalledWith('saved');
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('coalesces concurrent reads and retries a transient failure when controls reopen', async () => {
  const original = { ...createDefaultSimulationSnapshot(), night: true, lightingMode: 'night' as const };
  const storage = { getItem: jest.fn().mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: original })), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  const attempts = [persistence.load('demo'), persistence.load('demo')];
  for (const attempt of attempts) await expect(attempt).rejects.toMatchObject({ reason: 'unavailable' });
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(() => persistence.save('demo', createDefaultSimulationSnapshot())).toThrow('temporarily unavailable');
  const reopened = jest.fn();
  persistence.subscribe('demo', reopened);
  expect(await persistence.load('demo')).toEqual(original);
  expect(storage.getItem).toHaveBeenCalledTimes(2);
  expect(reopened.mock.calls.map(([status]) => status)).toEqual(['load-error', 'loading', 'saved']);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('serializes writes, coalesces newer changes, and retains them across immediate reopen', async () => {
  let finishFirstWrite: () => void = () => undefined;
  const storage = {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstWrite = resolve; })).mockResolvedValue(undefined),
  };
  const persistence = new SimulationPersistence(storage);
  const original = await persistence.load('demo');
  persistence.save('demo', { ...original, night: true });
  await settle();
  persistence.save('demo', { ...original, motionDisabled: true });
  persistence.save('demo', { ...original, motionDisabled: true, lightingMode: 'night', night: true });
  const reopened = await persistence.load('demo');
  expect(reopened.motionDisabled).toBe(true);
  expect(reopened.lightingMode).toBe('night');
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  finishFirstWrite();
  await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(JSON.parse(storage.setItem.mock.calls[1][1]).state).toEqual(reopened);
});

test('restores after a cold restart and keeps account previews separate from the demo', async () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => saved.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { saved.set(key, value); }),
  };
  const first = new SimulationPersistence(storage);
  const state = await first.load('demo');
  first.save('demo', { ...state, motionDisabled: true });
  await settle();
  const restarted = new SimulationPersistence(storage);
  expect((await restarted.load('demo')).motionDisabled).toBe(true);
  expect((await restarted.load('preview:account-a')).motionDisabled).toBe(false);
});

test('retains in-memory edits after a failed write and reports recovery on the next edit', async () => {
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockRejectedValueOnce(new Error('Full')).mockResolvedValue(undefined) };
  const persistence = new SimulationPersistence(storage);
  const statuses = jest.fn();
  persistence.subscribe('demo', statuses);
  const state = await persistence.load('demo');
  persistence.save('demo', { ...state, motionDisabled: true });
  await settle();
  expect(statuses).toHaveBeenLastCalledWith('error');
  expect((await persistence.load('demo')).motionDisabled).toBe(true);
  persistence.save('demo', { ...state, motionDisabled: true, night: true });
  await settle();
  expect(statuses).toHaveBeenLastCalledWith('saved');
});

test('broadcasts local changes only within their scope and detaches closed surfaces', async () => {
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const state = await persistence.load('demo');
  const sameScope = jest.fn(); const differentScope = jest.fn();
  const unsubscribe = persistence.subscribeState('demo', sameScope);
  persistence.subscribeState('preview:account', differentScope);
  persistence.save('demo', { ...state, motionDisabled: true });
  expect(sameScope).toHaveBeenCalledTimes(1);
  expect(sameScope.mock.lastCall![0].motionDisabled).toBe(true);
  expect(differentScope).not.toHaveBeenCalled();
  unsubscribe();
  persistence.save('demo', state);
  expect(sameScope).toHaveBeenCalledTimes(1);
});

test('blocks edits during hydration and restores the existing cache without overwriting it', async () => {
  let hydrate!: (value: string) => void;
  const write = jest.fn();
  const persistence = new SimulationPersistence({ getItem: () => new Promise((resolve) => { hydrate = resolve; }), setItem: write });
  const state = { ...createDefaultSimulationSnapshot(), motionDisabled: true };
  const loaded = persistence.load('demo');
  expect(() => persistence.save('demo', createDefaultSimulationSnapshot())).toThrow('still loading');
  await settle();
  hydrate(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state }));
  expect((await loaded).motionDisabled).toBe(true);
  expect(write).not.toHaveBeenCalled();
});

const sceneDescriptor: SceneRestorationDescriptor = { identityKey: '["account","home","member"]', runId: 'run-1',
  sceneId: 'evening', sceneName: 'Evening', createdAt: 1 };

/** Create an actual changed light level in a cloned canonical snapshot. */
function lightLevel(state: ReturnType<typeof createDefaultSimulationSnapshot>, level: number) {
  return { ...state, deviceStates: { ...state.deviceStates, 'living-light': { ...state.deviceStates['living-light'], level } } };
}

/** Keep serialized writes available to a second persistence instance, simulating a cold reopen. */
function savedStorage() {
  const values = new Map<string, string>();
  return { values, getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }) };
}

test('persists the matching scene receipt and canonical snapshot in exactly one host-only write', async () => {
  const storage = savedStorage(); const persistence = new SimulationPersistence(storage);
  const stateListener = jest.fn(); persistence.subscribeState('demo', stateListener);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  const stored = JSON.parse(storage.setItem.mock.calls[0][1]);
  expect(stored.state.deviceStates['living-light'].level).toBe(20);
  expect(stored.sceneReceipt.runId).toBe('run-1');
  expect(stateListener.mock.lastCall![0]).not.toHaveProperty('sceneReceipt');
  const reopened = new SimulationPersistence(storage);
  expect((await reopened.load('demo')).deviceStates['living-light'].level).toBe(20);
  expect(reopened.getSceneReceipt('demo')).toEqual(persistence.getSceneReceipt('demo'));
  await reopened.load('another-home'); expect(reopened.getSceneReceipt('another-home')).toBeNull();
});

test('captures the latest transaction baseline for overlapping scene requests and retains only the last run', async () => {
  const persistence = new SimulationPersistence(savedStorage());
  await Promise.all([
    persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20)),
    persistence.updateWithSceneReceipt('demo', { ...sceneDescriptor, runId: 'run-2' }, (state) => lightLevel(state, 30)),
  ]);
  const receipt = persistence.getSceneReceipt('demo')!;
  expect(receipt.runId).toBe('run-2');
  expect(receipt.devices[0].changes.find((field) => field.field === 'level')).toEqual({ field: 'level', before: 20, after: 30 });
});

test('later edits permanently invalidate eligible devices even if their values return before reopening', async () => {
  const storage = savedStorage(); const persistence = new SimulationPersistence(storage);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  const after = await persistence.load('demo');
  persistence.save('demo', lightLevel(after, 30)); persistence.save('demo', after);
  expect(persistence.getSceneReceipt('demo')?.devices[0].eligible).toBe(false);
  expect(persistence.getSceneReceipt('demo')?.revision).toBe(3);
  await settle();
  const reopened = new SimulationPersistence(storage); await reopened.load('demo');
  expect(reopened.getSceneReceipt('demo')?.devices[0].eligible).toBe(false);
});

test('a saved in-place mutation cannot evade permanent eligibility invalidation', async () => {
  const persistence = new SimulationPersistence(savedStorage());
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  const current = persistence.getSnapshot('demo')!;
  current.deviceStates['living-light'].level = 30;
  persistence.save('demo', current);
  current.deviceStates['living-light'].level = 20;
  persistence.save('demo', current);
  expect(persistence.getSceneReceipt('demo')?.devices[0].eligible).toBe(false);
});

test('consumes a receipt atomically with restoration and rejects stale or repeated reviews', async () => {
  const storage = savedStorage(); const persistence = new SimulationPersistence(storage);
  const before = await persistence.load('demo');
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  const receipt = persistence.getSceneReceipt('demo')!;
  await persistence.updateSceneReceipt('demo', receipt, (state, latest) => applySceneRestoration(latest, state, ['living-light']));
  expect((await persistence.load('demo')).deviceStates['living-light']).toEqual(before.deviceStates['living-light']);
  expect(persistence.getSceneReceipt('demo')).toBeNull();
  await expect(persistence.updateSceneReceipt('demo', receipt)).rejects.toMatchObject({ name: 'SceneRestorationConflictError' });
  await settle();
  const reopened = new SimulationPersistence(storage); await reopened.load('demo');
  expect(reopened.getSceneReceipt('demo')).toBeNull();
  expect((await reopened.load('demo')).deviceStates['living-light']).toEqual(before.deviceStates['living-light']);
});

test('a change while review is open rejects its reducer before any restore writes', async () => {
  const persistence = new SimulationPersistence(savedStorage());
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  const receipt = persistence.getSceneReceipt('demo')!;
  await persistence.update('demo', (state) => ({ ...state, motionDisabled: true }));
  const restore = jest.fn((state) => state);
  await expect(persistence.updateSceneReceipt('demo', receipt, restore)).rejects.toMatchObject({ name: 'SceneRestorationConflictError' });
  expect(restore).not.toHaveBeenCalled();
  expect(persistence.getSceneReceipt('demo')?.devices[0].eligible).toBe(true);
});

test('keep current consumes the receipt without modifying any canonical device settings', async () => {
  const persistence = new SimulationPersistence(savedStorage());
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  const before = await persistence.load('demo'); const receipt = persistence.getSceneReceipt('demo')!;
  await persistence.updateSceneReceipt('demo', receipt);
  expect(await persistence.load('demo')).toBe(before);
  expect(persistence.getSceneReceipt('demo')).toBeNull();
});

test('invalid receipt metadata cannot destroy a valid canonical cache or manufacture an undo', async () => {
  const state = lightLevel(createDefaultSimulationSnapshot(), 23);
  const storage = { getItem: jest.fn().mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1,
    type: 'snapshot', state, sceneReceipt: { version: 1, payload: 'invalid' } })), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  expect(await persistence.load('demo')).toEqual(state);
  expect(persistence.getSceneReceipt('demo')).toBeNull();
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('malformed canonical state still fails closed even when receipt metadata exists', async () => {
  const storage = { getItem: jest.fn().mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1,
    type: 'snapshot', state: {}, sceneReceipt: {} })), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  await expect(persistence.load('demo')).rejects.toMatchObject({ reason: 'corrupt' });
  await expect(persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => state)).rejects.toMatchObject({ reason: 'corrupt' });
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('failed writes never save a receipt separately from its snapshot and recover on the next edit', async () => {
  const storage = savedStorage(); storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  const persistence = new SimulationPersistence(storage); const status = jest.fn(); persistence.subscribe('demo', status);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  await settle(); expect(status).toHaveBeenLastCalledWith('error');
  expect(storage.values.size).toBe(0);
  expect(persistence.getSceneReceipt('demo')?.runId).toBe('run-1');
  await persistence.update('demo', (state) => ({ ...state, motionDisabled: true })); await settle();
  expect(status).toHaveBeenLastCalledWith('saved');
  const reopened = new SimulationPersistence(storage); const restored = await reopened.load('demo');
  expect(restored.deviceStates['living-light'].level).toBe(20);
  expect(reopened.getSceneReceipt('demo')?.runId).toBe('run-1');
});

test('queued scene writes cannot resurrect an older receipt after keep current finishes', async () => {
  let finish!: () => void;
  const storage = savedStorage(); const normalWrite = storage.setItem.getMockImplementation()!;
  storage.setItem.mockImplementationOnce(async (key, value) => { await new Promise<void>((resolve) => { finish = resolve; }); await normalWrite(key, value); });
  const persistence = new SimulationPersistence(storage);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20)); await settle();
  const receipt = persistence.getSceneReceipt('demo')!;
  await persistence.updateSceneReceipt('demo', receipt);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  finish(); await settle();
  const reopened = new SimulationPersistence(storage); await reopened.load('demo');
  expect(reopened.getSceneReceipt('demo')).toBeNull();
});

test('receipt subscriptions are scoped, receive hydration and detach independently of scene snapshots', async () => {
  const persistence = new SimulationPersistence(savedStorage());
  const changes = jest.fn(); const other = jest.fn();
  const detach = persistence.subscribeSceneReceipt('demo', changes); persistence.subscribeSceneReceipt('other', other);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ runId: 'run-1' }));
  expect(other.mock.calls.every(([receipt]) => receipt === null)).toBe(true);
  const count = changes.mock.calls.length; detach();
  await persistence.updateSceneReceipt('demo', persistence.getSceneReceipt('demo')!);
  expect(changes).toHaveBeenCalledTimes(count);
});

test('storage acknowledgement waits for the atomic snapshot write to finish', async () => {
  let finish!: () => void;
  const storage = savedStorage(); const write = storage.setItem.getMockImplementation()!;
  storage.setItem.mockImplementationOnce(async (key, value) => { await new Promise<void>((resolve) => { finish = resolve; }); await write(key, value); });
  const persistence = new SimulationPersistence(storage);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  let saved = false;
  const waiting = persistence.awaitSaved('demo').then(() => { saved = true; });
  await settle(); expect(saved).toBe(false);
  finish(); await waiting;
  expect(saved).toBe(true);
  expect(storage.values.size).toBe(1);
});

test('retry saving a failed end stores the consumed result without replaying restoration', async () => {
  const storage = savedStorage(); const persistence = new SimulationPersistence(storage);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20)); await persistence.awaitSaved('demo');
  const receipt = persistence.getSceneReceipt('demo')!;
  storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  const restore = jest.fn((state, latest) => applySceneRestoration(latest, state, ['living-light']));
  await persistence.updateSceneReceipt('demo', receipt, restore);
  await expect(persistence.awaitSaved('demo')).rejects.toMatchObject({ name: 'SimulationSaveError' });
  expect(persistence.getSceneReceipt('demo')).toBeNull();
  await persistence.retrySave('demo');
  expect(restore).toHaveBeenCalledTimes(1);
  const reopened = new SimulationPersistence(storage); await reopened.load('demo');
  expect(reopened.getSceneReceipt('demo')).toBeNull();
  expect(reopened.getSnapshot('demo')).toEqual(persistence.getSnapshot('demo'));
});

test('synchronous listener edits publish only the latest matching state and receipt', async () => {
  const persistence = new SimulationPersistence(savedStorage()); await persistence.load('demo');
  let edited = false;
  persistence.subscribeState('demo', (state) => {
    if (edited) return;
    edited = true; persistence.save('demo', lightLevel(state, 39));
  });
  const snapshots = jest.fn(); const receipts = jest.fn();
  persistence.subscribeState('demo', snapshots); persistence.subscribeSceneReceipt('demo', receipts);
  await persistence.updateWithSceneReceipt('demo', sceneDescriptor, (state) => lightLevel(state, 20));
  expect(snapshots.mock.calls.every(([state]) => state.deviceStates['living-light'].level === 39)).toBe(true);
  expect(receipts.mock.lastCall![0].devices[0].eligible).toBe(false);
  await persistence.awaitSaved('demo');
});
