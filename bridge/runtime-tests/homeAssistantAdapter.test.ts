import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test, { type TestContext } from "node:test";
import type { ClientOptions } from "ws";
import { HomeAssistantLightAdapter, type HomeAssistantAdapterOptions, type HomeAssistantSocket } from "../runtime/homeAssistantAdapter";
import type { LightAdapterEvent } from "../runtime/types";
import type { LightBinding } from "../lightContract";
import type { LightServiceCall } from "../lightLifecycle";

const binding: LightBinding = {
  homeId: "synthetic-home", bridgeId: "synthetic-bridge", integrationId: "synthetic-ha",
  deviceId: "synthetic-light", registryEntryId: "stable-registry-id",
};

/** In-process socket double: even connect() cannot perform network I/O in these tests. */
class FakeSocket extends EventEmitter implements HomeAssistantSocket {
  readyState = 1;
  terminated = false;
  readonly sent: Record<string, unknown>[] = [];
  onSend?: (message: Record<string, unknown>) => void;

  /** Decode outbound protocol data for test assertions and optional synchronous replies. */
  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(message);
    this.onSend?.(message);
  }

  /** Mark teardown without generating real socket errors or opening any connection. */
  terminate(): void { this.terminated = true; this.readyState = 3; }

  /** Deliver an ordinary HA text frame to the registered adapter listener. */
  frame(message: object): void { this.emit("message", Buffer.from(JSON.stringify(message)), false); }

  /** Find the most recent request of one protocol type. */
  request(type: string): Record<string, unknown> {
    const message = this.sent.filter((item) => item.type === type).at(-1);
    assert.ok(message, `Expected ${type}`);
    return message;
  }
}

/** Make a representative HA state while preserving the device-reported timestamp. */
function lightState(on = false, entityId = "light.pilot", updatedAt = Date.now() - 1000) {
  return { entity_id: entityId, state: on ? "on" : "off", attributes: {}, last_updated: new Date(updatedAt).toISOString(), context: { id: "synthetic-context" } };
}

/** Create an isolated adapter, an event log and explicit socket history for each test. */
function fixture(t: TestContext, overrides: Partial<HomeAssistantAdapterOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const events: LightAdapterEvent[] = [];
  const configurations: ClientOptions[] = [];
  let tokenCalls = 0;
  const adapter = new HomeAssistantLightAdapter({
    url: "wss://synthetic.invalid/api/websocket", binding,
    getAccessToken: () => { tokenCalls++; return "synthetic-token-only"; },
    socketFactory: (_url, options) => {
      configurations.push(options);
      const socket = new FakeSocket(); sockets.push(socket); return socket;
    }, ...overrides,
  });
  adapter.subscribe((event) => events.push(event));
  t.after(() => adapter.close());
  return { adapter, events, sockets, configurations, tokenCalls: () => tokenCalls, socket: () => sockets.at(-1)! };
}

/** Begin authentication and acknowledge both subscriptions before registry discovery. */
async function bootstrapUntilRegistry(f: ReturnType<typeof fixture>) {
  const ready = f.adapter.connect();
  const socket = f.socket();
  socket.frame({ type: "auth_required", ha_version: "synthetic" });
  await Promise.resolve();
  assert.equal(socket.request("auth").access_token, "synthetic-token-only");
  socket.frame({ type: "auth_ok", ha_version: "synthetic" });
  for (const request of socket.sent.filter((item) => item.type === "subscribe_events")) {
    socket.frame({ id: request.id, type: "result", success: true, result: null });
  }
  return { ready, socket };
}

/** Complete a registry/state bootstrap using only invented registry identities. */
async function makeReady(f: ReturnType<typeof fixture>, entityId = "light.pilot") {
  const { ready, socket } = await bootstrapUntilRegistry(f);
  socket.frame({ id: socket.request("config/entity_registry/list").id, type: "result", success: true,
    result: [{ id: binding.registryEntryId, entity_id: entityId, disabled_by: null }] });
  socket.frame({ id: socket.request("get_states").id, type: "result", success: true, result: [lightState(false, entityId)] });
  await ready;
  return socket;
}

