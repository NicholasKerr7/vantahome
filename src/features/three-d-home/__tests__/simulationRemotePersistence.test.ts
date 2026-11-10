import { createDefaultSimulationSnapshot, type SimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { applySceneRestoration, type SceneRestorationDescriptor } from '../../scenes/sceneRestorationModel';
import { SimulationPersistence, type SimulationRemoteAdapter, type SimulationWriteIntent } from '../simulationPersistence';

const scope = 'preview:shared-household';
const descriptor: SceneRestorationDescriptor = { identityKey: 'account-home-member', runId: 'run-1',
  sceneId: 'evening', sceneName: 'Evening', createdAt: 1 };

/** Control asynchronous boundaries without depending on timers or network scheduling. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

/** Advance queued reads, transactions and storage writes deterministically. */
async function settle(): Promise<void> { for (let count = 0; count < 20; count += 1) await Promise.resolve(); }

/** Change one independent comfort value without modifying the supplied canonical snapshot. */
function lightLevel(state: SimulationSnapshot, level: number): SimulationSnapshot {
  return { ...state, deviceStates: { ...state.deviceStates, 'living-light': { ...state.deviceStates['living-light'], level } } };
}

/** Keep host cache data across persistence instances without sharing any runtime connection. */
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }) };
}

/** Build a household connection with observable authority and isolated local storage. */
async function setup() {
  const storage = { getItem: jest.fn(async (): Promise<string | null> => null), setItem: jest.fn(async (): Promise<void> => undefined) };
  const persistence = new SimulationPersistence(storage);
  const transact = jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot, _intent: SimulationWriteIntent) => next);
  const canAdvance = jest.fn(() => true);
  const adapter: SimulationRemoteAdapter = { transact, canAdvance };
  const detach = persistence.attachRemote(scope, adapter);
  const before = await persistence.load(scope);
  await persistence.markShared(scope, adapter);
  await persistence.awaitSaved(scope);
  storage.setItem.mockClear();
  persistence.setRemoteStatus(scope, 'shared');
  return { persistence, storage, adapter, transact, canAdvance, detach, before };
}

test('disk hydration and cache writes cannot establish household authority', async () => {
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const transact = jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot) => next);
  persistence.attachRemote(scope, { transact, canAdvance: () => true });
  const statuses = jest.fn(); persistence.subscribe(scope, statuses);
  const before = await persistence.load(scope);
  persistence.save(scope, before);
  await persistence.awaitSaved(scope);
  expect(statuses.mock.calls.map(([status]) => status)).toEqual(['connecting']);
  await expect(persistence.saveMutation(scope, lightLevel(before, 20))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(transact).not.toHaveBeenCalled();
  persistence.setRemoteStatus(scope, 'shared');
  expect(statuses).toHaveBeenLastCalledWith('shared');
});

test('shared commands publish only after acknowledgement and forward their captured baseline and intent', async () => {
  const fixture = await setup(); const response = deferred<SimulationSnapshot>();
  fixture.transact.mockImplementationOnce(() => response.promise);
  const next = lightLevel(fixture.before, 20);
  const snapshots = jest.fn(); fixture.persistence.subscribeState(scope, snapshots);
  const operation = fixture.persistence.saveMutation(scope, next, 'command');
  await settle();
  expect(fixture.transact).toHaveBeenCalledWith(fixture.before, next, 'command');
  expect(fixture.persistence.getSnapshot(scope)).toBe(fixture.before);
  expect(snapshots).not.toHaveBeenCalled();
  expect(fixture.storage.setItem).not.toHaveBeenCalled();
  response.resolve(next); await operation;
  expect(fixture.persistence.getSnapshot(scope)).toBe(next);
  expect(snapshots).toHaveBeenLastCalledWith(next);
});

