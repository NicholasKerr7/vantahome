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

export type SimulationSaveStatus = 'loading' | 'load-error' | 'corrupt' | 'saving' | 'saved' | 'error' | 'disconnected';

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
  stateListeners: Set<(state: SimulationSnapshot) => void>;
  sceneReceipt: SceneRestorationReceipt | null;
  receiptListeners: Set<(receipt: SceneRestorationReceipt | null) => void>;
};

/** Keep simulation preferences outside the account/device cache and serialize disk writes. */
export class SimulationPersistence {
  private readonly records = new Map<string, StoredSimulation>();

  /** Accept a storage adapter so hydration and write races can be tested deterministically. */
  constructor(private readonly storage: Storage = AsyncStorage) {}

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
    await this.load(scope);
    const record = this.record(scope);
    const next = reduce(record.state);
    if (next !== record.state) this.save(scope, next);
  }

  /** Capture the actual before/after transaction and persist its host receipt with that exact snapshot. */
  async updateWithSceneReceipt(scope: string, descriptor: SceneRestorationDescriptor,
    reduce: (state: SimulationSnapshot) => SimulationSnapshot): Promise<void> {
    await this.load(scope);
    const record = this.record(scope);
    const next = reduce(record.state);
    const receipt = createSceneRestorationReceipt(descriptor, record.state, next,
      [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(record.placements)]);
    this.commit(scope, record, next, receipt);
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
    await this.load(scope);
    const record = this.record(scope); const receipt = record.sceneReceipt;
    if (!receipt || receipt.runId !== expected.runId || receipt.revision !== expected.revision) throw new SceneRestorationConflictError();
    const next = reduce ? reduce(record.state, receipt) : record.state;
    this.commit(scope, record, next, null);
  }

  /** Await storage acknowledgement without replaying a scene or changing accepted controls. */
  async awaitSaved(scope: string): Promise<void> {
    await this.load(scope);
    const record = this.record(scope);
    if (record.status === 'saved') return;
    if (record.status === 'error') throw new SimulationSaveError();
    await new Promise<void>((resolve, reject) => {
      /** Detach this bounded waiter on the first save result. */
      const onStatus = (status: SimulationSaveStatus) => {
        if (status !== 'saved' && status !== 'error') return;
        record.listeners.delete(onStatus);
        if (status === 'saved') resolve();
        else reject(new SimulationSaveError());
      };
      record.listeners.add(onStatus);
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
    listener(record.status);
    return () => record.listeners.delete(listener);
  }

  /** Broadcast canonical state to every open renderer/control surface in this local scope. */
  subscribeState(scope: string, listener: (state: SimulationSnapshot) => void): () => void {
    const record = this.record(scope);
    record.stateListeners.add(listener);
    return () => record.stateListeners.delete(listener);
  }

  /** Update memory immediately and coalesce rapid edits behind the current disk write. */
  save(scope: string, state: SimulationSnapshot): void {
    const record = this.record(scope);
    // Do not let defaults or early renderer patches overwrite unread account data.
    if (!record.loaded) throw record.loadError ?? new SimulationLoadError('loading');
    let receipt = record.sceneReceipt;
    const invalidated = receipt ? invalidateChangedSceneRestoration(receipt, state, [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(record.placements)]) : null;
    if (receipt && (invalidated !== receipt || JSON.stringify(record.state) !== JSON.stringify(state))) {
      // Any later change invalidates an open review. Device eligibility remains
      // permanently false after its first edit, even if its values later return.
      receipt = receipt.revision >= Number.MAX_SAFE_INTEGER ? null
        : { ...invalidated!, revision: receipt.revision + 1 };
    }
    this.commit(scope, record, state, receipt);
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
      pending: null, writing: false, listeners: new Set(), stateListeners: new Set(), sceneReceipt: null, receiptListeners: new Set(),
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
      // The receipt belongs to this host cache only. Strip exactly that field
      // before the unchanged strict renderer protocol validates canonical state.
      let hostReceipt: unknown;
      let canonical: unknown = raw;
      if (raw !== null && raw.length <= 192 * 1024) {
        try {
          const envelope: unknown = JSON.parse(raw);
          if (envelope && typeof envelope === 'object' && !Array.isArray(envelope) && Object.hasOwn(envelope, 'sceneReceipt')) {
            const { sceneReceipt, ...snapshot } = envelope as Record<string, unknown>;
            hostReceipt = sceneReceipt; canonical = snapshot;
          }
        } catch { /* The canonical parser below reports corruption without overwriting the cache. */ }
      }
      const message = raw === null ? null : parseStoredSimulationSnapshotMessage(canonical);
      if (raw !== null && !message) throw new SimulationLoadError('corrupt');
      // Empty storage keeps the defaults captured for this record before await;
      // another household may now own the process-wide presentation catalog.
      record.state = message?.state ?? record.state;
      record.placements = message?.placements ?? (raw === null ? record.placements : []);
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