/** Build the same minimal explicit call shape that the pure lifecycle dispatcher produces. */
function call(f: ReturnType<typeof fixture>): LightServiceCall {
  const snapshot = f.adapter.getSnapshot(); assert.ok(snapshot);
  return { id: f.adapter.allocateRequestId(), type: "call_service", domain: "light", service: "turn_on", target: { entity_id: snapshot.light.entityId } };
}

/** Send a state event addressed to the adapter's real acknowledged subscription. */
function stateEvent(socket: FakeSocket, state: ReturnType<typeof lightState>, id?: unknown) {
  const subscription = socket.sent.find((message) => message.event_type === "state_changed"); assert.ok(subscription);
  socket.frame({ id: id ?? subscription.id, type: "event", event: { event_type: "state_changed", data: { entity_id: state.entity_id, new_state: state } } });
}

test("construction is inert, requires TLS and waits for the full authentication/bootstrap sequence", async (t) => {
  const f = fixture(t);
  assert.equal(f.sockets.length, 0); assert.equal(f.tokenCalls(), 0); assert.equal(f.adapter.getSnapshot(), null);
  assert.throws(() => f.adapter.allocateRequestId(), /unavailable/);
  for (const url of ["ws://synthetic.invalid/api/websocket", "wss://user:secret@synthetic.invalid/api/websocket", "wss://synthetic.invalid/api/websocket?token=x"]) {
    assert.throws(() => fixture(t, { url }), /unavailable/);
  }
  const socket = await makeReady(f);
  assert.equal(f.tokenCalls(), 1);
  assert.deepEqual(f.configurations[0], { maxPayload: 1_048_576, handshakeTimeout: 10_000, rejectUnauthorized: true, followRedirects: false, perMessageDeflate: false });
  assert.equal(f.adapter.getSnapshot()?.light.entityId, "light.pilot");
  assert.equal(socket.sent.filter((message) => message.type === "call_service").length, 0);
});

test("auth rejection, unsolicited auth_ok and asynchronous token failure expose no secret detail", async (t) => {
  for (const behavior of ["invalid", "unsolicited", "token-failure"]) {
    await t.test(behavior, async (child) => {
      const f = fixture(child, behavior === "token-failure" ? { getAccessToken: async () => { throw new Error("private-token-error"); } } : {});
      const ready = f.adapter.connect();
      if (behavior === "unsolicited") f.socket().frame({ type: "auth_ok" });
      else {
        f.socket().frame({ type: "auth_required" });
        await Promise.resolve();
        if (behavior === "invalid") f.socket().frame({ type: "auth_invalid", message: "private-token-error" });
      }
      await assert.rejects(ready, { message: "Home Assistant session unavailable." });
      assert.equal(f.adapter.getSnapshot(), null);
      assert.equal(JSON.stringify(f.events).includes("private-token-error"), false);
      assert.equal(f.socket().sent.some((message) => message.type === "call_service"), false);
    });
  }
});

test("preauth dispatch cannot send and an incomplete handshake times out", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const f = fixture(t);
  const ready = f.adapter.connect();
  assert.throws(() => f.adapter.send({ id: 1, type: "call_service", domain: "light", service: "turn_on", target: { entity_id: "light.pilot" } }, "not-a-session"), /unavailable/);
  t.mock.timers.tick(10_001);
  await assert.rejects(ready, /unavailable/);
  assert.equal(f.socket().terminated, true);
});

test("a token resolved after close cannot authenticate a replacement session", async (t) => {
  let release: ((token: string) => void) | undefined;
  const f = fixture(t, { getAccessToken: () => new Promise<string>((resolve) => { release = resolve; }) });
  const oldReady = f.adapter.connect(); const oldSocket = f.socket();
  oldSocket.frame({ type: "auth_required" });
  f.adapter.close();
  await assert.rejects(oldReady, /unavailable/);
  const newReady = f.adapter.connect();
  release?.("late-synthetic-token");
  await Promise.resolve();
  assert.equal(oldSocket.sent.length, 0);
  assert.equal(f.socket().sent.length, 0);
  f.adapter.close();
  await assert.rejects(newReady, /unavailable/);
});

test("malformed, oversized and binary frames invalidate the session", async (t) => {
  for (const [name, bytes, binary] of [
    ["malformed", Buffer.from("not-json"), false],
    ["oversized", Buffer.alloc(1_048_577), false],
    ["binary", Buffer.from("{}"), true],
  ] as const) await t.test(name, async (child) => {
    const f = fixture(child); await makeReady(f);
    f.socket().emit("message", bytes, binary);
    assert.equal(f.adapter.getSnapshot(), null);
    assert.equal(f.socket().terminated, true);
  });
});

