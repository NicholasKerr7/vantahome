import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommandProgressReason, CommandProgressStatus } from '../../services/commandProgress';

export const INBOX_LIMIT = 200;
export type InboxEvent = Readonly<{
  id: string;
  deviceId: string;
  source: 'delivery' | 'simulation';
  status: CommandProgressStatus | 'updated';
  createdAt: number;
  updatedAt: number;
  attempts: number;
  simulated: boolean;
  power?: boolean;
  level?: number;
  reason?: CommandProgressReason;
  readRevision?: string;
  dismissedRevision?: string;
}>;
export type InboxSnapshot = Readonly<{
  events: readonly InboxEvent[];
  ready: boolean;
  storageError: boolean;
}>;
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type RecordState = {
  snapshot: InboxSnapshot;
  loaded: Promise<void>;
  writes: Promise<void>;
  pending: string | null;
  writing: boolean;
  restoreFailed: boolean;
  listeners: Set<(snapshot: InboxSnapshot) => void>;
};
const STATUSES = new Set(['pending', 'sending', 'queued', 'retrying', 'submitted', 'failed', 'rejected', 'expired', 'timed_out', 'cancelled']);
const REASONS = new Set(['permission_denied', 'invalid_command', 'invalid_response', 'transport_rejected', 'retry_exhausted', 'transport_timeout', 'session_changed']);

/** A later delivery phase becomes unread again without resurrecting an unchanged row. */
export function inboxRevision(event: InboxEvent): string {
  return `${event.status}:${event.updatedAt}:${event.attempts}:${event.reason ?? ''}:${event.power ?? ''}:${event.level ?? ''}`;
}

/** Cache metadata is untrusted; discard payloads, names, tokens and unknown fields. */
function parseEvent(value: unknown): InboxEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.length || item.id.length > 512
    || typeof item.deviceId !== 'string' || !item.deviceId.length || item.deviceId.length > 128
    || !['delivery', 'simulation'].includes(String(item.source))
    || typeof item.status !== 'string'
    || (item.source === 'simulation' ? item.status !== 'updated' : !STATUSES.has(item.status))
    || typeof item.simulated !== 'boolean' || (item.source === 'simulation' && !item.simulated)
    || typeof item.createdAt !== 'number' || !Number.isFinite(new Date(item.createdAt).getTime()) || item.createdAt < 0
    || typeof item.updatedAt !== 'number' || !Number.isFinite(new Date(item.updatedAt).getTime()) || item.updatedAt < item.createdAt
    || typeof item.attempts !== 'number' || !Number.isInteger(item.attempts) || item.attempts < 0 || item.attempts > 4
    || (item.reason !== undefined && !REASONS.has(String(item.reason)))) return null;
  return {
    id: item.id, deviceId: item.deviceId, source: item.source as InboxEvent['source'],
    status: item.status as InboxEvent['status'], createdAt: item.createdAt, updatedAt: item.updatedAt,
    attempts: item.attempts, simulated: item.simulated,
    ...(item.source === 'simulation' && typeof item.power === 'boolean' ? { power: item.power } : {}),
    ...(item.source === 'simulation' && typeof item.level === 'number' && Number.isFinite(item.level)
      && item.level >= 0 && item.level <= 100 ? { level: item.level } : {}),
    ...(item.reason === undefined ? {} : { reason: item.reason as CommandProgressReason }),
    ...(typeof item.readRevision === 'string' && item.readRevision.length <= 150 ? { readRevision: item.readRevision } : {}),
    ...(typeof item.dismissedRevision === 'string' && item.dismissedRevision.length <= 150 ? { dismissedRevision: item.dismissedRevision } : {}),
  };
}

/** Versioned, bounded local history; never interpret a corrupted cache as device evidence. */
export function parseInboxCache(raw: string | null): readonly InboxEvent[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('events' in value) || !Array.isArray(value.events)) throw new Error('Invalid activity cache');
  return value.events.slice(-INBOX_LIMIT).flatMap((item: unknown) => {
    const event = parseEvent(item);
    return event ? [event] : [];
  });
}

