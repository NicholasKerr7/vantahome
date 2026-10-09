import AsyncStorage from '@react-native-async-storage/async-storage';

export const CINEMATIC_HOST_PREFERENCE_KEY = 'vantahome:cinematic-preferences:v1';
export type CinematicPreferenceState = { ready: boolean; idleEnabled: boolean; preferenceError: boolean };
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };

/** Own one small device-local preference outside account, device and safety simulation state. */
export class CinematicPreferencePersistence {
  private state: CinematicPreferenceState = { ready: false, idleEnabled: false, preferenceError: false };
  private loading: Promise<void> | null = null;
  private revision = 0;
  private pending: boolean | null = null;
  private writing = false;
  private readonly listeners = new Set<() => void>();

  /** An injectable adapter makes read/write failures and races deterministic in tests. */
  constructor(private readonly storage: Storage = AsyncStorage) {}

  /** Return a stable immutable snapshot for useSyncExternalStore and warm renderer remounts. */
  getSnapshot = (): CinematicPreferenceState => this.state;

  /** Subscribe without starting storage work during a React render. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Hydrate once; a newer explicit choice always wins over a late disk read. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = Promise.resolve().then(() => this.storage.getItem(CINEMATIC_HOST_PREFERENCE_KEY)).then((raw) => {
      let idleEnabled = true;
      if (raw !== null) {
        if (raw.length > 128) throw new Error('Invalid cinematic preference');
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || Object.keys(value).sort().join(',') !== 'idleEnabled,version'
          || !('version' in value) || value.version !== 1 || !('idleEnabled' in value) || typeof value.idleEnabled !== 'boolean') throw new Error('Invalid cinematic preference');
        idleEnabled = value.idleEnabled;
      }
      this.update({ ready: true, idleEnabled: this.revision ? this.state.idleEnabled : idleEnabled, preferenceError: false });
    }).catch(() => {
      this.update({ ready: true, idleEnabled: this.revision ? this.state.idleEnabled : false, preferenceError: true });
    });
    return this.loading;
  }

  /** Keep the latest local intent responsive while serializing durable writes across unmounts. */
  save(idleEnabled: boolean): void {
    this.revision += 1;
    this.pending = idleEnabled;
    this.update({ ...this.state, idleEnabled });
    if (!this.writing) void this.flush();
  }

  /** Notify only observable changes, avoiding duplicate renderer configuration traffic. */
  private update(next: CinematicPreferenceState): void {
    if (next.ready === this.state.ready && next.idleEnabled === this.state.idleEnabled && next.preferenceError === this.state.preferenceError) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Coalesce rapid changes behind the in-flight write without replaying any device command. */
  private async flush(): Promise<void> {
    this.writing = true;
    await this.load();
    try {
      while (this.pending !== null) {
        const idleEnabled = this.pending;
        this.pending = null;
        try {
          await this.storage.setItem(CINEMATIC_HOST_PREFERENCE_KEY, JSON.stringify({ version: 1, idleEnabled }));
          if (this.pending === null) this.update({ ...this.state, preferenceError: false });
        } catch { this.update({ ...this.state, preferenceError: true }); }
      }
    } finally { this.writing = false; }
  }
}

export const cinematicPreferencePersistence = new CinematicPreferencePersistence();
