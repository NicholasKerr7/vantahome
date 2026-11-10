import { createDefaultSimulationSnapshot, type DeviceState, type SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationPersistence } from '../three-d-home/simulationPersistence';
import { HouseholdSyncCoordinator } from './HouseholdSyncCoordinator';
import { HouseholdSyncError, type HouseholdSyncTransport, type SharedDeviceChange, type SharedDeviceRow,
  type SharedHomeScope, type SharedHomeSnapshot, type SharedWriteIntent } from './householdSyncTransport';

jest.mock('../../services/supabaseClient', () => ({ supabase: null }));

const bindings = [
  { deviceId: 'light-record', modelDeviceId: 'living-light' },
  { deviceId: 'television-record', modelDeviceId: 'family-tv' },
  { deviceId: 'gate-record', modelDeviceId: 'entry-gate' },
];
const coordinators: HouseholdSyncCoordinator[] = [];

/** Separate server and phone objects so accidental reference sharing cannot make a synchronization test pass. */
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Drain persistence queues without advancing lease or reconciliation timers. */
async function settle(): Promise<void> { for (let turn = 0; turn < 40; turn += 1) await Promise.resolve(); }

/** Resolve a network boundary explicitly when testing disposal and late responses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

/** Preserve one phone's disk between runtime instances without sharing it with another phone. */
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }) };
}

/** Change one comfort control while retaining every unrelated device and personal rendering preference. */
function lightLevel(snapshot: SimulationSnapshot, level: number): SimulationSnapshot {
  return { ...snapshot, deviceStates: { ...snapshot.deviceStates, 'living-light': { ...snapshot.deviceStates['living-light'], level } } };
}

/** Model authoritative revisions and scoped reads; database authorization has its own independent SQL suite. */
class SharedServer {
  enabled = false;
  rows = new Map<string, SharedDeviceRow>();
  clock: SharedHomeSnapshot['clock'] = null;
  hints = new Set<() => void>();

  /** Start with canonical shared values, equivalent to a prior explicit Owner enable operation. */
  seed(snapshot = createDefaultSimulationSnapshot()): void {
    this.enabled = true;
    for (const binding of bindings) this.rows.set(binding.modelDeviceId, { ...binding, revision: 1, state: copy(snapshot.deviceStates[binding.modelDeviceId]) });
  }

  /** Return only the requesting account's allowed bindings and omit a gate lease from a room-only view. */
  snapshot(scope: SharedHomeScope): SharedHomeSnapshot {
    return copy({ homeId: scope.homeId, homeName: 'Verified household', enabled: this.enabled, serverTimeMs: Date.now(),
      devices: scope.bindings.flatMap((binding) => this.rows.has(binding.modelDeviceId) ? [this.rows.get(binding.modelDeviceId)!] : []),
      clock: scope.bindings.some((binding) => binding.modelDeviceId === 'entry-gate') ? this.clock : null });
  }

  /** Simulate another accepted client edit, optionally withholding its notification to exercise reconciliation. */
  edit(id: string, state: DeviceState, notify = true): void {
    const previous = this.rows.get(id)!;
    this.rows.set(id, { ...previous, revision: previous.revision + 1, state: copy(state) });
    if (notify) for (const hint of this.hints) hint();
  }