test('failed shared commands preserve canonical state and existing scene restoration', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  await fixture.persistence.awaitSaved(scope);
  const before = fixture.persistence.getSnapshot(scope)!; const receipt = fixture.persistence.getSceneReceipt(scope);
  const writes = fixture.storage.setItem.mock.calls.length;
  fixture.transact.mockRejectedValueOnce(new Error('Revision conflict'));
  await expect(fixture.persistence.saveMutation(scope, lightLevel(before, 30))).rejects.toThrow('Revision conflict');
  expect(fixture.persistence.getSnapshot(scope)).toBe(before);
  expect(fixture.persistence.getSceneReceipt(scope)).toBe(receipt);
  expect(fixture.storage.setItem).toHaveBeenCalledTimes(writes);
});

test('failed shared scene writes cannot manufacture a new run or overwrite the previous receipt', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const before = fixture.persistence.getSnapshot(scope); const receipt = fixture.persistence.getSceneReceipt(scope);
  fixture.transact.mockRejectedValueOnce(new Error('Offline'));
  await expect(fixture.persistence.updateWithSceneReceipt(scope, { ...descriptor, runId: 'run-2' },
    (state) => lightLevel(state, 30))).rejects.toThrow('Offline');
  expect(fixture.persistence.getSnapshot(scope)).toBe(before);
  expect(fixture.persistence.getSceneReceipt(scope)).toBe(receipt);
});

test('scene receipts capture confirmed settings and exclude unrelated server updates', async () => {
  const fixture = await setup();
  fixture.transact.mockImplementationOnce(async (_previous, next) => ({ ...lightLevel(next, 22), deviceStates: {
    ...lightLevel(next, 22).deviceStates, 'family-tv': { ...next.deviceStates['family-tv'], on: !next.deviceStates['family-tv'].on },
  } }));
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const receipt = fixture.persistence.getSceneReceipt(scope)!;
  expect(receipt.devices.map((device) => device.deviceId)).toEqual(['living-light']);
  expect(receipt.devices[0].changes).toContainEqual({ field: 'level', before: fixture.before.deviceStates['living-light'].level, after: 22 });
  expect(fixture.persistence.getSnapshot(scope)?.deviceStates['family-tv'].on).toBe(!fixture.before.deviceStates['family-tv'].on);
});

test('scene restoration never captures an unrequested server field on the same device', async () => {
  const fixture = await setup();
  fixture.transact.mockImplementationOnce(async (_previous, next) => ({ ...next, deviceStates: {
    ...next.deviceStates, 'living-light': { ...next.deviceStates['living-light'],
      on: !fixture.before.deviceStates['living-light'].on },
  } }));
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const receipt = fixture.persistence.getSceneReceipt(scope)!;
  expect(receipt.devices[0].changes).toEqual([{ field: 'level', before: fixture.before.deviceStates['living-light'].level, after: 20 }]);
  await fixture.persistence.updateSceneReceipt(scope, receipt,
    (state, current) => applySceneRestoration(current, state, ['living-light']));
  expect(fixture.persistence.getSnapshot(scope)?.deviceStates['living-light']).toMatchObject({
    level: fixture.before.deviceStates['living-light'].level, on: !fixture.before.deviceStates['living-light'].on,
  });
});

test('an explicit same-value scene rerun replaces its personal receipt after server confirmation', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  await fixture.persistence.updateWithSceneReceipt(scope, { ...descriptor, runId: 'run-2' }, (state) => state);
  expect(fixture.transact).toHaveBeenCalledTimes(2);
  expect(fixture.persistence.getSceneReceipt(scope)).toMatchObject({ runId: 'run-2', devices: [] });
});

