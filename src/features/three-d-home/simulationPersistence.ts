import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDefaultSimulationSnapshot,
  parseStoredSimulationSnapshotMessage,
  type SimulationSnapshot,
} from '../../../packages/home-scene/src/simulationBridgeProtocol';

export type SimulationSaveStatus = 'saving' | 'saved' | 'error' | 'disconnected';
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
type StoredSimulation = {
  state: SimulationSnapshot;
  status: SimulationSaveStatus;
  loading: Promise<void>;
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
    await record.loading;
    return record.state;
  }

  /** Reduce the latest hydrated state in one turn so concurrent scenes retain unrelated changes. */
  async update(scope: string, reduce: (state: SimulationSnapshot) => SimulationSnapshot): Promise<void> {
    const record = this.record(scope);
    await record.loading;
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
      state: createDefaultSimulationSnapshot(), status: 'saving', loading: Promise.resolve(),
      pending: null, writing: false, listeners: new Set(), stateListeners: new Set(),
    };
    this.records.set(scope, record);
    record.loading = this.storage.getItem(this.key(scope)).then((raw) => {
      const message = raw === null ? null : parseStoredSimulationSnapshotMessage(raw);
      if (raw !== null && !message) throw new Error('Invalid simulation cache');
      // An accepted edit before hydration finishes takes precedence over the old disk snapshot.
      if (message && record.pending === null) record.state = message.state;
      this.notify(record, record.pending === null ? 'saved' : 'saving');
    }).catch(() => this.notify(record, 'error'));
    return record;
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
