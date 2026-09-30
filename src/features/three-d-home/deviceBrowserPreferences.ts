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

  /** Inject storage for deterministic reload, corruption, and write-race tests. */
  constructor(private readonly storage: Storage = AsyncStorage) {}

  /** Return a stable reference for React's external-store subscription. */
  getSnapshot = (): FavoriteSnapshot => this.snapshot;

  /** Subscribe without performing storage reads until an authorized surface requests them. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Hydrate once; a failed cache becomes an empty, usable session with a visible error status. */
  load = (): Promise<void> => {
    if (!this.loading)
      this.loading = this.storage
        .getItem(MODEL_FAVORITES_STORAGE_KEY)
        .then((raw) => {
          this.publish({ ids: parseDeviceFavorites(raw), status: "saved" });
        })
        .catch(() => this.publish({ ids: [], status: "error" }));
    return this.loading;
  };

  /** Serialize accepted local edits so a slower write can never restore an older favorite list. */
  toggle(id: string): void {
    if (this.snapshot.status === "loading" || !canonicalIds.has(id)) return;
    const ids = this.snapshot.ids.includes(id)
      ? this.snapshot.ids.filter((candidate) => candidate !== id)
      : [...this.snapshot.ids, id];
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
        if (revision === this.revision) this.publish({ ids, status: "error" });
      }
    });
  }

  /** Notify only subscribers to this small preference record. */
  private publish(snapshot: FavoriteSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

export const modelDeviceFavorites = new ModelDeviceFavorites();