test('overlapping remote scenes reduce against the preceding accepted snapshot', async () => {
  const fixture = await setup(); const first = deferred<SimulationSnapshot>();
  fixture.transact.mockImplementationOnce(() => first.promise);
  const one = fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const two = fixture.persistence.updateWithSceneReceipt(scope, { ...descriptor, runId: 'run-2' }, (state) => lightLevel(state, 30));
  await settle(); expect(fixture.transact).toHaveBeenCalledTimes(1);
  first.resolve(lightLevel(fixture.before, 20)); await Promise.all([one, two]);
  const receipt = fixture.persistence.getSceneReceipt(scope)!;
  expect(receipt.runId).toBe('run-2');
  expect(receipt.devices[0].changes).toContainEqual({ field: 'level', before: 20, after: 30 });
});

test('remote revision changes invalidate restoration permanently even when the observed value is unchanged', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const state = fixture.persistence.getSnapshot(scope)!;
  fixture.persistence.applyRemote(scope, state, ['living-light']);
  expect(fixture.persistence.getSceneReceipt(scope)).toMatchObject({ revision: 2, devices: [{ deviceId: 'living-light', eligible: false }] });
  fixture.persistence.applyRemote(scope, lightLevel(state, 30), ['living-light']);
  fixture.persistence.applyRemote(scope, state, ['living-light']);
  expect(fixture.persistence.getSceneReceipt(scope)?.devices[0].eligible).toBe(false);
  expect(fixture.transact).toHaveBeenCalledTimes(1);
});

test('unrelated revision changes invalidate an open review without removing eligible comfort restoration', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const reviewed = fixture.persistence.getSceneReceipt(scope)!;
  fixture.persistence.applyRemote(scope, fixture.persistence.getSnapshot(scope)!, ['family-tv']);
  expect(fixture.persistence.getSceneReceipt(scope)).toMatchObject({ revision: 2, devices: [{ deviceId: 'living-light', eligible: true }] });
  await expect(fixture.persistence.updateSceneReceipt(scope, reviewed)).rejects.toMatchObject({ name: 'SceneRestorationConflictError' });
});

test('restoration rechecks its exact receipt after transport resolves and preserves intervening observations', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const reviewed = fixture.persistence.getSceneReceipt(scope)!; const response = deferred<SimulationSnapshot>();
  fixture.transact.mockImplementationOnce(() => response.promise);
  const operation = fixture.persistence.updateSceneReceipt(scope, reviewed,
    (state, receipt) => applySceneRestoration(receipt, state, ['living-light']));
  await settle();
  const newer = lightLevel(fixture.persistence.getSnapshot(scope)!, 31);
  fixture.persistence.applyRemote(scope, newer, ['living-light']);
  const latestReceipt = fixture.persistence.getSceneReceipt(scope);
  response.resolve(fixture.before);
  await expect(operation).rejects.toMatchObject({ name: 'SceneRestorationConflictError' });
  expect(fixture.persistence.getSnapshot(scope)).toBe(newer);
  expect(fixture.persistence.getSceneReceipt(scope)).toBe(latestReceipt);
});

test('failed restoration keeps the receipt available without consuming or changing settings', async () => {
  const fixture = await setup();
  await fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 20));
  const before = fixture.persistence.getSnapshot(scope); const receipt = fixture.persistence.getSceneReceipt(scope)!;
  fixture.transact.mockRejectedValueOnce(new Error('Offline'));
  await expect(fixture.persistence.updateSceneReceipt(scope, receipt,
    (state, current) => applySceneRestoration(current, state, ['living-light']))).rejects.toThrow('Offline');
  expect(fixture.persistence.getSnapshot(scope)).toBe(before);
  expect(fixture.persistence.getSceneReceipt(scope)).toBe(receipt);
});

test('detaching a household adapter cannot fall back to local commands or accept a delayed response', async () => {
  const fixture = await setup(); const response = deferred<SimulationSnapshot>();
  fixture.transact.mockImplementationOnce(() => response.promise);
  const operation = fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 20));
  await settle(); fixture.detach(); response.resolve(lightLevel(fixture.before, 20));
  await expect(operation).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  fixture.persistence.setRemoteStatus(scope, null);
  await expect(fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 30))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(fixture.persistence.getSnapshot(scope)).toBe(fixture.before);
  expect(fixture.storage.setItem).not.toHaveBeenCalled();
  const status = jest.fn(); fixture.persistence.subscribe(scope, status);
  expect(status).toHaveBeenLastCalledWith('offline');
});

