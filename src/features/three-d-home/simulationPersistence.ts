import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDefaultSimulationSnapshot,
  parseStoredSimulationSnapshotMessage,
  type SimulationSnapshot,
} from '../../../packages/home-scene/src/simulationBridgeProtocol';

export type SimulationSaveStatus = 'loading' | 'load-error' | 'corrupt' | 'saving' | 'saved' | 'error' | 'disconnected';

/** Keep a failed read distinct from an empty cache and from an unsaved edit. */
export class SimulationLoadError extends Error {
  constructor(readonly reason: 'unavailable' | 'corrupt' | 'loading') {
    super(reason === 'corrupt' ? 'Saved controls could not be read. The original data has been kept.'
      : reason === 'loading' ? 'Saved controls are still loading.' : 'Saved controls are temporarily unavailable. Retry loading them.');
    this.name = 'SimulationLoadError';
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
  status: SimulationSaveStatus;
  loading: Promise<SimulationLoadError | null>;
  loaded: boolean;
  loadError: SimulationLoadError | null;
  pending: string | null;
  writing: boolean;
  listeners: Set<(status: SimulationSaveStatus) => void>;
  stateListeners: Set<(state: SimulationSnapshot) => void>;
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
    record.state = state;
    record.pending = JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state });
    for (const listener of record.stateListeners) listener(state);
    this.notify(record, 'saving');
    if (!record.writing) void this.flush(scope, record);
  }

  /** Create and validate a small versioned snapshot; malformed caches never reach the scene. */
  private record(scope: string): StoredSimulation {
    const cached = this.records.get(scope);
    if (cached) return cached;
    const record: StoredSimulation = {
      state: createDefaultSimulationSnapshot(), status: 'loading', loading: Promise.resolve(null), loaded: false, loadError: null,
      pending: null, writing: false, listeners: new Set(), stateListeners: new Set(),
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
      const message = raw === null ? null : parseStoredSimulationSnapshotMessage(raw);
      if (raw !== null && !message) throw new SimulationLoadError('corrupt');
      record.state = message?.state ?? createDefaultSimulationSnapshot();
      record.loaded = true;
      this.notify(record, 'saved');
      for (const listener of record.stateListeners) listener(record.state);
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