  /** Each connection has independent network callbacks and captured grants. */
  connect(scope: SharedHomeScope) {
    let connection: ((connected: boolean) => void) | null = null;
    let change: (() => void) | null = null;
    const read = jest.fn(async () => this.snapshot(scope));
    const enable = jest.fn(async (requestId: string, states: Record<string, DeviceState>) => {
      const existing = this.enabled;
      if (!existing) {
        this.enabled = true;
        for (const binding of scope.bindings) this.rows.set(binding.modelDeviceId, { ...binding, revision: 1, state: copy(states[binding.modelDeviceId]) });
        for (const hint of this.hints) hint();
      }
      return { ...this.snapshot(scope), requestId, status: existing ? 'existing' as const : 'applied' as const };
    });
    const patch = jest.fn(async (requestId: string, _clientId: string, _intent: SharedWriteIntent, changes: SharedDeviceChange[]): Promise<SharedHomeSnapshot> => {
      for (const candidate of changes) {
        if (!scope.bindings.some((binding) => binding.deviceId === candidate.deviceId && binding.modelDeviceId === candidate.modelDeviceId)) {
          throw new HouseholdSyncError('42501', 'Not permitted.');
        }
        if ((this.rows.get(candidate.modelDeviceId)?.revision ?? 0) !== candidate.expectedRevision) throw new HouseholdSyncError('VH409', 'Newer device state.');
      }
      for (const candidate of changes) this.rows.set(candidate.modelDeviceId, { deviceId: candidate.deviceId,
        modelDeviceId: candidate.modelDeviceId, revision: candidate.expectedRevision + 1, state: copy(candidate.state) });
      for (const hint of this.hints) hint();
      return { ...this.snapshot(scope), requestId, status: 'applied' as const };
    });
    const transport: HouseholdSyncTransport = { read, enable, patch,
      subscribe: (onChange, onConnection) => {
        change = onChange; connection = onConnection; this.hints.add(onChange); onConnection(true);
        return () => { this.hints.delete(onChange); };
      },
      close: () => { if (change) this.hints.delete(change); },
    };
    return { transport, read, enable, patch, setConnected: (connected: boolean) => connection?.(connected) };
  }
}

/** Start a real coordinator and persistence pair with private storage and a mutable account-lifecycle guard. */
async function phone(server: SharedServer, userId: string, options: {
  roomOnly?: boolean; initial?: SimulationSnapshot; storage?: ReturnType<typeof memoryStorage>;
} = {}) {
  const storage = options.storage ?? memoryStorage();
  const persistence = new SimulationPersistence(storage);
  const storageScope = `preview:${userId}`;
  await persistence.load(storageScope);
  if (options.initial) { persistence.save(storageScope, options.initial); await persistence.awaitSaved(storageScope); }
  const scope: SharedHomeScope = { userId, homeId: 'home-1', key: `${userId}:home-1`, bindings: options.roomOnly ? bindings.slice(0, 1) : bindings };
  const network = server.connect(scope);
  const lifecycle = { current: true };
  const accessChanged = jest.fn();
  let sequence = 0;
  const coordinator = new HouseholdSyncCoordinator({ scope, storageScope, persistence, transport: network.transport,
    clientId: `${userId}-phone`, requestId: () => `${userId}-request-${++sequence}`, current: () => lifecycle.current, accessChanged });
  coordinators.push(coordinator);
  coordinator.start();
  await coordinator.refresh(); await settle();
  return { coordinator, persistence, storage, storageScope, scope, network, lifecycle, accessChanged };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-09T12:00:00Z')); });
afterEach(() => { for (const coordinator of coordinators.splice(0)) coordinator.close(); jest.useRealTimers(); });

test('explicit Owner review seeds that phone once and preserves both phones original local caches', async () => {
  const server = new SharedServer();
  const ownerBaseline = lightLevel(createDefaultSimulationSnapshot(), 37);
  const guestBaseline = lightLevel(createDefaultSimulationSnapshot(), 81);
  const owner = await phone(server, 'owner', { initial: ownerBaseline });
  const guest = await phone(server, 'guest', { initial: guestBaseline, roomOnly: true });
  expect(owner.coordinator.getSnapshot().status).toBe('local');
  expect(await owner.coordinator.prepareEnable()).toEqual({ homeName: 'Verified household', deviceCount: 3 });
  expect(server.enabled).toBe(false);
  await owner.coordinator.enable();
  await guest.coordinator.refresh(); await settle();
  expect(server.rows.get('living-light')?.state.level).toBe(37);
  expect(guest.persistence.getSnapshot(guest.storageScope)?.deviceStates['living-light'].level).toBe(37);
  expect(guest.coordinator.getSnapshot()).toMatchObject({ status: 'live', deviceCount: 1 });
  for (const [fixture, baseline] of [[owner, ownerBaseline], [guest, guestBaseline]] as const) {
    const backup = JSON.parse(fixture.storage.values.get(`vantahome-3d-simulation:v1:${fixture.storageScope}:before-sharing`)!);
    expect(backup.state.deviceStates['living-light'].level).toBe(baseline.deviceStates['living-light'].level);
  }
  expect(guest.network.patch).not.toHaveBeenCalled();
});

test('changed local settings invalidate an open enable review without seeding the server', async () => {
  const server = new SharedServer(); const owner = await phone(server, 'owner');
  await owner.coordinator.prepareEnable();
  await owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 18));
  await expect(owner.coordinator.enable()).rejects.toMatchObject({ code: 'VH409' });
  expect(owner.network.enable).not.toHaveBeenCalled();
  expect(server.enabled).toBe(false);
});