test("unknown result IDs and events for an unacknowledged subscription are never accepted", async (t) => {
  for (const kind of ["result", "event"]) await t.test(kind, async (child) => {
    const f = fixture(child); const socket = await makeReady(f);
    if (kind === "result") socket.frame({ id: 999, type: "result", success: true, result: null });
    else stateEvent(socket, lightState(true), 999);
    assert.equal(f.adapter.getSnapshot(), null);
    assert.equal(f.events.filter((event) => event.type === "service-result").length, 0);
  });
});

test("all bootstrap, service, and periodic snapshot requests use unique IDs", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: new Date("2026-09-29T12:00:00Z") });
  const f = fixture(t); const socket = await makeReady(f);
  const first = f.adapter.getSnapshot()!;
  const request = call(f);
  f.adapter.send(request, first.sessionId);
  socket.frame({ id: request.id, type: "result", success: true, result: { response: null, context: { id: "command-context" } } });
  assert.throws(() => f.adapter.send(request, first.sessionId), /unavailable/);
  t.mock.timers.tick(10_000);
  socket.frame({ id: socket.request("get_states").id, type: "result", success: true, result: [lightState(false, "light.pilot", first.observation.observedAt)] });
  const next = f.adapter.getSnapshot()!;
  assert.equal(next.observation.observedAt, first.observation.observedAt);
  assert.equal(next.observation.receivedAt, first.observation.receivedAt + 10_000);
  assert.ok(next.observation.revision > first.observation.revision);
  const ids = socket.sent.map((message) => message.id).filter((id) => id !== undefined);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(socket.sent.filter((message) => message.type === "call_service").length, 1);
});

test("a get_states response cannot overwrite a newer subscribed state event", async (t) => {
  const f = fixture(t); const { ready, socket } = await bootstrapUntilRegistry(f);
  socket.frame({ id: socket.request("config/entity_registry/list").id, type: "result", success: true, result: [{ id: binding.registryEntryId, entity_id: "light.pilot", disabled_by: null }] });
  const snapshotId = socket.request("get_states").id;
  stateEvent(socket, lightState(true, "light.pilot", Date.now()));
  socket.frame({ id: snapshotId, type: "result", success: true, result: [lightState(false)] });
  await ready;
  assert.equal(f.adapter.getSnapshot()?.observation.isOn, true);
  assert.equal(f.adapter.getSnapshot()?.observation.revision, 1);
});

test("synchronous service result and observation callbacks are retained in either order", async (t) => {
  for (const order of ["result-first", "observation-first"]) await t.test(order, async (child) => {
    const f = fixture(child); const socket = await makeReady(f); const request = call(f);
    socket.onSend = (message) => {
      if (message.type !== "call_service") return;
      const result = () => socket.frame({ id: message.id, type: "result", success: true, result: { context: { id: "synthetic-context" }, response: null } });
      const observation = () => stateEvent(socket, lightState(true, "light.pilot", Date.now()));
      if (order === "result-first") { result(); observation(); } else { observation(); result(); }
    };
    f.adapter.send(request, f.adapter.getSnapshot()!.sessionId);
    assert.equal(f.adapter.getSnapshot()?.observation.isOn, true);
    assert.equal(f.events.filter((event) => event.type === "service-result").length, 1);
    assert.equal(f.events.filter((event) => event.type === "observation").length, 2);
  });
});

test("failed service results discard raw error bodies and subscriber mutation cannot rewrite evidence", async (t) => {
  const f = fixture(t); const socket = await makeReady(f);
  const received: LightAdapterEvent[] = [];
  f.adapter.subscribe((event) => {
    if (event.type === "service-result") (event.input as Record<string, unknown>).success = true;
  });
  f.adapter.subscribe((event) => received.push(event));
  const request = call(f); f.adapter.send(request, f.adapter.getSnapshot()!.sessionId);
  socket.frame({ id: request.id, type: "result", success: false, error: { message: "private-token-error", code: "unknown_error" } });
  assert.deepEqual(received.at(-1), { type: "service-result", sessionId: f.adapter.getSnapshot()!.sessionId,
    input: { id: request.id, type: "result", success: false } });
  assert.equal(JSON.stringify(f.events).includes("private-token-error"), false);
});

