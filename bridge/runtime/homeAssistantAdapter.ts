import { randomUUID } from "node:crypto";
import WebSocket, { type ClientOptions, type RawData } from "ws";
import { discoverPilotLight, normalizeLightObservation, parseLightServiceResult } from "../homeAssistantLight";
import { isDataRecord, parseLightBinding, type LightBinding, type LightObservation, type PilotLight } from "../lightContract";
import type { LightServiceCall } from "../lightLifecycle";
import type { LightAdapter, LightAdapterEvent, LightAdapterSnapshot } from "./types";

const MAX_FRAME_BYTES = 1_048_576;
const MAX_PENDING = 32;
const MAX_STATES = 10_000;
const SNAPSHOT_FRESHNESS_MS = 30_000;

/** Minimal socket boundary keeps all adapter tests independent of a network. */
export interface HomeAssistantSocket {
  readonly readyState: number;
  on(event: "message", listener: (data: RawData, binary: boolean) => void): this;
  on(event: "error" | "close", listener: () => void): this;
  send(data: string): void;
  removeAllListeners(): this;
  terminate(): void;
}

export type HomeAssistantAdapterOptions = {
  url: string;
  binding: LightBinding;
  getAccessToken: () => string | Promise<string>;
  socketFactory?: (url: string, options: ClientOptions) => HomeAssistantSocket;
  requestTimeoutMs?: number;
  refreshIntervalMs?: number;
};

type RequestKind = "state-subscription" | "registry-subscription" | "registry" | "snapshot" | "service";
type PendingRequest = { kind: RequestKind; revision: number; timer: ReturnType<typeof setTimeout> };
type Phase = "disconnected" | "challenge" | "token" | "authentication" | "authenticated";

/** Fail closed with fixed text; downstream errors may contain credentials or addresses. */
function unavailable(): Error {
  return new Error("Home Assistant session unavailable.");
}

/** The only production socket configuration: verified TLS, no redirect or compression. */
function defaultSocketFactory(url: string, options: ClientOptions): HomeAssistantSocket {
  return new WebSocket(url, options);
}

/** Require a credential-free, explicit HA TLS endpoint rather than constructing one from untrusted discovery. */
function endpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw unavailable(); }
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/websocket") {
    throw unavailable();
  }
  return url.href;
}

/** Registry events can refer to any HA domain, but never arbitrary paths or identifiers. */
function isEntityAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 255 && /^[a-z0-9_]+\.[a-z0-9_]+$/u.test(value);
}

/** Parse one bounded text frame before admitting it to the session state machine. */
function parseFrame(data: RawData, binary: boolean): Record<string, unknown> | null {
  if (binary) return null;
  const size = Array.isArray(data) ? data.reduce((sum, item) => sum + item.byteLength, 0) : data.byteLength;
  if (size > MAX_FRAME_BYTES) return null;
  const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  try {
    const message: unknown = JSON.parse(bytes.toString("utf8"));
    return isDataRecord(message) && typeof message.type === "string" ? message : null;
  } catch { return null; }
}

/**
 * Explicit one-light HA transport, independent of mobile pairing and command authority.
 * Protocol: https://developers.home-assistant.io/docs/api/websocket/.
 * Constructing this object performs no I/O; reconnect is always an explicit caller decision.
 */
export class HomeAssistantLightAdapter implements LightAdapter {
  private readonly url: string;
  private readonly binding: LightBinding;
  private readonly timeoutMs: number;
  private readonly refreshMs: number;
  private readonly socketFactory: NonNullable<HomeAssistantAdapterOptions["socketFactory"]>;
  private readonly listeners = new Set<(event: LightAdapterEvent) => void>();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly reservations = new Map<number, ReturnType<typeof setTimeout>>();
  private socket: HomeAssistantSocket | null = null;
  private phase: Phase = "disconnected";
  private sessionId: string | null = null;
  private sequence = 0;
  private revision = 0;
  private stateSubscription: number | null = null;
  private registrySubscription: number | null = null;
  private light: PilotLight | null = null;
  private observation: LightObservation | null = null;
  private ready = false;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private refresh: ReturnType<typeof setInterval> | null = null;
  private resolveConnection: (() => void) | null = null;
  private rejectConnection: ((error: Error) => void) | null = null;