test('an obsolete detach callback cannot release a replacement connection', async () => {
  const fixture = await setup(); const replacement = { transact: fixture.transact, canAdvance: () => true };
  fixture.persistence.attachRemote(scope, replacement); fixture.persistence.setRemoteStatus(scope, 'shared'); fixture.detach();
  await fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 20));
  expect(fixture.persistence.getSnapshot(scope)?.deviceStates['living-light'].level).toBe(20);
});

test('queued snapshots keep their captured comparison state instead of rebasing a stale command', async () => {
  const fixture = await setup(); const response = deferred<SimulationSnapshot>();
  const firstState = lightLevel(fixture.before, 20); const secondState = lightLevel(fixture.before, 30);
  fixture.transact.mockImplementationOnce(() => response.promise);
  fixture.transact.mockImplementationOnce(async (previous) => {
    expect(previous).toBe(fixture.before);
    if (previous !== firstState) throw new Error('Revision conflict');
    return secondState;
  });
  const first = fixture.persistence.saveMutation(scope, firstState);
  const second = fixture.persistence.saveMutation(scope, secondState);
  const rejected = expect(second).rejects.toThrow('Revision conflict');
  await settle(); expect(fixture.transact).toHaveBeenCalledTimes(1);
  response.resolve(firstState);
  await first; await rejected;
  expect(fixture.persistence.getSnapshot(scope)).toBe(firstState);
  expect(fixture.transact).toHaveBeenLastCalledWith(fixture.before, secondState, 'command');
});

test('queued actions cannot borrow a replacement connection after their original owner is released', async () => {
  const fixture = await setup(); const response = deferred<SimulationSnapshot>();
  fixture.transact.mockImplementationOnce(() => response.promise);
  const first = fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 20));
  const queued = fixture.persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 30));
  const results = Promise.allSettled([first, queued]);
  await settle();
  const replacement = { transact: jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot) => next), canAdvance: () => true };
  fixture.persistence.attachRemote(scope, replacement);
  fixture.persistence.setRemoteStatus(scope, 'shared');
  response.resolve(lightLevel(fixture.before, 20));
  expect(await results).toEqual([
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ name: 'SimulationRemoteUnavailableError' }) }),
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ name: 'SimulationRemoteUnavailableError' }) }),
  ]);
  expect(replacement.transact).not.toHaveBeenCalled();
  expect(fixture.persistence.getSnapshot(scope)).toBe(fixture.before);
  expect(fixture.persistence.getSceneReceipt(scope)).toBeNull();
  await fixture.persistence.update(scope, (state) => lightLevel(state, 40));
  expect(replacement.transact).toHaveBeenCalledTimes(1);
});

test('reattaching the same adapter still rejects old responses and ignores its old detach callback', async () => {
  const fixture = await setup(); const response = deferred<SimulationSnapshot>();
  fixture.transact.mockImplementationOnce(() => response.promise);
  const operation = fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 20));
  const rejected = expect(operation).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  await settle(); fixture.persistence.attachRemote(scope, fixture.adapter);
  fixture.persistence.setRemoteStatus(scope, 'shared'); fixture.detach();
  response.resolve(lightLevel(fixture.before, 20)); await rejected;
  await fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 30));
  expect(fixture.persistence.getSnapshot(scope)?.deviceStates['living-light'].level).toBe(30);
});

