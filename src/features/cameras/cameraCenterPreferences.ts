import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_FAVORITES = 128;
const MAX_SERIALIZED_LENGTH = 24_000;
type PreferenceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export interface CameraCenterPreferences {
  readonly favoriteIds: readonly string[];
  readonly ready: boolean;
  readonly status: 'loading' | 'saved' | 'saving' | 'error';
}
export const EMPTY_CAMERA_PREFERENCES: CameraCenterPreferences = {
  favoriteIds: [], ready: false, status: 'loading',
};
type PreferenceRecord = {
  value: CameraCenterPreferences;
  listeners: Set<() => void>;
  loading?: Promise<void>;
  writing: boolean;
  pending: string | null;
};

/** Accept only bounded opaque device IDs; URLs, media, display text and extra fields are rejected. */
export function parseCameraCenterPreferences(raw: string | null): string[] | null {
  if (raw === null) return [];
  if (raw.length > MAX_SERIALIZED_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['version', 'favoriteIds'].includes(key))
      || record.version !== 1 || !Array.isArray(record.favoriteIds) || record.favoriteIds.length > MAX_FAVORITES
      || !record.favoriteIds.every((id) => typeof id === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(id))) return null;
    return [...new Set(record.favoriteIds as string[])];
  } catch { return null; }
}

/** Persist presentation-only choices with isolated records and ordered writes for each account/home. */
export class CameraCenterPreferenceStore {
  private readonly records = new Map<string, PreferenceRecord>();

  /** An injectable adapter makes interrupted reads and rapid ordered writes testable. */
  constructor(private readonly storage: PreferenceStorage = AsyncStorage) {}

  /** A stable snapshot lets React render without reading or writing disk. */
  getSnapshot(scope: string): CameraCenterPreferences { return this.record(scope).value; }

  /** Register a scoped observer; old reads can only notify their original record. */
  subscribe(scope: string, listener: () => void): () => void {
    const record = this.record(scope);
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }

  /** Failed/corrupt reads preserve the original cache and never authorize overwriting it with defaults. */
  load(scope: string): Promise<void> {
    const record = this.record(scope);
    if (record.loading) return record.loading;
    if (record.value.ready) return Promise.resolve();
    this.publish(record, { ...record.value, status: 'loading' });
    const loading = this.storage.getItem(this.key(scope)).then((raw) => {
      const favoriteIds = parseCameraCenterPreferences(raw);
      if (!favoriteIds) throw new Error('Invalid camera preferences');
      this.publish(record, { favoriteIds, ready: true, status: 'saved' });
    }).catch(() => {
      this.publish(record, { ...record.value, ready: false, status: 'error' });
    }).finally(() => { record.loading = undefined; });
    record.loading = loading;
    return loading;
  }

  /** Accept only currently authorized camera IDs; unrelated or denied devices cannot become favorites. */
  toggleFavorite(scope: string, id: string, allowedIds: readonly string[]): boolean {
    const record = this.record(scope);
    if (!record.value.ready || !allowedIds.includes(id) || !/^[a-zA-Z0-9:_-]{1,160}$/.test(id)) return false;
    const authorized = new Set(allowedIds);
    const existing = record.value.favoriteIds.filter((item) => authorized.has(item));
    const favoriteIds = existing.includes(id) ? existing.filter((item) => item !== id)
      : [...existing, id].slice(0, MAX_FAVORITES);
    this.publish(record, { favoriteIds, ready: true, status: 'saving' });
    this.enqueue(scope, record);
    return true;
  }

  /** Retry a failed read or the latest accepted preference write without resetting user choices. */
  retry(scope: string): void {
    const record = this.record(scope);
    if (!record.value.ready) { void this.load(scope); return; }
    this.publish(record, { ...record.value, status: 'saving' });
    this.enqueue(scope, record);
  }

  /** Each opaque scope has its own immutable snapshot identity and independent write queue. */
  private record(scope: string): PreferenceRecord {
    const existing = this.records.get(scope);
    if (existing) return existing;
    const record: PreferenceRecord = { value: EMPTY_CAMERA_PREFERENCES, listeners: new Set(), writing: false, pending: null };
    this.records.set(scope, record);
    return record;
  }

  /** Namespace harmless local preferences separately from simulation device state. */
  private key(scope: string): string { return `vantahome-camera-center:v1:${scope}`; }

  /** Notify only this scope; asynchronous completions never read the currently selected household. */
  private publish(record: PreferenceRecord, value: CameraCenterPreferences): void {
    record.value = value;
    for (const listener of record.listeners) listener();
  }

  /** Coalesce rapid toggles behind an in-flight write while retaining the newest complete value. */
  private enqueue(scope: string, record: PreferenceRecord): void {
    record.pending = JSON.stringify({ version: 1, favoriteIds: record.value.favoriteIds });
    if (!record.writing) void this.flush(scope, record);
  }

  /** Complete accepted writes in order, even when their original screen has already unmounted. */
  private async flush(scope: string, record: PreferenceRecord): Promise<void> {
    record.writing = true;
    try {
      while (record.pending !== null) {
        const serialized = record.pending;
        record.pending = null;
        try {
          await this.storage.setItem(this.key(scope), serialized);
          if (record.pending === null) this.publish(record, { ...record.value, status: 'saved' });
        } catch {
          if (record.pending === null) this.publish(record, { ...record.value, status: 'error' });
        }
      }
    } finally { record.writing = false; }
  }
}

export const cameraCenterPreferenceStore = new CameraCenterPreferenceStore();