  /** Capture immutable scope and bounded timing without retrieving credentials or opening sockets. */
  constructor(private readonly options: HomeAssistantAdapterOptions) {
    this.url = endpoint(options.url);
    const binding = parseLightBinding(options.binding);
    if (!binding) throw unavailable();
    this.binding = binding;
    this.timeoutMs = options.requestTimeoutMs ?? 10_000;
    this.refreshMs = options.refreshIntervalMs ?? 10_000;
    if (![this.timeoutMs, this.refreshMs].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 20_000)) throw unavailable();
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
  }

  /** Authenticate, subscribe before reading state, and resolve only after a usable initial snapshot. */
  connect(): Promise<void> {
    if (this.phase !== "disconnected") return Promise.reject(unavailable());
    this.phase = "challenge";
    const sessionId = randomUUID();
    this.sessionId = sessionId;
    const connection = new Promise<void>((resolve, reject) => {
      this.resolveConnection = resolve;
      this.rejectConnection = reject;
    });
    this.deadline = setTimeout(() => this.close(), this.timeoutMs);
    try {
      const socket = this.socketFactory(this.url, {
        maxPayload: MAX_FRAME_BYTES, handshakeTimeout: this.timeoutMs,
        rejectUnauthorized: true, followRedirects: false, perMessageDeflate: false,
      });
      this.socket = socket;
      socket.on("message", (data, binary) => {
        if (this.socket !== socket || this.sessionId !== sessionId) return;
        const frame = parseFrame(data, binary);
        if (!frame) { this.close(); return; }
        try { this.receive(frame); } catch { this.close(); }
      });
      socket.on("error", () => { if (this.socket === socket) this.close(); });
      socket.on("close", () => { if (this.socket === socket) this.close(); });
    } catch { this.close(); }
    return connection;
  }

  /** Return only this session's immutable snapshot, never an earlier connection's state. */
  getSnapshot(): LightAdapterSnapshot | null {
    return this.ready && this.sessionId && this.light && this.observation
      ? Object.freeze({ light: this.light, sessionId: this.sessionId, observation: this.observation }) : null;
  }

  /** Reserve an ID from the same allocator used by every bootstrap and polling request. */
  allocateRequestId(): number {
    if (!this.getSnapshot() || this.pending.size + this.reservations.size >= MAX_PENDING) throw unavailable();
    const id = this.nextId();
    this.reservations.set(id, setTimeout(() => this.reservations.delete(id), this.timeoutMs));
    return id;
  }

  /** Send one reserved explicit power call; never translate toggles, retry, or accept a different target. */
  send(call: LightServiceCall, sessionId: string): void {
    const snapshot = this.getSnapshot();
    if (!isDataRecord(call)) throw unavailable();
    const reservation = this.reservations.get(call.id);
    const now = Date.now();
    if (!snapshot || snapshot.sessionId !== sessionId || reservation === undefined ||
      snapshot.observation.availability !== "available" || now < snapshot.observation.receivedAt || now - snapshot.observation.receivedAt > SNAPSHOT_FRESHNESS_MS ||
      Object.keys(call).sort().join(",") !== "domain,id,service,target,type" ||
      call.type !== "call_service" || call.domain !== "light" || !["turn_on", "turn_off"].includes(call.service) ||
      !isDataRecord(call.target) || Object.keys(call.target).join(",") !== "entity_id" || call.target.entity_id !== snapshot.light.entityId) {
      throw unavailable();
    }
    clearTimeout(reservation);
    this.reservations.delete(call.id);
    this.request(call.id, "service", call);
  }

  /** Subscribe to sanitized service results and scoped observations; listener failures cannot break transport cleanup. */
  subscribe(listener: (event: LightAdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Immediately invalidate state and all deadlines; discarded sessions never reconnect or replay automatically. */
  close(): void {
    const sessionId = this.sessionId;
    if (!sessionId) return;
    this.sessionId = null;
    this.phase = "disconnected";
    this.ready = false;
    this.light = null;
    this.observation = null;
    this.stateSubscription = null;
    this.registrySubscription = null;
    this.revision = 0;
    if (this.deadline) clearTimeout(this.deadline);
    if (this.refresh) clearInterval(this.refresh);
    this.deadline = this.refresh = null;
    for (const request of this.pending.values()) clearTimeout(request.timer);
    for (const timer of this.reservations.values()) clearTimeout(timer);
    this.pending.clear();
    this.reservations.clear();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners();
      // A failed handshake may emit an error during terminate; consume it without retaining its text.
      socket.on("error", () => {});
      try { socket.terminate(); } catch { /* Session is already invalidated. */ }
    }
    const reject = this.rejectConnection;
    this.resolveConnection = this.rejectConnection = null;
    reject?.(unavailable());
    this.emit({ type: "disconnected", sessionId });
  }

  /** Enforce HA's challenge → token → auth_ok sequence before any command traffic. */
  private receive(frame: Record<string, unknown>): void {
    if (this.phase === "challenge" && frame.type === "auth_required") {
      this.phase = "token";
      void this.authenticate(this.sessionId!);
      return;
    }
    if (this.phase === "authentication" && frame.type === "auth_ok") {
      this.phase = "authenticated";
      this.request(this.nextId(), "state-subscription", { type: "subscribe_events", event_type: "state_changed" });
      this.request(this.nextId(), "registry-subscription", { type: "subscribe_events", event_type: "entity_registry_updated" });
      return;
    }
    if (this.phase !== "authenticated") { this.close(); return; }
    if (!Number.isSafeInteger(frame.id) || (frame.id as number) <= 0) { this.close(); return; }
    if (frame.type === "result") this.receiveResult(frame, frame.id as number);
    else if (frame.type === "event") this.receiveEvent(frame, frame.id as number);
    else this.close();
  }

  /** Retrieve the token only for a live challenge and never retain it in adapter state or diagnostic messages. */
  private async authenticate(sessionId: string): Promise<void> {
    try {
      const token = await this.options.getAccessToken();
      if (this.sessionId !== sessionId || this.phase !== "token") return;
      if (typeof token !== "string" || token.length < 1 || token.length > 4096 || /[\s\u0000-\u001f]/u.test(token)) { this.close(); return; }
      this.phase = "authentication";
      this.write({ type: "auth", access_token: token });
    } catch { if (this.sessionId === sessionId) this.close(); }
  }

  /** Bound outstanding work and install tracking before a socket may synchronously produce a result. */
  private request(id: number, kind: RequestKind, message: object): void {
    if (this.phase !== "authenticated" || this.pending.size + this.reservations.size >= MAX_PENDING || this.pending.has(id)) throw unavailable();
    this.pending.set(id, { kind, revision: this.revision, timer: setTimeout(() => this.close(), this.timeoutMs) });
    this.write({ ...message, id });
  }

  /** One monotonically increasing sequence prevents cross-operation response confusion. */
  private nextId(): number {
    if (this.sequence >= Number.MAX_SAFE_INTEGER) { this.close(); throw unavailable(); }
    return ++this.sequence;
  }

  /** A failed write invalidates the connection instead of suggesting that dispatch is safe to retry. */
  private write(message: object): void {
    try {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw unavailable();
      this.socket.send(JSON.stringify(message));
    } catch { this.close(); throw unavailable(); }
  }

  /** Consume only a known outstanding response and publish a minimized service result. */
  private receiveResult(frame: Record<string, unknown>, id: number): void {
    const pending = this.pending.get(id);
    if (!pending || typeof frame.success !== "boolean") { this.close(); return; }
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (pending.kind === "service") {
      const result = parseLightServiceResult(frame, id);
      if (!result) { this.close(); return; }
      const input = result.status === "rejected" ? { id, type: "result", success: false } : {
        id, type: "result", success: true, result: { response: null, context: result.contextId ? { id: result.contextId } : null },
      };
      this.emit({ type: "service-result", sessionId: this.sessionId!, input });
      return;
    }
    if (!frame.success) { this.close(); return; }
    if (pending.kind === "state-subscription" || pending.kind === "registry-subscription") {
      if (frame.result !== null) { this.close(); return; }
      if (pending.kind === "state-subscription") this.stateSubscription = id;
      else this.registrySubscription = id;
      if (this.stateSubscription && this.registrySubscription) this.request(this.nextId(), "registry", { type: "config/entity_registry/list" });
    } else if (pending.kind === "registry") {
      this.light = discoverPilotLight(frame.result, this.binding);
      if (!this.light) { this.close(); return; }
      this.refreshSnapshot();
    } else this.receiveSnapshot(frame.result, pending.revision);
  }

  /** Events must belong to the acknowledged subscription and configured entity. */
  private receiveEvent(frame: Record<string, unknown>, id: number): void {
    const event = frame.event;
    if (!isDataRecord(event) || !isDataRecord(event.data)) { this.close(); return; }
    if (!isEntityAddress(event.data.entity_id)) { this.close(); return; }
    if (id === this.registrySubscription && event.event_type === "entity_registry_updated") {
      if (!["create", "update", "remove"].includes(String(event.data.action)) ||
        (event.data.old_entity_id !== undefined && !isEntityAddress(event.data.old_entity_id))) { this.close(); return; }
      // During discovery any mutation can invalidate the pending registry snapshot.
      if (!this.light || event.data.entity_id === this.light.entityId || event.data.old_entity_id === this.light.entityId) this.close();
      return;
    }
    if (id !== this.stateSubscription || event.event_type !== "state_changed") { this.close(); return; }
    if (!this.light || event.data.entity_id !== this.light.entityId) return;
    if (!event.data.new_state) { this.close(); return; }
    this.observe(event.data.new_state);
  }

  /** Refresh an unchanged light too; no service call or implicit command is needed to maintain baseline freshness. */
  private refreshSnapshot(): void {
    if (this.phase !== "authenticated" || this.pending.size + this.reservations.size >= MAX_PENDING || [...this.pending.values()].some((request) => request.kind === "snapshot")) return;
    this.request(this.nextId(), "snapshot", { type: "get_states" });
  }

  /** A subscription event newer than a snapshot request always wins over that response. */
  private receiveSnapshot(input: unknown, requestedRevision: number): void {
    if (!Array.isArray(input) || input.length > MAX_STATES || !this.light) { this.close(); return; }
    const states = input.filter((entry: unknown) => isDataRecord(entry) && entry.entity_id === this.light?.entityId);
    if (states.length !== 1) { this.close(); return; }
    if (requestedRevision === this.revision) this.observe(states[0]);
    if (!this.sessionId || !this.observation || this.ready) return;
    this.ready = true;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
    this.refresh = setInterval(() => {
      try { this.refreshSnapshot(); } catch { this.close(); }
    }, this.refreshMs);
    const resolve = this.resolveConnection;
    this.resolveConnection = this.rejectConnection = null;
    resolve?.();
  }

  /** Preserve HA's observation time and attach adapter-owned receive time/revision. */
  private observe(raw: unknown): void {
    if (!this.light || !this.sessionId) return;
    const observation = normalizeLightObservation(raw, this.light, {
      sessionId: this.sessionId, revision: this.revision + 1, receivedAt: Date.now(),
    });
    if (!observation || (this.observation && observation.observedAt < this.observation.observedAt)) { this.close(); return; }
    this.revision++;
    this.observation = observation;
    this.emit({ type: "observation", observation });
  }

  /** Isolate listeners and stop an old session's delivery after a reentrant close. */
  private emit(event: LightAdapterEvent): void {
    const sessionId = this.sessionId;
    for (const listener of [...this.listeners]) {
      // Every owner must receive terminal invalidation even if another listener explicitly reconnects.
      if (event.type !== "disconnected" && sessionId !== this.sessionId) return;
      // A consumer may retain or mutate its own copy, never another subscriber's evidence.
      try { listener(structuredClone(event)); } catch { /* The command owner handles its own persistence failures. */ }
    }
  }
}
