import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LIGHT_JOURNAL_CAPACITY, planLightAdmission, type LightAdmission } from "../lightAdmission";
import {
  isActiveLightCommand, parseLightBinding, sameLightBinding,
  type LightAuthorizer, type LightBinding, type LightCommandRecord, type LightPrincipal, type PilotLight,
} from "../lightContract";
import { interruptLightCommand } from "../lightLifecycle";
import { decodeLightRecord, MAX_RECORD_BYTES } from "./recordCodec";
import { BridgeStorageError, preparePrivateDirectory, verifyPrivateFile } from "./privateStorage";

export { BridgeStorageError } from "./privateStorage";

const ALLOWED_TRANSITIONS: Partial<Record<LightCommandRecord["status"], readonly LightCommandRecord["status"][]>> = {
  reserved: ["reserved", "dispatching", "expired", "refused", "unavailable"],
  dispatching: ["dispatching", "service_completed", "state_observed", "outcome_unknown"],
  service_completed: ["service_completed", "state_observed", "outcome_unknown"],
};

/** Trusted process configuration; the hook is solely for deterministic commit-failure tests. */
export type LightJournalOptions = {
  directory: string;
  binding: LightBinding;
  beforeCommit?: () => void;
};

/**
 * Single-worker SQLite journal. A separate lifetime EXCLUSIVE lock is released
 * by the OS on process death, preventing a second worker from recovering live work.
 * The command database uses FULL-synchronous WAL transactions before any send.
 */
export class SqliteLightJournal {
  readonly binding: LightBinding;
  private db: DatabaseSync | null = null;
  private ownership: DatabaseSync | null = null;
  private failed = false;
  private readonly beforeCommit?: () => void;