/** Merge a recovered cache with newer in-memory activity without losing either history or receipts. */
function mergeRestoredEvents(restored: readonly InboxEvent[], current: readonly InboxEvent[]): readonly InboxEvent[] {
  const events = new Map(restored.map((event) => [event.id, event]));
  for (const event of current) {
    const previous = events.get(event.id);
    if (previous && previous.updatedAt > event.updatedAt) continue;
    events.set(event.id, { ...event, readRevision: event.readRevision ?? previous?.readRevision,
      dismissedRevision: event.dismissedRevision ?? previous?.dismissedRevision });
  }
  return [...events.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(-INBOX_LIMIT);
}

/** Serialize per-account journal writes and keep event content outside the home/device cache. */
export class ActivityInboxJournal {
  private readonly records = new Map<string, RecordState>();

  /** Inject storage for deterministic hydration and write-failure tests. */
  constructor(private readonly storage: Storage = AsyncStorage) {}

  /** Subscribers see hydration failures explicitly and never receive another namespace's rows. */
  subscribe(scope: string, listener: (snapshot: InboxSnapshot) => void): () => void {
    const record = this.record(scope);
    record.listeners.add(listener);
    listener(record.snapshot);
    return () => record.listeners.delete(listener);
  }

  /** Merge only scoped admissions supplied by the live provider; no service history import. */
  async upsert(scope: string, incoming: readonly InboxEvent[]): Promise<void> {
    const safe = incoming.flatMap((entry) => { const event = parseEvent(entry); return event ? [event] : []; });
    if (!safe.length) return;
    await this.change(scope, (events) => {
      const retained = new Map(events.map((event) => [event.id, event]));
      for (const incoming of safe) {
        // A slider gesture is one local model update, not dozens of inbox cards.
        const recent = incoming.source === 'simulation' ? [...retained.values()].reverse().find((row) =>
          row.source === 'simulation' && row.deviceId === incoming.deviceId
          && incoming.updatedAt >= row.updatedAt && incoming.updatedAt - row.updatedAt < 1500) : undefined;
        const event = recent ? { ...incoming, id: recent.id, createdAt: recent.createdAt } : incoming;
        const previous = retained.get(event.id);
        if (previous && previous.updatedAt > event.updatedAt) continue;
        retained.set(event.id, { ...event, readRevision: previous?.readRevision, dismissedRevision: previous?.dismissedRevision });
      }
      return [...retained.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(-INBOX_LIMIT);
    });
  }

  /** Receipt revisions prevent a click from hiding a newer warning arriving at the same time. */
  async acknowledge(scope: string, revisions: ReadonlyMap<string, string>, dismiss: boolean): Promise<void> {
    await this.change(scope, (events) => events.map((event) => {
      const revision = revisions.get(event.id);
      if (!revision || revision !== inboxRevision(event)) return event;
      return { ...event, readRevision: revision, ...(dismiss ? { dismissedRevision: revision } : {}) };
    }));
  }

  /** Await hydration, then enqueue disk writes in mutation order without blocking local feedback. */
  private async change(scope: string, reduce: (events: readonly InboxEvent[]) => readonly InboxEvent[]): Promise<void> {
    const record = this.record(scope);
    await record.loaded;
    const events = reduce(record.snapshot.events);
    if (JSON.stringify(events) === JSON.stringify(record.snapshot.events)) {
      // An unchanged live admission may still retry a previously failed cache restore.
      if (record.restoreFailed && !record.writing) record.writes = this.flush(scope, record);
      await record.writes;
      return;
    }
    record.snapshot = { ...record.snapshot, events };
    this.notify(record);
    record.pending = JSON.stringify({ version: 1, events });
    if (!record.writing) record.writes = this.flush(scope, record);
    await record.writes;
  }

  /** Coalesce rapid slider updates behind an in-flight write instead of growing an unbounded queue. */
  private async flush(scope: string, record: RecordState): Promise<void> {
    record.writing = true;
    try {
      if (record.restoreFailed) {
        // Unknown disk contents must be restored before any replacement write.
        // New activity remains in memory if reading still fails; a later change retries.
        try {
          const restored = parseInboxCache(await this.storage.getItem(this.key(scope)));
          const events = mergeRestoredEvents(restored, record.snapshot.events);
          record.restoreFailed = false;
          record.snapshot = { events, ready: true, storageError: false };
          if (record.pending !== null) record.pending = JSON.stringify({ version: 1, events });
        } catch {
          record.snapshot = { ...record.snapshot, storageError: true };
          this.notify(record);
          return;
        }
        this.notify(record);
      }
      while (record.pending !== null) {
        const serialized = record.pending;
        record.pending = null;
        try {
          await this.storage.setItem(this.key(scope), serialized);
          record.snapshot = { ...record.snapshot, storageError: false };
        } catch { record.snapshot = { ...record.snapshot, storageError: true }; }
        this.notify(record);
      }
    } finally { record.writing = false; }
  }

  /** Lazily hydrate one namespace without exposing a partial previous identity snapshot. */
  private record(scope: string): RecordState {
    const existing = this.records.get(scope);
    if (existing) return existing;
    const record: RecordState = { snapshot: { events: [], ready: false, storageError: false },
      loaded: Promise.resolve(), writes: Promise.resolve(), pending: null, writing: false, restoreFailed: false, listeners: new Set() };
    this.records.set(scope, record);
    record.loaded = this.storage.getItem(this.key(scope)).then((raw: string | null) => {
      record.snapshot = { events: parseInboxCache(raw), ready: true, storageError: false };
    }).catch(() => { record.restoreFailed = true; record.snapshot = { events: [], ready: true, storageError: true }; })
      .then(() => this.notify(record));
    return record;
  }

  /** Namespaces contain account IDs only; journal rows never contain credentials or command payloads. */
  private key(scope: string): string { return `vantahome-activity:v1:${scope}`; }

  /** Publish immutable snapshots so React can hide stale scopes before effects finish. */
  private notify(record: RecordState): void {
    for (const listener of record.listeners) listener(record.snapshot);
  }
}

export const activityInboxJournal = new ActivityInboxJournal();
