/** Local delivery progress only; no status represents physical confirmation. */
export type CommandProgressStatus =
  | "pending"
  | "sending"
  | "queued"
  | "retrying"
  | "submitted"
  | "failed"
  | "rejected"
  | "expired"
  | "timed_out"
  | "cancelled";

/** Fixed reasons keep transport errors and sensitive payloads out of history. */
export type CommandProgressReason =
  | "permission_denied"
  | "invalid_command"
  | "invalid_response"
  | "transport_rejected"
  | "retry_exhausted"
  | "transport_timeout"
  | "session_changed";

/** The allowlisted, ephemeral metadata available to progress consumers. */
export type CommandProgress = Readonly<{
  commandId: string;
  deviceId: string;
  createdAt: number;
  expiresAt: number;
  status: CommandProgressStatus;
  attempts: number;
  updatedAt: number;
  reason?: CommandProgressReason;
}>;

/** Only the original handle can update its entry, including after ID reuse. */
export type CommandProgressHandle = Readonly<{
  commandId: string;
  token: symbol;
}>;

export type CommandProgressEvent =
  | Readonly<{ type: "updated"; command: CommandProgress }>
  | Readonly<{ type: "reset" }>;

type CommandMetadata = Pick<
  CommandProgress,
  "commandId" | "deviceId" | "createdAt" | "expiresAt"
>;
type ProgressListener = (event: CommandProgressEvent) => void;
type ProgressEntry = {
  handle: CommandProgressHandle;
  command: CommandProgress;
};

const TRANSITIONS: Readonly<
  Record<CommandProgressStatus, readonly CommandProgressStatus[]>
> = {
  pending: ["sending", "rejected", "expired", "cancelled"],
  sending: ["submitted", "queued", "failed", "rejected", "expired", "timed_out", "cancelled"],
  queued: ["retrying", "rejected", "expired", "cancelled"],
  retrying: ["submitted", "queued", "failed", "rejected", "expired", "timed_out", "cancelled"],
  submitted: [],
  failed: [],
  rejected: [],
  expired: [],
  timed_out: [],
  cancelled: [],
};

const REASONS: ReadonlySet<CommandProgressReason> = new Set([
  "permission_denied",
  "invalid_command",
  "invalid_response",
  "transport_rejected",
  "retry_exhausted",
  "transport_timeout",
  "session_changed",
]);

/** Admission failures happen before a caller may dispatch another command. */
export class CommandProgressError extends Error {
  /** Expose a fixed reason instead of echoing user-controlled identifiers. */
  constructor(public readonly reason: "duplicate_command" | "tracking_capacity") {
    super(`Command progress unavailable: ${reason}`);
    this.name = "CommandProgressError";
  }
}

/** Validate bounded identifiers without silently changing command identity. */
function isValidIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 128 && value.trim() === value;
}

/** Accept only finite, ordered timestamps within the command lifetime limit. */
function isValidMetadata(value: CommandMetadata): boolean {
  return Boolean(value) && isValidIdentifier(value.commandId) &&
    isValidIdentifier(value.deviceId) && Number.isFinite(value.createdAt) &&
    Number.isFinite(value.expiresAt) && value.createdAt >= 0 &&
    value.expiresAt > value.createdAt && value.expiresAt <= value.createdAt + 60_000;
}

/**
 * Tracks local delivery without retaining commands or persisting account data.
 * Terminal results describe this client only: they cannot undo delivery or
 * prove that a device reached its requested state.
 */
export class CommandProgressStore {
  private readonly entries = new Map<string, ProgressEntry>();
  private readonly listeners = new Set<ProgressListener>();
  private generation = 0;