  /** Open private storage, acquire process ownership, validate it, and recover atomically. */
  constructor(options: LightJournalOptions) {
    const binding = parseLightBinding(options.binding);
    if (!binding) throw new BridgeStorageError("scope_mismatch");
    this.binding = binding;
    this.beforeCommit = options.beforeCommit;
    try {
      const directory = preparePrivateDirectory(options.directory);
      const path = join(directory, "commands.sqlite");
      const lockPath = join(directory, "worker-lock.sqlite");
      for (const file of [lockPath, path]) {
        verifyPrivateFile(file, true);
        for (const suffix of ["-wal", "-shm", "-journal"]) verifyPrivateFile(file + suffix);
      }
      this.ownership = new DatabaseSync(lockPath, { allowExtension: false });
      try { this.ownership.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE"); }
      catch { throw new BridgeStorageError("runtime_busy"); }
      this.db = new DatabaseSync(path, { allowExtension: false });
      this.db.exec("PRAGMA busy_timeout = 1000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF");
      this.initialize();
      this.updateAll(interruptLightCommand);
    } catch (error) {
      this.close();
      throw error instanceof BridgeStorageError ? error : new BridgeStorageError("storage_unavailable");
    }
  }

  /** Preserve old rows on unknown schemas or scope changes; never reset on an error. */
  private initialize(): void {
    const db = this.database();
    const check = db.prepare("PRAGMA quick_check").get();
    if (check?.quick_check !== "ok") throw new BridgeStorageError("invalid_journal");
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 0 && version !== 1) throw new BridgeStorageError("invalid_journal");
    if (version === 0) {
      if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().length !== 0) {
        throw new BridgeStorageError("invalid_journal");
      }
      this.transaction(() => {
        db.exec(`CREATE TABLE bridge_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          CREATE TABLE light_commands (
            command_id TEXT PRIMARY KEY,
            nonce TEXT NOT NULL UNIQUE,
            idempotency_key TEXT NOT NULL UNIQUE,
            record TEXT NOT NULL CHECK(length(record) <= ${MAX_RECORD_BYTES})
          ) STRICT;
          PRAGMA user_version = 1;`);
        db.prepare("INSERT INTO bridge_metadata(key, value) VALUES ('binding', ?)").run(JSON.stringify(this.binding));
      });
    }
    const metadata = db.prepare("SELECT value FROM bridge_metadata WHERE key = 'binding'").get()?.value;
    let saved: LightBinding | null = null;
    try { saved = typeof metadata === "string" ? parseLightBinding(JSON.parse(metadata)) : null; } catch { /* Fail closed below. */ }
    if (!saved || !sameLightBinding(saved, this.binding)) throw new BridgeStorageError("scope_mismatch");
    this.read();
  }

  /** A persistence fault permanently stops this instance until an explicit restart. */
  private database(): DatabaseSync {
    if (!this.db || this.failed) throw new BridgeStorageError("storage_unavailable");
    return this.db;
  }

  /** Commit every transition synchronously; callbacks must never perform transport I/O. */
  private transaction<T>(operation: () => T): T {
    const db = this.database();
    try {
      db.exec("BEGIN IMMEDIATE");
      const result = operation();
      this.beforeCommit?.();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* The instance remains unusable even if rollback fails. */ }
      this.failed = true;
      throw error instanceof BridgeStorageError ? error : new BridgeStorageError("storage_unavailable");
    }
  }

  /** Return only immutable validated rows, including retained replay evidence. */
  read(): readonly LightCommandRecord[] {
    try {
      const rows = this.database().prepare("SELECT command_id, nonce, idempotency_key, record FROM light_commands ORDER BY rowid LIMIT ?")
        .all(LIGHT_JOURNAL_CAPACITY + 1);
      if (rows.length > LIGHT_JOURNAL_CAPACITY) throw new BridgeStorageError("invalid_journal");
      const records: LightCommandRecord[] = [];
      const activeDevices = new Set<string>();
      const requestIds = new Set<string>();
      for (const row of rows) {
        const record = typeof row.record === "string" ? decodeLightRecord(row.record, this.binding) : null;
        if (!record || record.command.commandId !== row.command_id || record.command.nonce !== row.nonce ||
            record.command.idempotencyKey !== row.idempotency_key) throw new BridgeStorageError("invalid_journal");
        if (isActiveLightCommand(record)) {
          if (activeDevices.has(record.binding.deviceId)) throw new BridgeStorageError("invalid_journal");
          activeDevices.add(record.binding.deviceId);
        }
        if (record.sessionId !== null) {
          const key = `${record.sessionId}/${record.requestId}`;
          if (requestIds.has(key)) throw new BridgeStorageError("invalid_journal");
          requestIds.add(key);
        }
        records.push(record);
      }
      return Object.freeze(records);
    } catch (error) {
      this.failed = true;
      throw error instanceof BridgeStorageError ? error : new BridgeStorageError("invalid_journal");
    }
  }

  /** Reserve replay identity and per-light serialization in one durable transaction. */
  reserve(input: unknown, principal: LightPrincipal, light: PilotLight, authorize: LightAuthorizer, now: number): LightAdmission {
    return this.transaction(() => {
      if (!sameLightBinding(light.binding, this.binding)) return { kind: "refused", reason: "invalid_command" };
      const admission = planLightAdmission(this.read(), input, principal, light, authorize, now);
      if (admission.kind === "reserved") {
        const record = admission.record;
        this.database().prepare("INSERT INTO light_commands(command_id, nonce, idempotency_key, record) VALUES (?, ?, ?, ?)")
          .run(record.command.commandId, record.command.nonce, record.command.idempotencyKey, JSON.stringify(record));
      }
      return admission;
    });
  }

  /** Validate lifecycle output and ensure no transition can rewrite identity or intent. */
  private save(previous: LightCommandRecord, next: LightCommandRecord): LightCommandRecord {
    const parsed = decodeLightRecord(JSON.stringify(next), this.binding);
    if (!parsed || JSON.stringify(previous.command) !== JSON.stringify(parsed.command) ||
        JSON.stringify(previous.principal) !== JSON.stringify(parsed.principal) ||
        !(ALLOWED_TRANSITIONS[previous.status] ?? [previous.status]).includes(parsed.status) ||
        (previous.dispatchedAt !== null && (previous.sessionId !== parsed.sessionId ||
          previous.entityId !== parsed.entityId || previous.requestId !== parsed.requestId ||
          previous.dispatchedAt !== parsed.dispatchedAt || previous.lastRevision > parsed.lastRevision ||
          previous.lastObservedAt > parsed.lastObservedAt)) ||
        (!isActiveLightCommand(previous) && JSON.stringify(previous) !== JSON.stringify(parsed))) {
      throw new BridgeStorageError("invalid_journal");
    }
    const json = JSON.stringify(parsed);
    if (JSON.stringify(previous) !== json) {
      this.database().prepare("UPDATE light_commands SET record = ? WHERE command_id = ?").run(json, parsed.command.commandId);
    }
    return parsed;
  }

  /** Plan and persist a single command transition while holding the write transaction. */
  update(commandId: string, transition: (record: LightCommandRecord, journal: readonly LightCommandRecord[]) => LightCommandRecord): LightCommandRecord | null {
    return this.transaction(() => {
      const journal = this.read();
      const previous = journal.find((record) => record.command.commandId === commandId);
      return previous ? this.save(previous, transition(previous, journal)) : null;
    });
  }

  /** Persist disconnect, expiry, revocation, or restart for all retained active work. */
  updateAll(transition: (record: LightCommandRecord) => LightCommandRecord): readonly LightCommandRecord[] {
    return this.transaction(() => Object.freeze(this.read().map((record) => this.save(record, transition(record)))));
  }

  /** Release ownership only after the journal is closed; process death also releases it. */
  close(): void {
    try { this.db?.close(); } finally {
      this.db = null;
      try { this.ownership?.close(); } finally { this.ownership = null; }
    }
  }
}