test.each(['tick', 'pause'] as const)('shared %s requires the current clock lease and never retries a rejected operation', async (intent) => {
  const fixture = await setup(); fixture.canAdvance.mockReturnValue(false);
  expect(fixture.persistence.canAdvance(scope)).toBe(false);
  await expect(fixture.persistence.saveMutation(scope, fixture.before, intent)).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(fixture.transact).not.toHaveBeenCalled();
  fixture.canAdvance.mockReturnValue(true); fixture.transact.mockRejectedValueOnce(new Error('Old gate revision'));
  await expect(fixture.persistence.saveMutation(scope, fixture.before, intent)).rejects.toThrow('Old gate revision');
  expect(fixture.transact).toHaveBeenCalledTimes(1);
  await fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 20));
  expect(fixture.transact).toHaveBeenCalledTimes(2);
});

test('local demonstrations keep immediate controls, scenes and their independent clock', async () => {
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const before = await persistence.load('demo');
  expect(persistence.canAdvance('demo')).toBe(true);
  await persistence.saveMutation('demo', lightLevel(before, 20), 'tick');
  expect(persistence.getSnapshot('demo')?.deviceStates['living-light'].level).toBe(20);
  await persistence.updateWithSceneReceipt('demo', descriptor, (state) => lightLevel(state, 30));
  expect(persistence.getSceneReceipt('demo')?.devices[0].changes).toContainEqual({ field: 'level', before: 20, after: 30 });
});

test('a confirmed never-enabled household returns to local controls and clock after its initial read', async () => {
  const persistence = new SimulationPersistence(memoryStorage());
  const adapter = { transact: jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot) => next), canAdvance: () => false };
  const detach = persistence.attachRemote(scope, adapter);
  const before = await persistence.load(scope);
  expect(persistence.canAdvance(scope)).toBe(false);
  await expect(persistence.saveMutation(scope, lightLevel(before, 20))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  await expect(persistence.releaseUnshared(scope, adapter)).resolves.toBe(true);
  detach();
  const statuses = jest.fn(); persistence.subscribe(scope, statuses);
  expect(statuses).toHaveBeenLastCalledWith('saved');
  expect(persistence.canAdvance(scope)).toBe(true);
  await persistence.saveMutation(scope, lightLevel(before, 20), 'tick');
  await persistence.updateWithSceneReceipt(scope, descriptor, (state) => lightLevel(state, 30));
  const receipt = persistence.getSceneReceipt(scope)!;
  await persistence.updateSceneReceipt(scope, receipt, (state, current) => applySceneRestoration(current, state, ['living-light']));
  expect(persistence.getSnapshot(scope)?.deviceStates['living-light'].level).toBe(20);
  expect(adapter.transact).not.toHaveBeenCalled();
});

test('shared authority survives restart and cannot be released by a disabled response or absent connection', async () => {
  const storage = memoryStorage(); const persistence = new SimulationPersistence(storage);
  const adapter = { transact: jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot) => next), canAdvance: () => true };
  persistence.attachRemote(scope, adapter);
  await persistence.load(scope);
  await persistence.markShared(scope, adapter);
  await persistence.awaitSaved(scope);
  expect(JSON.parse(storage.values.get(`vantahome-3d-simulation:v1:${scope}`)!)).toMatchObject({ shared: true });
  const restarted = new SimulationPersistence(storage);
  expect(restarted.canAdvance(scope)).toBe(false);
  const before = await restarted.load(scope);
  const statuses = jest.fn(); restarted.subscribe(scope, statuses);
  expect(statuses).toHaveBeenLastCalledWith('offline');
  await expect(restarted.saveMutation(scope, lightLevel(before, 20))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  restarted.attachRemote(scope, adapter);
  await expect(restarted.releaseUnshared(scope, adapter)).resolves.toBe(false);
  restarted.setRemoteStatus(scope, 'offline');
  expect(restarted.canAdvance(scope)).toBe(false);
  await expect(restarted.update(scope, (state) => lightLevel(state, 20))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(adapter.transact).not.toHaveBeenCalled();
});

