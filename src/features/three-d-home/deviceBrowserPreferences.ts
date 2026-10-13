import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEVICES } from "../../../packages/home-scene/src/data";

export const MODEL_FAVORITES_STORAGE_KEY =
  "vantahome-device-library:v1:offline-model";
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};
export type FavoriteSnapshot = {
  ids: readonly string[];
  status: "loading" | "saved" | "error";
  error?: "load" | "save";
};
const canonicalIds = new Set(DEVICES.map((device) => device.id));

/** Discard malformed caches and obsolete IDs instead of exposing arbitrary stored device metadata. */
export function parseDeviceFavorites(raw: string | null): string[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== 1 ||
    !("ids" in data) ||
    !Array.isArray(data.ids) ||
    data.ids.some((id) => typeof id !== "string")
  ) {
    throw new Error("Invalid device favorites");
  }
  return [
    ...new Set(
      data.ids.filter(
        (id): id is string => typeof id === "string" && canonicalIds.has(id),
      ),
    ),
  ];
}

/** Store only the explicit offline model's favorite IDs, never account or device observations. */
export class ModelDeviceFavorites {
  private snapshot: FavoriteSnapshot = { ids: [], status: "loading" };
  private loading: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private revision = 0;
  private hydrated = false;

  /** Inject storage for deterministic reload, corruption, and write-race tests. */
  constructor(private readonly storage: Storage = AsyncStorage) {}

  /** Return a stable reference for React's external-store subscription. */
  getSnapshot = (): FavoriteSnapshot => this.snapshot;

  /** Subscribe without performing storage reads until an authorized surface requests them. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Preserve unread bytes and block edits until a successful, explicitly retryable baseline read. */
  load = (): Promise<void> => {
    if (this.hydrated) return Promise.resolve();
    if (!this.loading) {
      this.publish({ ...this.snapshot, status: "loading", error: undefined });
      this.loading = this.storage
        .getItem(MODEL_FAVORITES_STORAGE_KEY)
        .then((raw) => {
          const ids = parseDeviceFavorites(raw);
          this.hydrated = true;
          this.publish({ ids, status: "saved" });
        })
        .catch(() => this.publish({ ids: [], status: "error", error: "load" }))
        .finally(() => { this.loading = null; });
    }
    return this.loading;
  };

  /** Retry a failed load or save the current validated baseline without discarding local edits. */
  retry = (): Promise<void> => this.hydrated ? this.save(this.snapshot.ids) : this.load();

  /** Serialize accepted local edits so a slower write can never restore an older favorite list. */
  toggle(id: string): void {
    if (!this.hydrated || !canonicalIds.has(id)) return;
    const ids = this.snapshot.ids.includes(id)
      ? this.snapshot.ids.filter((candidate) => candidate !== id)
      : [...this.snapshot.ids, id];
    void this.save(ids);
  }

  /** Serialize retries and edits together so only the latest write may update its status. */
  private save(ids: readonly string[]): Promise<void> {
    const revision = ++this.revision;
    this.publish({ ids, status: "saved" });
    this.writes = this.writes.then(async () => {
      try {
        await this.storage.setItem(
          MODEL_FAVORITES_STORAGE_KEY,
          JSON.stringify({ version: 1, ids }),
        );
        if (revision === this.revision) this.publish({ ids, status: "saved" });
      } catch {
        if (revision === this.revision) this.publish({ ids, status: "error", error: "save" });
      }
    });
    return this.writes;
  }

  /** Notify only subscribers to this small preference record. */
  private publish(snapshot: FavoriteSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

export const modelDeviceFavorites = new ModelDeviceFavorites();
