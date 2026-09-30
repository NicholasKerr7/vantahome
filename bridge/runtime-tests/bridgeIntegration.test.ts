import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { LightCommandRecord, LightPowerCommand } from "../lightContract";
import { HomeAssistantLightAdapter, type HomeAssistantSocket } from "../runtime/homeAssistantAdapter";
import { LightWorker } from "../runtime/lightWorker";
import { SqliteLightJournal } from "../runtime/sqliteLightJournal";

const binding = Object.freeze({
  homeId: "integration-home", bridgeId: "integration-bridge", integrationId: "integration-ha",
  deviceId: "integration-light", registryEntryId: "integration-registry",
});
const principal = Object.freeze({ actorId: "integration-owner", homeId: binding.homeId });

/** HA protocol peer simulated entirely in process; its constructor never opens a socket. */
class ScriptedSocket extends EventEmitter implements HomeAssistantSocket {
  readyState = 1;
  readonly sent: Record<string, unknown>[] = [];
  onService?: (message: Record<string, unknown>) => void;

  /** Configure the registry address for this single invented integration session. */
  constructor(readonly entityId: string) { super(); }

  /** Reply synchronously to bootstrap requests so composition also covers reentrant delivery. */
  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(message);
    if (message.type === "auth") this.frame({ type: "auth_ok" });
    else if (message.type === "subscribe_events") this.result(message.id, null);
    else if (message.type === "config/entity_registry/list") {
      this.result(message.id, [{ id: binding.registryEntryId, entity_id: this.entityId, disabled_by: null }]);
    } else if (message.type === "get_states") this.result(message.id, [this.state(false, Date.now() - 1000)]);
    else if (message.type === "call_service") this.onService?.(message);
  }

  /** Emit only the text-frame envelope accepted by the production adapter. */
  frame(message: object): void { this.emit("message", Buffer.from(JSON.stringify(message)), false); }

  /** Send a successful HA result using the original operation's exact request ID. */
  result(id: unknown, result: unknown): void { this.frame({ id, type: "result", success: true, result }); }

  /** Construct a reported state, without treating service acceptance as observed power. */
  state(on: boolean, updatedAt = Date.now()) {
    return { entity_id: this.entityId, state: on ? "on" : "off", attributes: {},
      last_updated: new Date(updatedAt).toISOString(), context: { id: "integration-context" } };
  }

  /** Address events to the actual acknowledged subscription rather than a guessed identifier. */
  event(type: "state_changed" | "entity_registry_updated", data: object): void {
    const subscription = this.sent.find((message) => message.type === "subscribe_events" && message.event_type === type);
    assert.ok(subscription);
    this.frame({ id: subscription.id, type: "event", event: { event_type: type, data } });
  }

  /** Terminate only the synthetic peer; adapter cleanup remains real. */
  terminate(): void { this.readyState = 3; }
}

/** Build the actual journal/worker/adapter composition with an injected network-free peer. */
function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "vantahome-bridge-integration-"));
  let failCommit = false;
  let entityId = "light.integration";
  const sockets: ScriptedSocket[] = [];
  const journal = new SqliteLightJournal({ directory, binding, beforeCommit: () => {
    if (failCommit) throw new Error("synthetic commit failure");
  } });
  const adapter = new HomeAssistantLightAdapter({
    url: "wss://integration.invalid/api/websocket", binding, getAccessToken: () => "synthetic-token",
    socketFactory: () => { const socket = new ScriptedSocket(entityId); sockets.push(socket); return socket; },
  });
  const worker = new LightWorker({ journal, adapter, authorize: () => true, tickIntervalMs: 0 });
  t.after(() => { worker.close(); adapter.close(); journal.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    directory, journal, worker, adapter, sockets,
    failCommit: () => { failCommit = true; },
    rename: (value: string) => { entityId = value; },
  };
}

/** Start an explicit connection and provide the synthetic HA authentication challenge. */
async function connect(f: ReturnType<typeof fixture>): Promise<ScriptedSocket> {
  const ready = f.adapter.connect();
  const socket = f.sockets.at(-1)!;
  socket.frame({ type: "auth_required" });
  await ready;
  return socket;
}