test('a competing Owner enable adopts the existing home instead of replacing it with a stale review', async () => {
  const server = new SharedServer(); const owner = await phone(server, 'owner');
  await owner.coordinator.prepareEnable();
  server.seed(lightLevel(createDefaultSimulationSnapshot(), 64));
  await owner.coordinator.enable();
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['living-light'].level).toBe(64);
  expect(server.rows.get('living-light')?.revision).toBe(1);
});

test('verified disabled reads remain local across repeated refreshes', async () => {
  const server = new SharedServer(); const owner = await phone(server, 'owner');
  await owner.coordinator.refresh(); await owner.coordinator.refresh();
  await owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 41));
  expect(owner.coordinator.getSnapshot().status).toBe('local');
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['living-light'].level).toBe(41);
  expect(owner.network.patch).not.toHaveBeenCalled();
});

test('a room-scoped Guest change reaches the Owner without echo writes or exposing ungranted rows', async () => {
  const server = new SharedServer(); server.seed();
  const owner = await phone(server, 'owner'); const guest = await phone(server, 'guest', { roomOnly: true });
  const hidden = copy(server.rows.get('family-tv'));
  await guest.persistence.update(guest.storageScope, (state) => lightLevel(state, 23));
  await jest.advanceTimersByTimeAsync(80); await settle();
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['living-light'].level).toBe(23);
  expect(server.rows.get('family-tv')).toEqual(hidden);
  expect(guest.network.patch).toHaveBeenCalledTimes(1);
  expect(owner.network.patch).not.toHaveBeenCalled();
  expect((await guest.network.read()).devices.map((row) => row.modelDeviceId)).toEqual(['living-light']);
  expect(owner.coordinator.getSnapshot().status).toBe('live');
});

test('a stale same-device command cannot overwrite another phone and reconciliation adopts the winner', async () => {
  const server = new SharedServer(); server.seed();
  const owner = await phone(server, 'owner'); const guest = await phone(server, 'guest', { roomOnly: true });
  await owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 25));
  await expect(guest.persistence.update(guest.storageScope, (state) => lightLevel(state, 52))).rejects.toMatchObject({ code: 'VH409' });
  expect(server.rows.get('living-light')?.state.level).toBe(25);
  expect(guest.coordinator.getSnapshot().status).toBe('conflict');
  await jest.advanceTimersByTimeAsync(80); await settle();
  expect(guest.persistence.getSnapshot(guest.storageScope)?.deviceStates['living-light'].level).toBe(25);
  expect(guest.coordinator.getSnapshot().status).toBe('live');
  expect(guest.network.patch).toHaveBeenCalledTimes(1);
});

test('an accepted command with a lost response is recovered by read and never replayed', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  const apply = owner.network.patch.getMockImplementation()!;
  owner.network.patch.mockImplementationOnce(async (...args) => { await apply(...args); throw new HouseholdSyncError('network', 'Response lost.'); });
  await expect(owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 46))).rejects.toMatchObject({ code: 'network' });
  expect(server.rows.get('living-light')?.state.level).toBe(46);
  expect(owner.coordinator.getSnapshot().status).toBe('offline');
  await jest.advanceTimersByTimeAsync(80); await settle();
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['living-light'].level).toBe(46);
  expect(owner.network.patch).toHaveBeenCalledTimes(1);
  expect(server.rows.get('living-light')?.revision).toBe(2);
});

