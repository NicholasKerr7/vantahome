import type { Device } from "../store/useHomeStore";
import { logDeviceAuditEvent } from "./cloudRegistry";
import {
  parseDeviceStatePatch,
  parseTransportMessage,
  type DeviceStatePatch,
} from "./transportSchemas";
import { isAllowedDirectWebSocketUrl, runtimePolicy } from "../config/runtimeMode";
import { authorizeLocalDeviceCommand } from "../security/localCommandAuthorization";
import { confirmSensitiveAction } from "../security/biometricConfirmation";
import {
  CommandProgressStore,
  type CommandProgressEvent,
  type CommandProgressHandle,
} from "./commandProgress";
import {
  CommandAttemptRunner,
  CommandDeliveryError,
  type CommandAttemptResult,
} from "./commandTransport";

type DeviceCommandOperation =
  | { op: "toggle"; deviceId: string; on?: boolean }
  | { op: "set-properties"; deviceId: string; changes: DeviceStatePatch }
  | { op: "set-temp"; deviceId: string; value: number; mode?: Device["mode"] }
  | { op: "set-brightness"; deviceId: string; value: number }
  | { op: "set-volume"; deviceId: string; value: number }
  | { op: "set-mode"; deviceId: string; mode: Device["mode"] }
  | { op: "set-channel"; deviceId: string; value: number }
  | { op: "set-muted"; deviceId: string; value: boolean }
  | { op: "launch-app"; deviceId: string; app: string }
  | {
      op: "media";
      deviceId: string;
      action:
        | "play"
        | "play-pause"
        | "next"
        | "previous"
        | "rewind"
        | "fast-forward";
    }
  | {
      op: "nav";
      deviceId: string;
      action: "up" | "down" | "left" | "right" | "select" | "home";
    };

export type CommandSecurity = {
  commandId: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  idempotencyKey: string;
};

export type DeviceCommand = DeviceCommandOperation & Partial<CommandSecurity>;
export type SecuredDeviceCommand = DeviceCommandOperation & CommandSecurity;

export type DeviceStateEvent = {
  deviceId: string;
  patch: DeviceStatePatch;
  ts: number;
};

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

type ConnectionEvent = {
  status: ConnectionStatus;
  ts: number;
  url?: string;
  error?: string;
};

type RetryStatus = {
  pending: number;
  nextAttemptAt?: number;
};

type Listener = (evt: DeviceStateEvent) => void;
type ConnectionListener = (evt: ConnectionEvent) => void;
type RetryListener = (status: RetryStatus) => void;

type ConnectOptions = {
  protocols?: string | string[];
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
};

type ResolvedConnectOptions = {
  protocols?: string | string[];
  autoReconnect: boolean;
  reconnectDelayMs: number;
  maxReconnectDelayMs: number;
};

type CommandOptions = {
  optimistic?: boolean;
  ttlMs?: number;
};

type CommandTransport = (
  cmd: SecuredDeviceCommand,
  patch: DeviceStatePatch | null,
) => Promise<void> | void;

type RetryEntry = {
  cmd: SecuredDeviceCommand;
  patch: DeviceStatePatch | null;
  progress: CommandProgressHandle;
  attempts: number;
  nextAttemptAt: number;
};

type RetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

/**
 * Session-scoped command delivery and observation subscriptions. Production
 * uses the authenticated API; mock/direct transports remain development-only.
 * Local submission status never substitutes for authoritative device state.
 */
class DeviceClient {
  private sessionGeneration = 0;
  private readonly commandProgress = new CommandProgressStore();
  private readonly commandAttempts = new CommandAttemptRunner();
  private listeners = new Set<Listener>();
  private connectionListeners = new Set<ConnectionListener>();
  private retryListeners = new Set<RetryListener>();
  private commandListeners: Set<(cmd: SecuredDeviceCommand) => void> | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private retryQueue: RetryEntry[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryFlushGeneration: number | null = null;
  private retryOptions: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 800,
    maxDelayMs: 8000,
  };
  private connection: {
    url: string;
    options: ResolvedConnectOptions;
  } | null = null;
  private commandTransport: CommandTransport | null = null;
  private connectionStatus: ConnectionStatus = "disconnected";