/** Return one bounded explicit power envelope accepted by the existing reference contract. */
function command(): LightPowerCommand {
  const createdAt = Date.now();
  return { deviceId: binding.deviceId, op: "toggle", on: true,
    commandId: "integration-command", nonce: "integration-nonce", idempotencyKey: "integration-intent",
    createdAt, expiresAt: createdAt + 30_000 };
}

/** A second SQLite connection can only observe committed records, proving the send ordering. */
function readCommitted(directory: string): LightCommandRecord {
  const reader = new DatabaseSync(join(directory, "commands.sqlite"), { readOnly: true });
  try {
    const row = reader.prepare("SELECT record FROM light_commands").get();
    assert.equal(typeof row?.record, "string");
    return JSON.parse(row!.record as string) as LightCommandRecord;
  } finally { reader.close(); }
}

test("the full bridge commits dispatch before socket write and retains both synchronous evidence orderings", async (t) => {
  for (const order of ["result-first", "state-first"] as const) await t.test(order, async (child) => {
    const f = fixture(child);
    const socket = await connect(f);
    socket.onService = (message) => {
      assert.equal(readCommitted(f.directory).status, "dispatching");
      assert.equal(readCommitted(f.directory).requestId, message.id);
      const result = () => socket.result(message.id, { context: { id: "integration-context" } });
      const observation = () => socket.event("state_changed", { entity_id: socket.entityId, new_state: socket.state(true) });
      if (order === "result-first") { result(); observation(); } else { observation(); result(); }
    };
    const intent = command();
    const outcome = f.worker.submit(intent, principal);
    assert.equal(outcome.kind, "reserved");
    if (outcome.kind === "reserved") assert.equal(outcome.record.status, "state_observed");
    assert.equal(readCommitted(f.directory).status, "state_observed");
    assert.equal(f.worker.submit(intent, principal).kind, "duplicate");
    assert.equal(socket.sent.filter((message) => message.type === "call_service").length, 1);
  });
});

test("a result commit failure after a real adapter write stops the worker and reopens as unknown", async (t) => {
  const f = fixture(t);
  const socket = await connect(f);
  socket.onService = (message) => {
    assert.equal(readCommitted(f.directory).status, "dispatching");
    f.failCommit();
    socket.result(message.id, { context: { id: "integration-context" } });
  };
  const intent = command();
  assert.deepEqual(f.worker.submit(intent, principal), { kind: "refused", reason: "storage_unavailable" });
  assert.equal(f.worker.health(), "storage-failed");
  assert.equal(f.adapter.getSnapshot(), null);
  assert.equal(socket.sent.filter((message) => message.type === "call_service").length, 1);
  const reopened = new SqliteLightJournal({ directory: f.directory, binding });
  try {
    assert.equal(reopened.read()[0].status, "outcome_unknown");
    assert.equal(reopened.reserve(intent, principal, { binding, entityId: socket.entityId, canSetPower: true }, () => true, Date.now()).kind, "duplicate");
  } finally { reopened.close(); }
});

test("a registry rename interrupts pending work; reconnect discovers its new address without replay", async (t) => {
  const f = fixture(t);
  const first = await connect(f);
  const oldSession = f.adapter.getSnapshot()!.sessionId;
  const intent = command();
  const pending = f.worker.submit(intent, principal);
  assert.equal(pending.kind, "reserved");
  if (pending.kind === "reserved") assert.equal(pending.record.status, "dispatching");
  first.event("entity_registry_updated", { action: "update", entity_id: "light.renamed", old_entity_id: first.entityId });
  assert.equal(f.adapter.getSnapshot(), null);
  assert.equal(readCommitted(f.directory).status, "outcome_unknown");
  f.rename("light.renamed");
  const second = await connect(f);
  assert.notEqual(f.adapter.getSnapshot()!.sessionId, oldSession);
  assert.equal(f.adapter.getSnapshot()!.light.entityId, "light.renamed");
  const retry = f.worker.submit(intent, principal);
  assert.equal(retry.kind, "duplicate");
  if (retry.kind === "duplicate") assert.equal(retry.record.status, "outcome_unknown");
  assert.equal(first.sent.filter((message) => message.type === "call_service").length, 1);
  assert.equal(second.sent.filter((message) => message.type === "call_service").length, 0);
});
