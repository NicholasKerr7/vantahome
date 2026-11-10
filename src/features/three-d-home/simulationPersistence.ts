import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDefaultSimulationSnapshot,
  parseStoredSimulationSnapshotMessage,
  type SimulationSnapshot,
} from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { buildRuntimeDeviceDefinitions, getRuntimePlacements, type RuntimePlacedDevice } from '../../../packages/home-scene/src/devicePlacement';
import { AUTHORED_DEVICES } from '../../../packages/home-scene/src/data';
import {
  createSceneRestorationReceipt, invalidateChangedSceneRestoration, parseSceneRestorationReceipt,
  type SceneRestorationDescriptor, type SceneRestorationReceipt,
} from '../scenes/sceneRestorationModel';

export type SimulationRemoteStatus = 'connecting' | 'syncing' | 'shared' | 'offline' | 'conflict';
export type SimulationSaveStatus = 'loading' | 'load-error' | 'corrupt' | 'saving' | 'saved' | 'error' | 'disconnected' | SimulationRemoteStatus;
export type SimulationWriteIntent = 'command' | 'tick' | 'pause';

/** A household adapter accepts the supplied baseline atomically or rejects it; it never silently rebases safety ticks. */
export interface SimulationRemoteAdapter {
  transact: (previous: SimulationSnapshot, next: SimulationSnapshot, intent: SimulationWriteIntent) => Promise<SimulationSnapshot>;
  canAdvance: () => boolean;
}

/** A previously shared scope cannot fall back to local commands after its connection is released. */
export class SimulationRemoteUnavailableError extends Error {
  constructor() {
    super('Household simulation is unavailable. Reconnect before changing shared controls.');
    this.name = 'SimulationRemoteUnavailableError';
  }
}

/** Keep a failed read distinct from an empty cache and from an unsaved edit. */
export class SimulationLoadError extends Error {
  constructor(readonly reason: 'unavailable' | 'corrupt' | 'loading') {
    super(reason === 'corrupt' ? 'Saved controls could not be read. The original data has been kept.'
      : reason === 'loading' ? 'Saved controls are still loading.' : 'Saved controls are temporarily unavailable. Retry loading them.');
    this.name = 'SimulationLoadError';
  }
}

/** A review must be rebuilt if another scene or control changed its accepted baseline. */
export class SceneRestorationConflictError extends Error {
  constructor() {
    super('The scene or its settings changed. Review the latest settings before ending it.');
    this.name = 'SceneRestorationConflictError';
  }
}

/** Distinguish accepted in-memory controls from changes confirmed in local storage. */
export class SimulationSaveError extends Error {
  constructor() {
    super('Your latest changes are not saved on this device yet. Retry saving before closing the app.');
    this.name = 'SimulationSaveError';
  }
}

/** Explain why input is paused without implying the original saved state was reset. */
export function simulationLoadFailureMessage(status: SimulationSaveStatus): string | null {
  if (status === 'corrupt') return 'Saved controls could not be read. Your original data is preserved. Retry loading it.';
  if (status === 'load-error') return 'Saved controls are temporarily unavailable. Retry to restore them.';
  return null;
}
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
type StoredSimulation = {
  state: SimulationSnapshot;
  placements: RuntimePlacedDevice[];
  status: SimulationSaveStatus;
  loading: Promise<SimulationLoadError | null>;
  loaded: boolean;
  loadError: SimulationLoadError | null;
  pending: string | null;
  writing: boolean;
  listeners: Set<(status: SimulationSaveStatus) => void>;
  storageListeners: Set<(status: SimulationSaveStatus) => void>;
  publishedStatus: SimulationSaveStatus;
  remoteStatus: SimulationRemoteStatus | null;
  remote: SimulationRemoteAdapter | null;
  requiresRemote: boolean;
  hasSharedHistory: boolean;
  connectionGeneration: number;
  mutations: Promise<void>;
  stateListeners: Set<(state: SimulationSnapshot) => void>;
  sceneReceipt: SceneRestorationReceipt | null;
  receiptListeners: Set<(receipt: SceneRestorationReceipt | null) => void>;
};

