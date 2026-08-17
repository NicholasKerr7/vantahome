import type { Device } from "../store/useHomeStore";
import { logDeviceAuditEvent } from "./cloudRegistry";
import {
  parseDeviceStatePatch,
  parseTransportMessage,
  type DeviceStatePatch,
} from "./transportSchemas";
import { runtimePolicy } from "../config/runtimeMode";
import { authorizeLocalDeviceCommand } from "../security/localCommandAuthorization";
import { confirmSensitiveAction } from "../security/biometricConfirmation";

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
  attempts: number;
  nextAttemptAt: number;
};

type RetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

/**
 * Mock device client that simulates a backend bridge.
 *
 * Replace these implementations with real WebSocket/MQTT transports and an HTTP
 * command API. The shape is kept small and future-proof: sendCommand for
 * one-shot operations, subscribeState for realtime updates.
 */
class DeviceClient {
  private listeners = new Set<Listener>();
  private connectionListeners = new Set<ConnectionListener>();
  private retryListeners = new Set<RetryListener>();
  private commandListeners: Set<(cmd: SecuredDeviceCommand) => void> | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private retryQueue: RetryEntry[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
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

  subscribeConnection(fn: ConnectionListener) {
    this.connectionListeners.add(fn);
    fn({
      status: this.connectionStatus,
      ts: Date.now(),
      url: this.connection?.url,
    });
    return () => this.connectionListeners.delete(fn);
  }

  subscribeRetry(fn: RetryListener) {
    this.retryListeners.add(fn);
    fn(this.getRetryStatus());
    return () => this.retryListeners.delete(fn);
  }

  subscribeCommand(fn: (cmd: SecuredDeviceCommand) => void) {
    if (!this.commandListeners) {
      this.commandListeners = new Set();
    }
    this.commandListeners.add(fn);
    return () => this.commandListeners?.delete(fn);
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

  connect(url: string, options: ConnectOptions = {}) {
    const merged: ResolvedConnectOptions = {
      protocols: options.protocols,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelayMs: options.reconnectDelayMs ?? 800,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 8000,
    };

    this.connection = { url, options: merged };
    this.emitConnection("connecting");
    this.openSocket();

    return () => {
      this.disconnect();
    };
  }

  disconnect() {
    this.connection = null;
    this.clearReconnect();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.emitConnection("disconnected");
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

  async sendCommand(cmd: DeviceCommand, options: CommandOptions = {}) {
    const authorization = authorizeLocalDeviceCommand(cmd);
    if (!authorization.allowed) {
      throw new CommandAuthorizationError(authorization.reason);
    }
    await confirmSensitiveAction(authorization.permission);
    const securedCommand = this.secureCommand(cmd, options.ttlMs);
    const optimistic =
      options.optimistic ?? !runtimePolicy.requireRealTransport;
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

    const sent = await this.attemptSend(securedCommand, patch, {
      allowMock:
        runtimePolicy.allowMockTelemetry && this.commandTransport === null,
      optimistic,
    });
    if (!sent) {
      this.enqueueRetry(securedCommand, patch);
    }

    this.commandListeners?.forEach((fn) => fn(securedCommand));
    void logDeviceAuditEvent({
      deviceId: securedCommand.deviceId,
      action: securedCommand.op,
      payload: securedCommand as unknown as Record<string, unknown>,
    }).catch(() => {});
    return { commandId: securedCommand.commandId, queued: !sent };
  }

  pushState(deviceId: string, patch: unknown) {
    const parsedPatch = parseDeviceStatePatch(patch);
    if (!parsedPatch) return false;
    const evt: DeviceStateEvent = { deviceId, patch: parsedPatch, ts: Date.now() };
    this.emit(evt);
    this.logStateChange(deviceId, parsedPatch, "local");
    return true;
  }

  private emit(evt: DeviceStateEvent) {
    this.listeners.forEach((fn) => fn(evt));
  }

  private emitConnection(status: ConnectionStatus, error?: string) {
    this.connectionStatus = status;
    const event: ConnectionEvent = {
      status,
      ts: Date.now(),
      url: this.connection?.url,
      error,
    };
    this.connectionListeners.forEach((fn) => fn(event));
    if (status === "connected") {
      this.scheduleRetry();
    }
  }

  private openSocket() {
    if (!this.connection) return;
    const { url, options } = this.connection;
    this.clearReconnect();

    this.emitConnection("connecting");
    const socket = options.protocols
      ? new WebSocket(url, options.protocols)
      : new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.emitConnection("connected");
    };

    socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (options.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.emitConnection("disconnected");
      }
    };

    socket.onerror = () => {
      this.emitConnection("error", "Socket error");
      if (options.autoReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    if (!this.connection || this.reconnectTimer) return;
    const { options } = this.connection;
    const delay = Math.min(
      options.reconnectDelayMs * 2 ** this.reconnectAttempts,
      options.maxReconnectDelayMs,
    );
    this.reconnectAttempts += 1;
    this.emitConnection("connecting");
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

  private enqueueRetry(cmd: SecuredDeviceCommand, patch: DeviceStatePatch | null) {
    const now = Date.now();
    if (cmd.expiresAt <= now) return;
    this.retryQueue.push({
      cmd,
      patch,
      attempts: 0,
      nextAttemptAt: now + this.retryOptions.baseDelayMs,
    });
    this.emitRetryStatus();
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer || this.retryQueue.length === 0) return;
    const now = Date.now();
    const nextAttemptAt = Math.min(
      ...this.retryQueue.map((entry) => entry.nextAttemptAt),
    );
    const delay = Math.max(0, nextAttemptAt - now);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flushRetryQueue();
    }, delay);
    this.emitRetryStatus();
  }

  private async flushRetryQueue() {
    if (this.retryQueue.length === 0) return;
    const now = Date.now();
    const pending = this.retryQueue;
    this.retryQueue = [];
    for (const entry of pending) {
      if (entry.cmd.expiresAt <= now) continue;
      if (entry.nextAttemptAt > now) {
        this.retryQueue.push(entry);
        continue;
      }
      const sent = await this.attemptSend(entry.cmd, entry.patch, {
        allowMock: false,
        optimistic: true,
      });
      if (!sent) {
        const attempts = entry.attempts + 1;
        if (attempts <= this.retryOptions.maxRetries) {
          const delay = Math.min(
            this.retryOptions.baseDelayMs * 2 ** (attempts - 1),
            this.retryOptions.maxDelayMs,
          );
          this.retryQueue.push({
            ...entry,
            attempts,
            nextAttemptAt: now + delay,
          });
        }
      }
    }
    this.emitRetryStatus();
    this.scheduleRetry();
  }

  private async attemptSend(
    cmd: SecuredDeviceCommand,
    patch: DeviceStatePatch | null,
    options: { allowMock: boolean; optimistic: boolean },
  ) {
    if (cmd.expiresAt <= Date.now()) return false;
    if (this.commandTransport) {
      try {
        await this.commandTransport(cmd, patch);
        return true;
      } catch {
        // Fall through to other transports.
      }
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: "command", payload: cmd }));
        return true;
      } catch {
        // Fall back to mock behavior below.
      }
    }

    if (!options.allowMock) return false;

    // Simulate round-trip; in production call your API here.
    await new Promise((r) => setTimeout(r, 80));
    if (!options.optimistic && patch) {
      const evt: DeviceStateEvent = {
        deviceId: cmd.deviceId,
        patch,
        ts: Date.now(),
      };
      this.emit(evt);
    }
    return true;
  }

  private emitRetryStatus() {
    const status = this.getRetryStatus();
    this.retryListeners.forEach((fn) => fn(status));
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

  private secureCommand(
    cmd: DeviceCommand,
    requestedTtlMs = 15_000,
  ): SecuredDeviceCommand {
    const now = Date.now();
    if (
      cmd.op === "set-properties" &&
      ["id", "name", "kind", "roomId", "__proto__", "constructor", "prototype"].some(
        (key) => Object.prototype.hasOwnProperty.call(cmd.changes, key),
      )
    ) {
      throw new CommandAuthorizationError("immutable_device_field");
    }
    const ttlMs = Math.max(1_000, Math.min(60_000, requestedTtlMs));
    const commandId = cmd.commandId?.trim() || createCommandId();
    const createdAt = cmd.createdAt ?? now;
    const expiresAt = cmd.expiresAt ?? createdAt + ttlMs;
    if (expiresAt <= now || expiresAt > createdAt + 60_000) {
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