  subscribeState(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Subscribe safely, including the immediate current-connection snapshot. */
  subscribeConnection(fn: ConnectionListener) {
    this.connectionListeners.add(fn);
    try {
      fn({
        status: this.connectionStatus,
        ts: Date.now(),
        url: this.connection?.url,
      });
    } catch {
      console.warn("Connection listener failed.");
    }
    return () => this.connectionListeners.delete(fn);
  }

  /** Subscribe safely, including the immediate current retry snapshot. */
  subscribeRetry(fn: RetryListener) {
    this.retryListeners.add(fn);
    try {
      fn(this.getRetryStatus());
    } catch {
      console.warn("Retry status listener failed.");
    }
    return () => this.retryListeners.delete(fn);
  }

  subscribeCommand(fn: (cmd: SecuredDeviceCommand) => void) {
    if (!this.commandListeners) {
      this.commandListeners = new Set();
    }
    this.commandListeners.add(fn);
    return () => this.commandListeners?.delete(fn);
  }

  /** Observe metadata-only progress; reset events require discarding cached rows. */
  subscribeCommandProgress(fn: (event: CommandProgressEvent) => void) {
    return this.commandProgress.subscribe(fn);
  }

  /** Read a defensive snapshot for a command in the current session only. */
  getCommandProgress(commandId: string) {
    return this.commandProgress.get(commandId);
  }

  /** Read bounded local history, not a durable queue or a physical-device audit. */
  getCommandHistory() {
    return this.commandProgress.getAll();
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  getRetryStatus(): RetryStatus {
    if (this.retryQueue.length === 0) {
      return { pending: 0 };
    }
    const nextAttemptAt = Math.min(
      ...this.retryQueue.map((entry) => entry.nextAttemptAt),
    );
    return { pending: this.retryQueue.length, nextAttemptAt };
  }

  /** Select a development connection without reopening a callback's replacement. */
  connect(url: string, options: ConnectOptions = {}) {
    if (!isAllowedDirectWebSocketUrl(url)) {
      throw new CommandAuthorizationError("unpaired_transport_disabled");
    }
    const merged: ResolvedConnectOptions = {
      protocols: options.protocols,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelayMs: options.reconnectDelayMs ?? 800,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 8000,
    };

    const connection = { url, options: merged };
    this.connection = connection;
    this.emitConnection("connecting");
    if (this.connection === connection) this.openSocket();

    return () => {
      if (this.connection === connection) this.disconnect();
    };
  }

  disconnect() {
    this.connection = null;
    this.clearReconnect();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close();
    }
    this.emitConnection("disconnected");
  }

  /** Invalidates in-flight work as well as queued work at an identity boundary. */
  resetSession() {
    this.sessionGeneration += 1;
    this.commandAttempts.cancelAll();
    this.commandTransport = null;
    this.retryQueue = [];
    this.retryFlushGeneration = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.commandProgress.reset();
    this.disconnect();
    this.emitRetryStatus();
  }

  setCommandTransport(fn: CommandTransport | null) {
    this.commandTransport = fn;
    if (fn) {
      this.scheduleRetry();
    }
    return () => {
      if (this.commandTransport === fn) {
        this.commandTransport = null;
      }
    };
  }

  /** Authorize intent and report delivery separately from physical observations. */
  async sendCommand(cmd: DeviceCommand, options: CommandOptions = {}) {
    const generation = this.sessionGeneration;
    const intent = this.snapshotCommand(cmd);
    const authorization = authorizeLocalDeviceCommand(intent);
    if (!authorization.allowed) {
      throw new CommandAuthorizationError(authorization.reason);
    }
    await confirmSensitiveAction(authorization.permission);
    if (generation !== this.sessionGeneration) {
      throw new CommandAuthorizationError("session_changed");
    }
    const securedCommand = this.secureCommand(intent, options.ttlMs);
    const progress = this.commandProgress.start({
      commandId: securedCommand.commandId,
      deviceId: securedCommand.deviceId,
      createdAt: securedCommand.createdAt,
      expiresAt: securedCommand.expiresAt,
    });
    this.assertCommandMayContinue(securedCommand, generation, progress);
    const optimistic =
      runtimePolicy.allowMockTelemetry && (options.optimistic ?? true);
    const patch = this.patchFromCommand(securedCommand);
    // Apply a local patch immediately so the UI feels snappy.
    if (optimistic && patch) {
      const evt: DeviceStateEvent = {
        deviceId: securedCommand.deviceId,
        patch,
        ts: Date.now(),
      };
      this.emit(evt);
    }

    this.assertCommandMayContinue(securedCommand, generation, progress);
    this.commandProgress.transition(progress, "sending", 1);
    const result = await this.attemptSend(securedCommand, patch, {
      allowMock:
        runtimePolicy.allowMockTelemetry && this.commandTransport === null,
      optimistic,
    }, generation);
    if (generation !== this.sessionGeneration) {
      throw new CommandAuthorizationError("session_changed");
    }
    if (result.status === "retryable") {
      this.enqueueRetry({ cmd: securedCommand, patch, progress, attempts: 0,
        nextAttemptAt: Date.now() + this.retryOptions.baseDelayMs });
    } else {
      this.recordAttempt(progress, result);
      this.throwDeliveryFailure(result);
    }

    // After acceptance, a slow subscriber cannot retroactively expire delivery.
    // Identity/permission still gate callbacks and audit; queued work keeps TTL.
    const checkExpiry = result.status !== "submitted";
    this.assertCommandMayContinue(securedCommand, generation, progress, checkExpiry);
    for (const listener of [...(this.commandListeners ?? [])]) {
      this.assertCommandMayContinue(securedCommand, generation, progress, checkExpiry);
      try {
        listener(JSON.parse(JSON.stringify(securedCommand)) as SecuredDeviceCommand);
      } catch { console.warn("Command listener failed."); }
    }
    this.assertCommandMayContinue(securedCommand, generation, progress, checkExpiry);
    void logDeviceAuditEvent({
      deviceId: securedCommand.deviceId,
      action: securedCommand.op,
      payload: securedCommand as unknown as Record<string, unknown>,
    }).catch(() => {});
    return { commandId: securedCommand.commandId, queued: result.status === "retryable" };
  }

  pushState(deviceId: string, patch: unknown) {
    const parsedPatch = parseDeviceStatePatch(patch);
    if (!parsedPatch) return false;
    const evt: DeviceStateEvent = { deviceId, patch: parsedPatch, ts: Date.now() };
    this.emit(evt);
    this.logStateChange(deviceId, parsedPatch, "local");
    return true;
  }

  /** Isolate UI subscribers so a rendering error cannot strand command work. */
  private emit(evt: DeviceStateEvent) {
    const generation = this.sessionGeneration;
    for (const listener of [...this.listeners]) {
      if (generation !== this.sessionGeneration) return;
      try {
        listener({ ...evt, patch: JSON.parse(JSON.stringify(evt.patch)) as DeviceStatePatch });
      } catch {
        console.warn("Device state listener failed.");
      }
    }
  }

  /** Listener failures must not interrupt session reset or reconnect scheduling. */
  private emitConnection(status: ConnectionStatus, error?: string) {
    const generation = this.sessionGeneration;
    this.connectionStatus = status;
    const event: ConnectionEvent = {
      status,
      ts: Date.now(),
      url: this.connection?.url,
      error,
    };
    for (const listener of [...this.connectionListeners]) {
      if (generation !== this.sessionGeneration) return;
      try { listener({ ...event }); } catch { console.warn("Connection listener failed."); }
    }
    if (generation !== this.sessionGeneration) return;
    if (status === "connected") {
      this.scheduleRetry();
    }
  }

  /** Open only the connection still selected after synchronous status callbacks. */
  private openSocket() {
    if (!this.connection) return;
    const connection = this.connection;
    const { url, options } = connection;
    this.clearReconnect();

    this.emitConnection("connecting");
    if (this.connection !== connection) return;
    const socket = options.protocols
      ? new WebSocket(url, options.protocols)
      : new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectAttempts = 0;
      this.emitConnection("connected");
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (options.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.emitConnection("disconnected");
      }
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.emitConnection("error", "Socket error");
      if (options.autoReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  /** Reconnect only if callbacks leave the same session connection selected. */
  private scheduleReconnect() {
    if (!this.connection || this.reconnectTimer) return;
    const connection = this.connection;
    const { options } = connection;
    const delay = Math.min(
      options.reconnectDelayMs * 2 ** this.reconnectAttempts,
      options.maxReconnectDelayMs,
    );
    this.reconnectAttempts += 1;
    this.emitConnection("connecting");
    if (this.connection !== connection) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnect() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleMessage(raw: unknown) {
    const data = this.parseMessage(raw);
    const message = parseTransportMessage(data);
    if (!message || message.type === "presence") return;
    if (message.type === "state") {
      this.emit(message.event);
      this.logStateChange(message.event.deviceId, message.event.patch, "realtime");
      return;
    }
    if (message.type === "state-batch") {
      message.events.forEach((event) => {
        this.emit(event);
        this.logStateChange(event.deviceId, event.patch, "realtime");
      });
      return;
    }
    message.devices.forEach((device) => {
      const { id, name: _name, kind: _kind, roomId: _roomId, ...patch } = device;
      this.emit({ deviceId: id, patch, ts: message.ts });
    });
  }

  private logStateChange(
    deviceId: string,
    patch: DeviceStatePatch,
    source: "local" | "realtime",
  ) {
    if (!patch || Object.keys(patch).length === 0) return;
    void logDeviceAuditEvent({
      deviceId,
      action: "state",
      payload: { source, patch },
    }).catch(() => {});
  }

  /** Retain a retry only while its session, permission and lifetime remain valid. */
  private enqueueRetry(entry: RetryEntry) {
    const generation = this.sessionGeneration;
    const failure = this.commandFailure(entry.cmd, generation);
    if (failure) { this.recordAttempt(entry.progress, failure); return; }
    this.retryQueue.push(entry);
    this.commandProgress.transition(entry.progress, "queued");
    if (generation !== this.sessionGeneration) return;
    this.emitRetryStatus();
    this.scheduleRetry();
  }

  /** Wake at expiry even during another retry's bounded in-flight wait. */
  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.retryQueue.length === 0) return;
    const now = Date.now();
    const flushing = this.retryFlushGeneration === this.sessionGeneration;
    const nextWake = Math.min(
      ...this.retryQueue.map((entry) => flushing
        ? entry.cmd.expiresAt : Math.min(entry.nextAttemptAt, entry.cmd.expiresAt)),
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flushRetryQueue();
    }, Math.max(0, nextWake - now));
  }

  /** Remove invalid queued work without overwriting commands added by listeners. */
  private discardInvalidRetries(generation: number) {
    const pending = this.retryQueue;
    this.retryQueue = [];
    for (const entry of pending) {
      if (generation !== this.sessionGeneration) return;
      const failure = this.commandFailure(entry.cmd, generation);
      if (failure) this.recordAttempt(entry.progress, failure);
      else this.retryQueue.push(entry);
    }
  }

  /** Serialize retry dispatch; three retries means at most four total attempts. */
  private async flushRetryQueue() {
    const generation = this.sessionGeneration;
    this.discardInvalidRetries(generation);
    if (generation !== this.sessionGeneration) return;
    if (this.retryFlushGeneration === generation) {
      this.emitRetryStatus();
      this.scheduleRetry();
      return;
    }
    this.retryFlushGeneration = generation;
    try {
      while (generation === this.sessionGeneration) {
        this.discardInvalidRetries(generation);
        if (generation !== this.sessionGeneration) return;
        const index = this.retryQueue.findIndex((entry) => entry.nextAttemptAt <= Date.now());
        if (index < 0) break;
        const [entry] = this.retryQueue.splice(index, 1);
        this.commandProgress.transition(entry.progress, "retrying", entry.attempts + 2);
        this.scheduleRetry();
        const result = await this.attemptSend(entry.cmd, entry.patch, {
          allowMock: false, optimistic: false,
        }, generation);
        if (generation !== this.sessionGeneration) return;
        if (result.status !== "retryable") {
          this.recordAttempt(entry.progress, result);
        } else if (entry.attempts + 1 >= this.retryOptions.maxRetries) {
          this.commandProgress.transition(entry.progress, "failed", undefined, "retry_exhausted");
        } else {
          const attempts = entry.attempts + 1;
          const delay = Math.min(
            this.retryOptions.baseDelayMs * 2 ** attempts,
            this.retryOptions.maxDelayMs,
          );
          this.enqueueRetry({ ...entry, attempts, nextAttemptAt: Date.now() + delay });
        }
      }
    } finally {
      if (this.retryFlushGeneration === generation) this.retryFlushGeneration = null;
      if (generation === this.sessionGeneration) {
        this.emitRetryStatus();
        this.scheduleRetry();
      }
    }
  }

  /** Recheck authority before every send and after every asynchronous boundary. */
  private commandFailure(cmd: SecuredDeviceCommand, generation: number, checkExpiry = true) {
    if (generation !== this.sessionGeneration) {
      return { status: "cancelled", reason: "session_changed" } as const;
    }
    if (checkExpiry && cmd.expiresAt <= Date.now()) return { status: "expired" } as const;
    if (!authorizeLocalDeviceCommand(cmd).allowed) {
      return { status: "rejected", reason: "permission_denied" } as const;
    }
    return null;
  }

  /** Record delivery only; state events deliberately never enter this tracker. */
  private recordAttempt(progress: CommandProgressHandle, result: CommandAttemptResult) {
    if (result.status === "retryable") return;
    this.commandProgress.transition(progress, result.status, undefined,
      "reason" in result ? result.reason : undefined);
  }

  /** Preserve rejected promises for initial sends that cannot be queued safely. */
  private throwDeliveryFailure(result: CommandAttemptResult) {
    if (result.status === "expired") throw new CommandExpiredError();
    if (result.status === "cancelled" && result.reason === "session_changed") {
      throw new CommandAuthorizationError("session_changed");
    }
    if (result.status === "rejected" || result.status === "timed_out" || result.status === "cancelled") {
      throw new CommandDeliveryError(result.status, result.reason);
    }
  }

  /** Recheck callback boundaries; accepted delivery no longer depends on TTL. */
  private assertCommandMayContinue(cmd: SecuredDeviceCommand, generation: number, progress: CommandProgressHandle, checkExpiry = true) {
    const failure = this.commandFailure(cmd, generation, checkExpiry);
    if (failure) {
      this.recordAttempt(progress, failure);
      this.throwDeliveryFailure(failure);
    }
  }

  /** Deliver through existing transports with a bounded, non-confirming result. */
  private async attemptSend(
    cmd: SecuredDeviceCommand,
    patch: DeviceStatePatch | null,
    options: { allowMock: boolean; optimistic: boolean },
    generation: number,
  ): Promise<CommandAttemptResult> {
    const failure = this.commandFailure(cmd, generation);
    if (failure) return failure;
    if (this.commandTransport) {
      const transport = this.commandTransport;
      const result = await this.commandAttempts.run(() => transport(cmd, patch),
        cmd.expiresAt, () => this.commandFailure(cmd, generation));
      if (result.status !== "retryable") return result;
    }

    const beforeFallback = this.commandFailure(cmd, generation);
    if (beforeFallback) return beforeFallback;

    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: "command", payload: cmd }));
        return this.commandFailure(cmd, generation) ?? { status: "submitted" };
      } catch {
        // Fall back to mock behavior below.
      }
    }

    if (!options.allowMock) return { status: "retryable" };

    // Explicit development simulation only; it cannot confirm a real command.
    const result = await this.commandAttempts.run(
      () => new Promise<void>((resolve) => setTimeout(resolve, 80)),
      cmd.expiresAt, () => this.commandFailure(cmd, generation));
    if (result.status !== "submitted") return result;
    if (!options.optimistic && patch) {
      const evt: DeviceStateEvent = {
        deviceId: cmd.deviceId,
        patch,
        ts: Date.now(),
      };
      this.emit(evt);
    }
    return this.commandFailure(cmd, generation) ?? { status: "submitted" };
  }

  /** Keep a failing retry-status subscriber from aborting queue maintenance. */
  private emitRetryStatus() {
    const status = this.getRetryStatus();
    const generation = this.sessionGeneration;
    for (const listener of [...this.retryListeners]) {
      if (generation !== this.sessionGeneration) return;
      try { listener({ ...status }); } catch { console.warn("Retry status listener failed."); }
    }
  }

  private parseMessage(raw: unknown) {
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (typeof raw === "object") return raw;
    return null;
  }

  private patchFromCommand(cmd: DeviceCommand): DeviceStatePatch | null {
    switch (cmd.op) {
      case "set-properties":
        return cmd.changes;
      case "toggle":
        return typeof cmd.on === "boolean" ? { isOn: cmd.on } : { isOn: true };
      case "set-temp":
        return { tempC: cmd.value, mode: cmd.mode, isOn: true };
      case "set-brightness":
        return { brightness: cmd.value, isOn: cmd.value > 0 };
      case "set-volume":
        return { volume: cmd.value, isOn: true };
      case "set-mode":
        return { mode: cmd.mode, isOn: true };
      case "set-channel":
        return { channel: cmd.value, isOn: true };
      case "set-muted":
        return { muted: cmd.value, isOn: true };
      case "launch-app":
        return { source: cmd.app, isOn: true };
      case "media":
        return { isOn: true };
      case "nav":
        return { isOn: true };
      default:
        return null;
    }
  }

  /** Freeze the meaning of an action before an asynchronous biometric prompt. */
  private snapshotCommand(cmd: DeviceCommand): DeviceCommand {
    if (
      cmd.op === "set-properties" && cmd.changes &&
      ["id", "name", "kind", "roomId", "__proto__", "constructor", "prototype"].some(
        (key) => Object.prototype.hasOwnProperty.call(cmd.changes, key),
      )
    ) {
      throw new CommandAuthorizationError("immutable_device_field");
    }
    if (cmd.op === "set-properties") {
      // Optional undefined fields are omitted on the JSON wire; validate the
      // same representation without allowing non-finite or unsafe values.
      const changes = cmd.changes && typeof cmd.changes === "object" && !Array.isArray(cmd.changes)
        ? Object.fromEntries(Object.entries(cmd.changes).filter(([, value]) => value !== undefined))
        : null;
      if (!parseDeviceStatePatch(changes)) throw new CommandAuthorizationError("invalid_device_patch");
      return { ...cmd, changes: JSON.parse(JSON.stringify(changes)) as DeviceStatePatch };
    }
    return { ...cmd };
  }

  /** Add transport metadata only after confirmation; reject unbounded lifetimes. */
  private secureCommand(
    cmd: DeviceCommand,
    requestedTtlMs = 15_000,
  ): SecuredDeviceCommand {
    const now = Date.now();
    if (!Number.isFinite(requestedTtlMs)) throw new CommandExpiredError();
    const ttlMs = Math.max(1_000, Math.min(60_000, requestedTtlMs));
    const commandId = cmd.commandId?.trim() || createCommandId();
    const createdAt = cmd.createdAt ?? now;
    const expiresAt = cmd.expiresAt ?? createdAt + ttlMs;
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt < 0 ||
        createdAt > now + 5_000 || expiresAt <= now || expiresAt <= createdAt ||
        expiresAt > createdAt + 60_000) {
      throw new CommandExpiredError();
    }
    return {
      ...cmd,
      commandId,
      nonce: cmd.nonce?.trim() || createCommandId(),
      createdAt,
      expiresAt,
      idempotencyKey: cmd.idempotencyKey?.trim() || commandId,
    } as SecuredDeviceCommand;
  }
}

export class CommandAuthorizationError extends Error {
  constructor(public readonly reason: string) {
    super(`Device command denied: ${reason}`);
    this.name = "CommandAuthorizationError";
  }
}

export class CommandExpiredError extends Error {
  constructor() {
    super("Device command has expired or exceeds the maximum lifetime.");
    this.name = "CommandExpiredError";
  }
}

let commandSequence = 0;
function createCommandId() {
  commandSequence = (commandSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}-${commandSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export const deviceClient = new DeviceClient();