test('offline shared controls cannot fall back to local changes and recover only after verification', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  const before = owner.persistence.getSnapshot(owner.storageScope);
  owner.network.setConnected(false);
  await expect(owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 14))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(owner.persistence.getSnapshot(owner.storageScope)).toBe(before);
  expect(owner.network.patch).not.toHaveBeenCalled();
  owner.network.setConnected(true);
  await jest.advanceTimersByTimeAsync(80); await settle();
  expect(owner.coordinator.getSnapshot().status).toBe('live');
  await owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 14));
  expect(server.rows.get('living-light')?.state.level).toBe(14);
});

test('shared disk history rejects a later disabled server response after restart', async () => {
  const server = new SharedServer(); server.seed(); const first = await phone(server, 'owner');
  await first.persistence.awaitSaved(first.storageScope); first.coordinator.close();
  server.enabled = false; server.rows.clear();
  const reopened = await phone(server, 'owner', { storage: first.storage });
  expect(reopened.coordinator.getSnapshot().status).toBe('offline');
  await expect(reopened.persistence.update(reopened.storageScope, (state) => lightLevel(state, 18))).rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(reopened.network.patch).not.toHaveBeenCalled();
});

test('a late read for a disposed account cannot publish its data or invalidate the replacement account', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  const response = deferred<SharedHomeSnapshot>();
  owner.network.read.mockImplementationOnce(() => response.promise);
  const operation = owner.coordinator.refresh();
  const before = owner.persistence.getSnapshot(owner.storageScope);
  owner.lifecycle.current = false; owner.coordinator.close();
  server.edit('living-light', { ...server.rows.get('living-light')!.state, level: 4 }, false);
  response.resolve(server.snapshot(owner.scope)); await operation;
  expect(owner.persistence.getSnapshot(owner.storageScope)).toBe(before);
  expect(owner.accessChanged).not.toHaveBeenCalled();
});

test('a late write for a disposed account cannot publish its acknowledgement into the local cache', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  const response = deferred<SharedHomeSnapshot>();
  owner.network.patch.mockImplementationOnce(() => response.promise);
  const before = owner.persistence.getSnapshot(owner.storageScope);
  const operation = owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 4));
  await settle(); owner.lifecycle.current = false; owner.coordinator.close();
  response.resolve(server.snapshot(owner.scope));
  await expect(operation).rejects.toMatchObject({ code: 'scope_changed' });
  expect(owner.persistence.getSnapshot(owner.storageScope)).toBe(before);
});

test('only the server-leased phone can advance gate motion and the permission expires locally', async () => {
  const server = new SharedServer(); server.seed();
  server.clock = { clientId: 'owner-phone', expiresAtMs: Date.now() + 5_000 };
  const owner = await phone(server, 'owner'); const other = await phone(server, 'member');
  expect(owner.coordinator.canAdvance()).toBe(true);
  expect(other.coordinator.canAdvance()).toBe(false);
  await expect(other.persistence.saveMutation(other.storageScope, lightLevel(other.persistence.getSnapshot(other.storageScope)!, 8), 'tick'))
    .rejects.toMatchObject({ name: 'SimulationRemoteUnavailableError' });
  expect(other.network.patch).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(5_001);
  expect(owner.coordinator.canAdvance()).toBe(false);
});

test('revision changes invalidate scene restoration even when a remote edit returns to the same value', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  await owner.persistence.updateWithSceneReceipt(owner.storageScope, { identityKey: 'owner:home-1', runId: 'run-1',
    sceneId: 'evening', sceneName: 'Evening', createdAt: Date.now() }, (state) => lightLevel(state, 20));
  expect(owner.persistence.getSceneReceipt(owner.storageScope)?.devices[0].eligible).toBe(true);
  const accepted = copy(server.rows.get('living-light')!.state);
  server.edit('living-light', { ...accepted, level: 60 }, false);
  server.edit('living-light', accepted, false);
  await owner.coordinator.refresh();
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['living-light'].level).toBe(20);
  expect(owner.persistence.getSceneReceipt(owner.storageScope)?.devices[0].eligible).toBe(false);
});