test("registry rename invalidates a pending command and explicit reconnect rediscovers stable identity", async (t) => {
  const f = fixture(t); const socket = await makeReady(f); const old = f.adapter.getSnapshot()!;
  f.adapter.send(call(f), old.sessionId);
  const subscription = socket.sent.find((message) => message.event_type === "entity_registry_updated")!;
  socket.frame({ id: subscription.id, type: "event", event: { event_type: "entity_registry_updated", data: { action: "update", entity_id: "light.renamed", old_entity_id: "light.pilot" } } });
  assert.equal(f.adapter.getSnapshot(), null);
  assert.equal(f.events.at(-1)?.type, "disconnected");
  await makeReady(f, "light.renamed");
  assert.notEqual(f.adapter.getSnapshot()?.sessionId, old.sessionId);
  assert.equal(f.adapter.getSnapshot()?.light.binding.registryEntryId, binding.registryEntryId);
  stateEvent(socket, lightState(true));
  assert.equal(f.adapter.getSnapshot()?.observation.isOn, false);
  assert.equal(f.sockets.flatMap((item) => item.sent).filter((message) => message.type === "call_service").length, 1);
});

test("registry removal, state removal, and unavailable observations cannot produce further power calls", async (t) => {
  for (const kind of ["registry", "state", "unavailable"]) await t.test(kind, async (child) => {
    const f = fixture(child); const socket = await makeReady(f); const snapshot = f.adapter.getSnapshot()!; const request = call(f);
    if (kind === "registry") {
      const id = socket.sent.find((message) => message.event_type === "entity_registry_updated")!.id;
      socket.frame({ id, type: "event", event: { event_type: "entity_registry_updated", data: { action: "remove", entity_id: "light.pilot" } } });
    } else {
      const id = socket.sent.find((message) => message.event_type === "state_changed")!.id;
      socket.frame({ id, type: "event", event: { event_type: "state_changed", data: { entity_id: "light.pilot", new_state: kind === "state" ? null : { ...lightState(), state: "unavailable" } } } });
    }
    assert.throws(() => f.adapter.send(request, snapshot.sessionId), /unavailable/);
    assert.equal(socket.sent.some((message) => message.type === "call_service"), false);
  });
});

test("service timeout closes once without retry and close clears scheduled refreshes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const f = fixture(t); const socket = await makeReady(f);
  f.adapter.send(call(f), f.adapter.getSnapshot()!.sessionId);
  t.mock.timers.tick(10_001);
  assert.equal(f.adapter.getSnapshot(), null);
  const count = socket.sent.length;
  t.mock.timers.tick(30_000);
  f.adapter.close();
  assert.equal(socket.sent.length, count);
  assert.equal(f.events.filter((event) => event.type === "disconnected").length, 1);
  assert.equal(socket.sent.filter((message) => message.type === "call_service").length, 1);
});

test("bounded reservations, wrong target and wrong session cannot dispatch", async (t) => {
  const f = fixture(t); const socket = await makeReady(f); const request = call(f); const snapshot = f.adapter.getSnapshot()!;
  assert.throws(() => f.adapter.send({ ...request, target: { entity_id: "light.other" } }, snapshot.sessionId), /unavailable/);
  assert.throws(() => f.adapter.send(request, "old-session"), /unavailable/);
  for (let index = 1; index < 32; index++) f.adapter.allocateRequestId();
  assert.throws(() => f.adapter.allocateRequestId(), /unavailable/);
  assert.equal(socket.sent.some((message) => message.type === "call_service"), false);
});

test("all subscribers receive disconnection even when an earlier listener starts a new session", async (t) => {
  const f = fixture(t); await makeReady(f); let reconnect: Promise<void> | undefined;
  const stop = f.adapter.subscribe((event) => { if (event.type === "disconnected") reconnect = f.adapter.connect(); });
  const terminal: LightAdapterEvent[] = [];
  f.adapter.subscribe((event) => { if (event.type === "disconnected") terminal.push(event); });
  f.adapter.close();
  stop();
  assert.equal(terminal.length, 1);
  assert.ok(reconnect);
  f.adapter.close();
  await assert.rejects(reconnect, /unavailable/);
});