/** Keep simulation preferences outside the account/device cache and serialize disk writes. */
export class SimulationPersistence {
  private readonly records = new Map<string, StoredSimulation>();

  /** Accept a storage adapter so hydration and write races can be tested deterministically. */
  constructor(private readonly storage: Storage = AsyncStorage) {}

  /** Install one connection owner, keeping cached data non-authoritative until a remote read succeeds. */
  attachRemote(scope: string, adapter: SimulationRemoteAdapter): () => void {
    const record = this.record(scope);
    record.remote = adapter;
    record.connectionGeneration += 1;
    const generation = record.connectionGeneration;
    record.requiresRemote = true;
    this.setRemoteStatus(scope, 'connecting');
    return () => {
      if (record.remote !== adapter || record.connectionGeneration !== generation) return;
      record.remote = null;
      record.connectionGeneration += 1;
      this.setRemoteStatus(scope, 'offline');
    };
  }

  /** Persist an enabled household's authority requirement so a later restart cannot treat its cache as local. */
  async markShared(scope: string, adapter: SimulationRemoteAdapter): Promise<void> {
    const record = this.record(scope);
    const generation = record.connectionGeneration;
    if (record.remote !== adapter) throw new SimulationRemoteUnavailableError();
    if (!record.loaded) throw record.loadError ?? new SimulationLoadError('loading');
    if (record.hasSharedHistory) return;
    const backupKey = `${this.key(scope)}:before-sharing`;
    if (await this.storage.getItem(backupKey) === null) {
      const backup = JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot',
        state: record.state, placements: record.placements, ...(record.sceneReceipt ? { sceneReceipt: record.sceneReceipt } : {}) });
      if (backup.length > 192 * 1024) throw new SimulationSaveError();
      await this.storage.setItem(backupKey, backup);
    }
    this.assertConnection(record, generation);
    if (record.remote !== adapter) throw new SimulationRemoteUnavailableError();
    record.hasSharedHistory = true;
    record.requiresRemote = true;
    this.commit(scope, record, record.state, record.sceneReceipt);
  }

  /** A verified shared history never authorizes local command fallback, including after restart. */
  isShared(scope: string): boolean { return this.record(scope).hasSharedHistory; }

  /** Release initial verification only after an authoritative disabled result for a never-shared household. */
  async releaseUnshared(scope: string, adapter: SimulationRemoteAdapter): Promise<boolean> {
    const record = this.record(scope);
    const generation = record.connectionGeneration;
    await this.load(scope);
    if (record.remote !== adapter || record.connectionGeneration !== generation || record.hasSharedHistory) return false;
    record.remote = null;
    record.connectionGeneration += 1;
    record.requiresRemote = false;
    record.remoteStatus = null;
    this.publishStatus(record);
    return true;
  }

  /** Publish household connectivity independently from local disk acknowledgements. */
  setRemoteStatus(scope: string, status: SimulationRemoteStatus | null): void {
    const record = this.record(scope);
    record.remoteStatus = status;
    this.publishStatus(record);
  }

  /** Only the active household lease holder advances shared motion; offline demonstrations keep their local clock. */
  canAdvance(scope: string): boolean {
    const record = this.record(scope);
    return record.loaded && (!record.requiresRemote || Boolean(record.remote && ['shared', 'syncing'].includes(record.remoteStatus ?? '') && record.remote.canAdvance()));
  }

  /** Ingest an authoritative observation without dispatching commands or forgetting unseen intermediate edits. */
  applyRemote(scope: string, snapshot: SimulationSnapshot, changedDeviceIds: string[]): void {
    const record = this.record(scope);
    this.commit(scope, record, snapshot, this.invalidateReceipt(record, snapshot, changedDeviceIds));
  }

  /** Confirm a shared command before publishing it; local demonstrations retain their immediate cache behavior. */
  async saveMutation(scope: string, next: SimulationSnapshot, intent: SimulationWriteIntent = 'command'): Promise<void> {
    const record = this.record(scope);
    const generation = record.connectionGeneration;
    // Capture the caller's baseline before another queued mutation or remote observation can replace it.
    const previous = record.state;
    await this.load(scope);
    this.assertConnection(record, generation);
    if (!record.requiresRemote) { this.save(scope, next); return; }
    await this.enqueueMutation(record, generation, async () => {
      const confirmed = await this.transact(record, previous, next, intent);
      this.save(scope, confirmed);
    });
  }

  /** Share one hydrated record across fast screen exits and reopens. */
  async load(scope: string): Promise<SimulationSnapshot> {
    const record = this.record(scope);
    // A new screen or an explicit retry re-reads failures, never accepted in-memory edits.
    if (record.loadError) this.hydrate(scope, record);
    const error = await record.loading;
    if (error) throw error;
    return record.state;
  }

  /** Reduce the latest hydrated state in one turn so concurrent scenes retain unrelated changes. */
  async update(scope: string, reduce: (state: SimulationSnapshot) => SimulationSnapshot): Promise<void> {
    const record = this.record(scope);
    const generation = record.connectionGeneration;
    await this.load(scope);
    this.assertConnection(record, generation);
    if (!record.requiresRemote) {
      const next = reduce(record.state);
      if (next !== record.state) this.save(scope, next);
      return;
    }
    await this.enqueueMutation(record, generation, async () => {
      const previous = record.state;
      const next = reduce(previous);
      const confirmed = await this.transact(record, previous, next, 'command');
      if (confirmed !== record.state) this.save(scope, confirmed);
    });
  }

  /** Capture the actual before/after transaction and persist its host receipt with that exact snapshot. */
  async updateWithSceneReceipt(scope: string, descriptor: SceneRestorationDescriptor,
    reduce: (state: SimulationSnapshot) => SimulationSnapshot): Promise<void> {
    const record = this.record(scope);
    const generation = record.connectionGeneration;
    await this.load(scope);
    this.assertConnection(record, generation);
    /** Keep a complete explicit run in the same queue as ordinary shared mutations. */
    const run = async () => {
      const previous = record.state;
      const next = reduce(previous);
      const catalog = [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(record.placements)];
      // Validate the descriptor and captured values before any server mutation can be accepted.
      const provisional = createSceneRestorationReceipt(descriptor, previous, next, catalog);
      if (!record.requiresRemote) { this.commit(scope, record, next, provisional); return; }
      const confirmed = await this.transact(record, previous, next, 'command');
      const receipt = createSceneRestorationReceipt(descriptor, this.sceneBaseline(previous, next, confirmed), confirmed, catalog);
      this.commit(scope, record, confirmed, receipt);
    };
    if (record.requiresRemote) await this.enqueueMutation(record, generation, run);
    else await run();
  }

  /** Expose metadata only to host callers; renderer snapshots and subscriptions never include it. */
  getSceneReceipt(scope: string): SceneRestorationReceipt | null {
    const record = this.record(scope);
    return record.loaded ? record.sceneReceipt : null;
  }

  /** Read the latest hydrated host state synchronously after an accepted transaction. */
  getSnapshot(scope: string): SimulationSnapshot | null {
    const record = this.record(scope);
    return record.loaded ? record.state : null;
  }

  /** Observe receipt changes independently from renderers and save-status transitions. */
  subscribeSceneReceipt(scope: string, listener: (receipt: SceneRestorationReceipt | null) => void): () => void {
    const record = this.record(scope);
    record.receiptListeners.add(listener);
    listener(record.loaded ? record.sceneReceipt : null);
    return () => record.receiptListeners.delete(listener);
  }

  /** Consume the reviewed receipt and optional restoration in one serialized storage write. */
  async updateSceneReceipt(scope: string, expected: { runId: string; revision: number },
    reduce?: (state: SimulationSnapshot, receipt: SceneRestorationReceipt) => SimulationSnapshot): Promise<void> {
    const record = this.record(scope);
    const generation = record.connectionGeneration;
    await this.load(scope);
    this.assertConnection(record, generation);
    /** Consume only the exact reviewed receipt, including after asynchronous server acknowledgement. */
    const restore = async () => {
      const receipt = record.sceneReceipt;
      if (!receipt || receipt.runId !== expected.runId || receipt.revision !== expected.revision) throw new SceneRestorationConflictError();
      const previous = record.state;
      const next = reduce ? reduce(previous, receipt) : previous;
      if (!record.requiresRemote) { this.commit(scope, record, next, null); return; }
      const confirmed = await this.transact(record, previous, next, 'command');
      if (record.sceneReceipt !== receipt) throw new SceneRestorationConflictError();
      this.commit(scope, record, confirmed, null);
    };
    if (record.requiresRemote) await this.enqueueMutation(record, generation, restore);
    else await restore();
  }

  /** Await storage acknowledgement without replaying a scene or changing accepted controls. */
  async awaitSaved(scope: string): Promise<void> {
    await this.load(scope);
    const record = this.record(scope);
    await record.mutations;
    if (record.status === 'saved') return;
    if (record.status === 'error') throw new SimulationSaveError();
    await new Promise<void>((resolve, reject) => {
      /** Detach this bounded waiter on the first save result. */
      const onStatus = (status: SimulationSaveStatus) => {
        if (status !== 'saved' && status !== 'error') return;
        record.storageListeners.delete(onStatus);
        if (status === 'saved') resolve();
        else reject(new SimulationSaveError());
      };
      record.storageListeners.add(onStatus);
    });
  }

  /** Retry only the latest accepted snapshot/receipt pair, never replay an already consumed scene. */
  async retrySave(scope: string): Promise<void> {
    await this.load(scope);
    const record = this.record(scope);
    this.commit(scope, record, record.state, record.sceneReceipt);
    await this.awaitSaved(scope);
  }

  /** Observe save failures without passing storage access into the renderer. */
  subscribe(scope: string, listener: (status: SimulationSaveStatus) => void): () => void {
    const record = this.record(scope);
    record.listeners.add(listener);
    listener(record.publishedStatus);
    return () => record.listeners.delete(listener);
  }

  /** Broadcast canonical state to every open renderer/control surface in this local scope. */
  subscribeState(scope: string, listener: (state: SimulationSnapshot) => void): () => void {
    const record = this.record(scope);
    record.stateListeners.add(listener);
    return () => record.stateListeners.delete(listener);
  }

  /** Save accepted local data only; shared commands must use saveMutation instead of this cache/reconciliation path. */
  save(scope: string, state: SimulationSnapshot): void {
    const record = this.record(scope);
    // Do not let defaults or early renderer patches overwrite unread account data.
    if (!record.loaded) throw record.loadError ?? new SimulationLoadError('loading');
    this.commit(scope, record, state, this.invalidateReceipt(record, state));
  }

  /** Revision notifications disqualify a device even when edits returned it to the same value between reads. */
  private invalidateReceipt(record: StoredSimulation, state: SimulationSnapshot, changedDeviceIds: readonly string[] = []): SceneRestorationReceipt | null {
    const receipt = record.sceneReceipt;
    if (!receipt) return null;
    let invalidated = invalidateChangedSceneRestoration(receipt, state, [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(record.placements)]);
    const changed = new Set(changedDeviceIds);
    if (invalidated.devices.some((device) => device.eligible && changed.has(device.deviceId))) {
      invalidated = { ...invalidated, devices: invalidated.devices.map((device) => device.eligible && changed.has(device.deviceId)
        ? { ...device, eligible: false } : device) };
    }
    const revised = changed.size > 0 || invalidated !== receipt || JSON.stringify(record.state) !== JSON.stringify(state);
    return !revised ? receipt : receipt.revision >= Number.MAX_SAFE_INTEGER ? null : { ...invalidated, revision: receipt.revision + 1 };
  }

  /** Serialize mutations without making a failed request block subsequent explicit retries. */
  private enqueueMutation(record: StoredSimulation, generation: number, operation: () => Promise<void>): Promise<void> {
    const result = record.mutations.then(() => {
      this.assertConnection(record, generation);
      return operation();
    });
    record.mutations = result.catch(() => undefined);
    return result;
  }

  /** Retained callbacks may not borrow authority from a replacement connection, even with the same adapter object. */
  private assertConnection(record: StoredSimulation, generation: number): void {
    if (record.connectionGeneration !== generation) throw new SimulationRemoteUnavailableError();
  }

  /** Recheck connection ownership after awaiting transport so released clients cannot publish stale acknowledgements. */
  private async transact(record: StoredSimulation, previous: SimulationSnapshot, next: SimulationSnapshot,
    intent: SimulationWriteIntent): Promise<SimulationSnapshot> {
    const adapter = record.remote;
    const generation = record.connectionGeneration;
    if (!adapter || !['shared', 'syncing'].includes(record.remoteStatus ?? '')) throw new SimulationRemoteUnavailableError();
    if (intent !== 'command' && !adapter.canAdvance()) throw new SimulationRemoteUnavailableError();
    const confirmed = await adapter.transact(previous, next, intent);
    this.assertConnection(record, generation);
    if (record.remote !== adapter) throw new SimulationRemoteUnavailableError();
    return confirmed;
  }

  /** Exclude unrelated concurrent remote changes from a run's personal restoration receipt. */
  private sceneBaseline(previous: SimulationSnapshot, intended: SimulationSnapshot, confirmed: SimulationSnapshot): SimulationSnapshot {
    const deviceStates = { ...confirmed.deviceStates };
    for (const [id, requested] of Object.entries(intended.deviceStates)) {
      const before = previous.deviceStates[id];
      const accepted = confirmed.deviceStates[id];
      if (!before || !accepted || before === requested) continue;
      const baseline = { ...accepted };
      if (before.on !== requested.on) baseline.on = before.on;
      if (before.level !== requested.level) baseline.level = before.level;
      const settings = { ...accepted.settings };
      for (const key of new Set([...Object.keys(before.settings ?? {}), ...Object.keys(requested.settings ?? {})])) {
        if (before.settings?.[key] === requested.settings?.[key]) continue;
        if (before.settings?.[key] === undefined) delete settings[key];
        else settings[key] = before.settings[key];
      }
      if (Object.keys(settings).length) baseline.settings = settings;
      else delete baseline.settings;
      deviceStates[id] = baseline;
    }
    return { ...confirmed, deviceStates,
      ...(previous.lightingMode === intended.lightingMode ? {} : { lightingMode: previous.lightingMode }),
      ...(previous.night === intended.night ? {} : { night: previous.night }) };
  }

  /** Write canonical controls and their matching undo receipt as one indivisible cache record. */
  private commit(scope: string, record: StoredSimulation, state: SimulationSnapshot, sceneReceipt: SceneRestorationReceipt | null): void {
    if (!record.loaded) throw record.loadError ?? new SimulationLoadError('loading');
    record.state = state;
    record.sceneReceipt = sceneReceipt;
    // Retain metadata during a temporary access recheck without granting it to a
    // renderer. A queued save from this scope must never borrow another home's catalog.
    const placements = new Map(record.placements.map((device) => [device.id, device]));
    for (const device of getRuntimePlacements()) if (Object.hasOwn(state.deviceStates, device.id)) placements.set(device.id, device);
    record.placements = [...placements.values()].filter((device) => Object.hasOwn(state.deviceStates, device.id));
    record.pending = JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state, placements: record.placements,
      ...(record.hasSharedHistory ? { shared: true } : {}),
      ...(sceneReceipt ? { sceneReceipt } : {}) });
    this.notify(record, 'saving');
    // A host listener may synchronously accept a newer transaction. Remaining
    // observers must see that latest pair, never an older receipt with new state.
    for (const listener of record.stateListeners) listener(record.state);
    for (const listener of record.receiptListeners) listener(record.sceneReceipt);
    if (!record.writing) void this.flush(scope, record);
  }

  /** Create and validate a small versioned snapshot; malformed caches never reach the scene. */
  private record(scope: string): StoredSimulation {
    const cached = this.records.get(scope);
    if (cached) return cached;
    const record: StoredSimulation = {
      state: createDefaultSimulationSnapshot(), placements: getRuntimePlacements(), status: 'loading', loading: Promise.resolve(null), loaded: false, loadError: null,
      pending: null, writing: false, listeners: new Set(), storageListeners: new Set(), publishedStatus: 'loading',
      remoteStatus: null, remote: null, requiresRemote: false, hasSharedHistory: false, connectionGeneration: 0, mutations: Promise.resolve(),
      stateListeners: new Set(), sceneReceipt: null, receiptListeners: new Set(),
    };
    this.records.set(scope, record);
    this.hydrate(scope, record);
    return record;
  }

  /** Resolve internal reads safely for subscribers; only explicit load callers receive errors. */
  private hydrate(scope: string, record: StoredSimulation): void {
    record.loadError = null;
    this.notify(record, 'loading');
    record.loading = Promise.resolve().then(() => this.storage.getItem(this.key(scope))).then((raw) => {
      // The receipt and shared-authority latch belong to this host cache only.
      // Strip those fields before the strict renderer protocol validates canonical state.
      let hostReceipt: unknown;
      let shared: unknown;
      let canonical: unknown = raw;
      if (raw !== null && raw.length <= 192 * 1024) {
        try {
          const envelope: unknown = JSON.parse(raw);
          if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
            const { sceneReceipt, shared: storedShared, ...snapshot } = envelope as Record<string, unknown>;
            hostReceipt = sceneReceipt; shared = storedShared; canonical = snapshot;
          }
        } catch { /* The canonical parser below reports corruption without overwriting the cache. */ }
      }
      const message = raw === null ? null : parseStoredSimulationSnapshotMessage(canonical);
      if ((raw !== null && !message) || (shared !== undefined && shared !== true)) throw new SimulationLoadError('corrupt');
      // Empty storage keeps the defaults captured for this record before await;
      // another household may now own the process-wide presentation catalog.
      record.state = message?.state ?? record.state;
      record.placements = message?.placements ?? (raw === null ? record.placements : []);
      record.hasSharedHistory ||= shared === true;
      record.requiresRemote ||= record.hasSharedHistory;
      record.sceneReceipt = parseSceneRestorationReceipt(hostReceipt, record.state,
        [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(record.placements)]);
      record.loaded = true;
      this.notify(record, 'saved');
      for (const listener of record.stateListeners) listener(record.state);
      for (const listener of record.receiptListeners) listener(record.sceneReceipt);
      return null;
    }).catch((error: unknown) => {
      const failure = error instanceof SimulationLoadError ? error : new SimulationLoadError('unavailable');
      record.loadError = failure;
      this.notify(record, failure.reason === 'corrupt' ? 'corrupt' : 'load-error');
      return failure;
    });
  }

  /** Namespacing prevents simulated state from entering the original household store. */
  private key(scope: string): string { return `vantahome-3d-simulation:v1:${scope}`; }

  /** Publish only status transitions, keeping slider activity from rerendering the host. */
  private notify(record: StoredSimulation, status: SimulationSaveStatus): void {
    if (record.status === status) return;
    record.status = status;
    for (const listener of record.storageListeners) listener(status);
    this.publishStatus(record);
  }

  /** Disk completion never upgrades an unverified household connection to a saved/shared state. */
  private publishStatus(record: StoredSimulation): void {
    const status = record.remoteStatus === 'shared' && (record.status === 'error' || record.status === 'saving')
      ? record.status : record.remoteStatus ?? (record.requiresRemote ? 'offline' : record.status);
    if (record.publishedStatus === status) return;
    record.publishedStatus = status;
    for (const listener of record.listeners) listener(status);
  }

  /** Finish accepted saves even after graphics unmount; later edits cannot be overwritten by an older write. */
  private async flush(scope: string, record: StoredSimulation): Promise<void> {
    record.writing = true;
    await record.loading;
    try {
      while (record.pending !== null) {
        const serialized = record.pending;
        record.pending = null;
        try {
          await this.storage.setItem(this.key(scope), serialized);
          if (record.pending === null) this.notify(record, 'saved');
        } catch {
          this.notify(record, 'error');
        }
      }
    } finally { record.writing = false; }
  }
}

export const simulationPersistence = new SimulationPersistence();