  /** Keep history bounded; active work is never evicted to admit more work. */
  constructor(private readonly capacity = 200) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new TypeError("Invalid command progress capacity.");
    }
  }

  /** Admit a fresh command and synchronously publish its pending metadata. */
  start(metadata: CommandMetadata): CommandProgressHandle {
    if (!isValidMetadata(metadata)) {
      throw new TypeError("Invalid command progress metadata.");
    }
    if (this.entries.has(metadata.commandId)) {
      throw new CommandProgressError("duplicate_command");
    }
    this.makeRoom();
    const handle = Object.freeze({
      commandId: metadata.commandId,
      token: Symbol(),
    });
    // Explicit selection prevents structurally compatible objects from copying
    // payloads, nonces, or other caller-owned properties into history.
    const command: CommandProgress = {
      commandId: metadata.commandId,
      deviceId: metadata.deviceId,
      createdAt: metadata.createdAt,
      expiresAt: metadata.expiresAt,
      status: "pending",
      attempts: 0,
      updatedAt: Date.now(),
    };
    this.entries.set(command.commandId, { handle, command });
    this.emit({ type: "updated", command });
    return handle;
  }

  /** Apply one legal transition, rejecting stale handles and invalid counters. */
  transition(
    handle: CommandProgressHandle,
    status: CommandProgressStatus,
    attempts?: number,
    reason?: CommandProgressReason,
  ): boolean {
    const entry = this.entries.get(handle?.commandId);
    if (!entry || entry.handle !== handle) return false;
    const nextAttempts = attempts === undefined ? entry.command.attempts : attempts;
    if (!TRANSITIONS[entry.command.status].includes(status) ||
      !Number.isInteger(nextAttempts) || nextAttempts < entry.command.attempts ||
      nextAttempts > 4 || (reason !== undefined && !REASONS.has(reason))) {
      return false;
    }
    const { reason: _previousReason, ...previous } = entry.command;
    entry.command = {
      ...previous,
      status,
      attempts: nextAttempts,
      updatedAt: Math.max(previous.updatedAt, Date.now()),
      ...(reason === undefined ? {} : { reason }),
    };
    this.emit({ type: "updated", command: entry.command });
    return true;
  }

  /** Return an isolated snapshot, never a mutable reference into the store. */
  get(commandId: string): CommandProgress | undefined {
    const entry = this.entries.get(commandId);
    return entry ? { ...entry.command } : undefined;
  }

  /** Return current-session snapshots in admission order. */
  getAll(): CommandProgress[] {
    return Array.from(this.entries.values(), ({ command }) => ({ ...command }));
  }

  /** Subscribe to future events; callers can explicitly request getAll first. */
  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Forget all prior-session metadata and invalidate every outstanding handle. */
  reset(): void {
    this.generation += 1;
    this.entries.clear();
    this.emit({ type: "reset" });
  }

  /** Evict the oldest completed result, never queued or in-flight work. */
  private makeRoom(): void {
    if (this.entries.size < this.capacity) return;
    let oldest: ProgressEntry | undefined;
    for (const entry of this.entries.values()) {
      if (TRANSITIONS[entry.command.status].length > 0) continue;
      if (!oldest || entry.command.updatedAt < oldest.command.updatedAt) {
        oldest = entry;
      }
    }
    if (!oldest) throw new CommandProgressError("tracking_capacity");
    this.entries.delete(oldest.command.commandId);
  }

  /** Isolate subscriber mutation/failure and stop old events across a reset. */
  private emit(event: CommandProgressEvent): void {
    const generation = this.generation;
    for (const listener of [...this.listeners]) {
      if (generation !== this.generation) break;
      // A reentrant transition must not deliver the older status after its
      // replacement; unrelated command updates can continue independently.
      if (event.type === "updated" &&
        this.entries.get(event.command.commandId)?.command !== event.command) break;
      if (!this.listeners.has(listener)) continue;
      const snapshot: CommandProgressEvent = event.type === "updated"
        ? { type: "updated", command: { ...event.command } }
        : { type: "reset" };
      try {
        listener(snapshot);
      } catch {
        // Never expose thrown messages: a consumer may include command data.
        console.warn("Command progress subscriber failed.");
      }
    }
  }
}