test('unrelated changes returned with a command survive without being included in its scene restoration', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  server.edit('family-tv', { ...server.rows.get('family-tv')!.state, on: true }, false);
  await owner.persistence.updateWithSceneReceipt(owner.storageScope, { identityKey: 'owner:home-1', runId: 'run-1',
    sceneId: 'evening', sceneName: 'Evening', createdAt: Date.now() }, (state) => lightLevel(state, 20));
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['family-tv'].on).toBe(true);
  expect(owner.persistence.getSceneReceipt(owner.storageScope)?.devices.map((device) => device.deviceId)).toEqual(['living-light']);
});

test('missing formerly visible device rows recheck permissions instead of replacing the device with defaults', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  const before = owner.persistence.getSnapshot(owner.storageScope);
  server.rows.delete('living-light');
  await owner.coordinator.refresh();
  expect(owner.accessChanged).toHaveBeenCalledTimes(1);
  expect(owner.persistence.getSnapshot(owner.storageScope)).toBe(before);
  expect(owner.coordinator.getSnapshot().status).toBe('offline');
});

test('a regressing server revision is rejected without replacing accepted device values', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  await owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 29));
  const before = owner.persistence.getSnapshot(owner.storageScope);
  server.rows.set('living-light', { ...server.rows.get('living-light')!, revision: 1, state: { on: false, level: 90 } });
  await owner.coordinator.refresh();
  expect(owner.persistence.getSnapshot(owner.storageScope)).toBe(before);
  expect(owner.coordinator.getSnapshot().status).toBe('offline');
});

test('equivalent device fields in a different JSON key order do not cause a false conflict', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  const before = owner.persistence.getSnapshot(owner.storageScope)!;
  const light = before.deviceStates['living-light'];
  // Cached JSON and PostgreSQL JSONB may serialize these identical fields in different orders.
  owner.persistence.save(owner.storageScope, { ...before, deviceStates: { ...before.deviceStates,
    'living-light': { level: light.level, on: light.on, ...(light.settings ? { settings: light.settings } : {}) } } });
  await owner.persistence.update(owner.storageScope, (state) => lightLevel(state, 22));
  expect(server.rows.get('living-light')?.state.level).toBe(22);
  expect(owner.network.patch).toHaveBeenCalledTimes(1);
});

test('failed verification cannot reuse a previously disabled observation to open enable review', async () => {
  const server = new SharedServer(); const owner = await phone(server, 'owner');
  owner.network.read.mockRejectedValueOnce(new HouseholdSyncError('network', 'Unavailable.'));
  await expect(owner.coordinator.prepareEnable()).rejects.toMatchObject({ code: 'unavailable' });
  expect(owner.network.enable).not.toHaveBeenCalled();
});

/** Recovery replaces a failed subscription and reads accepted state, without a command replay. */
test('reconnect renews an offline channel and preserves accepted settings', async () => {
  const server = new SharedServer(); server.seed(); const owner = await phone(server, 'owner');
  owner.network.setConnected(false);
  expect(owner.coordinator.getSnapshot().status).toBe('offline');
  server.edit('living-light', { ...server.rows.get('living-light')!.state, level: 26 }, false);
  await owner.coordinator.reconnect();
  expect(owner.coordinator.getSnapshot().status).toBe('live');
  expect(owner.persistence.getSnapshot(owner.storageScope)?.deviceStates['living-light'].level).toBe(26);
  expect(owner.network.patch).not.toHaveBeenCalled();
});

/** A rate-limited timer sample cannot produce an offline banner or accelerate motion. */
test('a slightly early gate tick keeps the last accepted state and connection', async () => {
  const server = new SharedServer(); server.seed();
  server.clock = { clientId: 'owner-phone', expiresAtMs: Date.now() + 5000 };
  const owner = await phone(server, 'owner');
  owner.network.patch.mockRejectedValueOnce(new HouseholdSyncError('VH429', 'Too soon.'));
  const before = owner.persistence.getSnapshot(owner.storageScope)!;
  await owner.persistence.saveMutation(owner.storageScope, { ...before, deviceStates: { ...before.deviceStates,
    'entry-gate': { ...before.deviceStates['entry-gate'], level: 20 } } }, 'tick');
  expect(owner.coordinator.getSnapshot().status).toBe('live');
  expect(owner.persistence.getSnapshot(owner.storageScope)).toEqual(before);
});