test('disabled-response release waits for the saved latch and fails closed when the cache is unreadable', async () => {
  const loading = deferred<string | null>();
  const storage = { getItem: jest.fn(() => loading.promise), setItem: jest.fn(async () => undefined) };
  const persistence = new SimulationPersistence(storage);
  const adapter = { transact: jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot) => next), canAdvance: () => true };
  persistence.attachRemote(scope, adapter);
  const release = persistence.releaseUnshared(scope, adapter);
  const rejected = expect(release).rejects.toMatchObject({ reason: 'unavailable' });
  await settle(); expect(persistence.canAdvance(scope)).toBe(false);
  loading.reject(new Error('Storage unavailable')); await rejected;
  expect(persistence.canAdvance(scope)).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('obsolete disabled responses cannot release a replacement connection or another household', async () => {
  const persistence = new SimulationPersistence(memoryStorage());
  const adapter = { transact: jest.fn(async (_previous: SimulationSnapshot, next: SimulationSnapshot) => next), canAdvance: () => true };
  const replacement = { ...adapter };
  persistence.attachRemote(scope, adapter);
  persistence.attachRemote('other-home', replacement);
  await Promise.all([persistence.load(scope), persistence.load('other-home')]);
  const release = persistence.releaseUnshared(scope, adapter);
  persistence.attachRemote(scope, replacement);
  await expect(release).resolves.toBe(false);
  await expect(persistence.releaseUnshared('other-home', adapter)).resolves.toBe(false);
  await expect(persistence.markShared(scope, adapter)).rejects.toThrow('Household simulation is unavailable');
  expect(persistence.canAdvance(scope)).toBe(false);
  expect(persistence.canAdvance('other-home')).toBe(false);
  await expect(persistence.releaseUnshared(scope, replacement)).resolves.toBe(true);
  expect(persistence.canAdvance(scope)).toBe(true);
  expect(persistence.canAdvance('other-home')).toBe(false);
});

test.each([false, 'true', {}, 1])('malformed shared authority metadata cannot restore local authority: %p', async (shared) => {
  const storage = { getItem: async () => JSON.stringify({ channel: 'vantahome-simulation', version: 1,
    type: 'snapshot', state: createDefaultSimulationSnapshot(), shared }), setItem: jest.fn(async () => undefined) };
  const persistence = new SimulationPersistence(storage);
  await expect(persistence.load(scope)).rejects.toMatchObject({ reason: 'corrupt' });
  expect(persistence.canAdvance(scope)).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('shared disk acknowledgements still wait and report cache errors independently of connection status', async () => {
  const fixture = await setup(); const write = deferred<void>();
  fixture.storage.setItem.mockImplementationOnce(() => write.promise);
  await fixture.persistence.saveMutation(scope, lightLevel(fixture.before, 20));
  const status = jest.fn(); fixture.persistence.subscribe(scope, status);
  let saved = false; const waiting = fixture.persistence.awaitSaved(scope).then(() => { saved = true; });
  await settle(); expect(saved).toBe(false);
  expect(status).toHaveBeenLastCalledWith('saving');
  write.resolve(); await waiting; expect(status).toHaveBeenLastCalledWith('shared');
  fixture.storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  await fixture.persistence.saveMutation(scope, lightLevel(fixture.persistence.getSnapshot(scope)!, 30));
  await expect(fixture.persistence.awaitSaved(scope)).rejects.toMatchObject({ name: 'SimulationSaveError' });
  expect(status).toHaveBeenLastCalledWith('error');
});

test('invalid scene receipt metadata is rejected before any household mutation', async () => {
  const fixture = await setup();
  await expect(fixture.persistence.updateWithSceneReceipt(scope, { ...descriptor, identityKey: '' },
    (state) => lightLevel(state, 20))).rejects.toThrow('restoration record');
  expect(fixture.transact).not.toHaveBeenCalled();
  expect(fixture.persistence.getSnapshot(scope)).toEqual(createDefaultSimulationSnapshot());
});
