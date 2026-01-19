import type { Device } from "../store/useHomeStore";

export type DeviceCommand =
  | { op: "toggle"; deviceId: string; on?: boolean }
  | { op: "patch"; deviceId: string; patch: Partial<Device> }
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

export type DeviceStateEvent = {
  deviceId: string;
  patch: Partial<Device>;
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

type DeviceStateMessage = {
  type: "state";
  deviceId: string;
  patch: Partial<Device>;
  ts?: number;
};

type DeviceStateBatchMessage = {
  type: "state-batch";
  events: Array<
    DeviceStateEvent | { deviceId: string; patch: Partial<Device>; ts?: number }
  >;
};

type DeviceSnapshotMessage = {
  type: "snapshot";
  devices: Device[];
  ts?: number;
};

type Listener = (evt: DeviceStateEvent) => void;
type ConnectionListener = (evt: ConnectionEvent) => void;

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
};

type CommandTransport = (
  cmd: DeviceCommand,
  patch: Partial<Device> | null,
) => Promise<void> | void;

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
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
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

  getConnectionStatus() {
    return this.connectionStatus;
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
    return () => {
      if (this.commandTransport === fn) {
        this.commandTransport = null;
      }
    };
  }

  async sendCommand(cmd: DeviceCommand, options: CommandOptions = {}) {
    const optimistic = options.optimistic ?? true;
    const patch = this.patchFromCommand(cmd);
    // Apply a local patch immediately so the UI feels snappy.
    if (optimistic && patch) {
      const evt: DeviceStateEvent = {
        deviceId: cmd.deviceId,
        patch,
        ts: Date.now(),
      };
      this.emit(evt);
    }

    if (this.commandTransport) {
      try {
        await this.commandTransport(cmd, patch);
        return;
      } catch {
        // Fall through to other transports.
      }
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: "command", payload: cmd }));
        return;
      } catch {
        // Fall back to mock behavior below.
      }
    }

    // Simulate round-trip; in production call your API here.
    await new Promise((r) => setTimeout(r, 80));
    if (!optimistic && patch) {
      const evt: DeviceStateEvent = {
        deviceId: cmd.deviceId,
        patch,
        ts: Date.now(),
      };
      this.emit(evt);
    }
  }

  pushState(deviceId: string, patch: Partial<Device>) {
    const evt: DeviceStateEvent = { deviceId, patch, ts: Date.now() };
    this.emit(evt);
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
    if (!data) return;

    if (this.isDeviceStateMessage(data)) {
      const evt: DeviceStateEvent = {
        deviceId: data.deviceId,
        patch: data.patch,
        ts: data.ts ?? Date.now(),
      };
      this.emit(evt);
      return;
    }

    if (this.isDeviceStateBatchMessage(data)) {
      data.events.forEach((evt) => {
        if (!evt || typeof evt.deviceId !== "string" || !evt.patch) return;
        this.emit({
          deviceId: evt.deviceId,
          patch: evt.patch,
          ts: "ts" in evt && typeof evt.ts === "number" ? evt.ts : Date.now(),
        });
      });
      return;
    }

    if (this.isDeviceSnapshotMessage(data)) {
      data.devices.forEach((device) => {
        if (!device || typeof device.id !== "string") return;
        this.emit({
          deviceId: device.id,
          patch: device,
          ts: data.ts ?? Date.now(),
        });
      });
      return;
    }

    if (typeof data.deviceId === "string" && data.patch) {
      const evt: DeviceStateEvent = {
        deviceId: data.deviceId,
        patch: data.patch,
        ts: Date.now(),
      };
      this.emit(evt);
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

  private isDeviceStateMessage(data: any): data is DeviceStateMessage {
    return (
      data?.type === "state" && typeof data.deviceId === "string" && data.patch
    );
  }

  private isDeviceStateBatchMessage(
    data: any,
  ): data is DeviceStateBatchMessage {
    return data?.type === "state-batch" && Array.isArray(data.events);
  }

  private isDeviceSnapshotMessage(data: any): data is DeviceSnapshotMessage {
    return data?.type === "snapshot" && Array.isArray(data.devices);
  }

  private patchFromCommand(cmd: DeviceCommand): Partial<Device> | null {
    switch (cmd.op) {
      case "patch":
        return cmd.patch;
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
}

export const deviceClient = new DeviceClient();
