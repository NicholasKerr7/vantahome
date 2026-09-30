import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { LightBinding, LightCommandRecord, LightObservation, LightPowerCommand } from "../lightContract";
import type { LightServiceCall } from "../lightLifecycle";
import { LightWorker } from "../runtime/lightWorker";
import { SqliteLightJournal } from "../runtime/sqliteLightJournal";
import type { LightAdapter, LightAdapterEvent, LightAdapterSnapshot } from "../runtime/types";

const NOW = 1_800_000_000_000;
const binding: LightBinding = { homeId: "home-a", bridgeId: "bridge-a", integrationId: "ha-a", deviceId: "light-a", registryEntryId: "registry-a" };
const principal = { homeId: "home-a", actorId: "owner-a" };

/** Produce explicit invented commands; no test addresses a physical household. */
function command(id = "one", patch: Partial<LightPowerCommand> = {}): LightPowerCommand {
  return { op: "toggle", on: true, deviceId: "light-a", commandId: `command-${id}`, nonce: `nonce-${id}`,
    idempotencyKey: `key-${id}`, createdAt: NOW, expiresAt: NOW + 20_000, ...patch };
}

/** Test transport emits only injected events and records inert service descriptions. */
class TestAdapter implements LightAdapter {
  calls: LightServiceCall[] = [];
  listeners = new Set<(event: LightAdapterEvent) => void>();
  nextId = 10;
  closed = false;
  throwOnSend = false;
  onSend?: (call: LightServiceCall) => void;
  snapshot: LightAdapterSnapshot = {
    light: { binding, entityId: "light.study", canSetPower: true }, sessionId: "session-a",
    observation: { binding, entityId: "light.study", sessionId: "session-a", revision: 1, observedAt: NOW - 1000,
      receivedAt: NOW, availability: "available", isOn: false, assumedState: false, contextId: null },
  };
  /** Return no usable state after disconnect. */
  getSnapshot() { return this.closed ? null : this.snapshot; }
  /** Share a monotonically increasing request sequence. */
  allocateRequestId() { return this.nextId++; }
  /** Capture the send boundary and optionally inject a synchronous result/failure. */
  send(call: LightServiceCall) {
    this.calls.push(call);
    if (this.throwOnSend) throw new Error("synthetic_socket_error");
    this.onSend?.(call);
  }
  /** Subscribe a worker to invented integration events. */
  subscribe(listener: (event: LightAdapterEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  /** End the invented session and notify listeners exactly once. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit({ type: "disconnected", sessionId: "session-a" });
  }
  /** Deliver explicit test evidence, including deliberately late or invalid frames. */
  emit(event: LightAdapterEvent) { for (const listener of this.listeners) listener(event); }
  /** Emit the last inert call's HA completion, not an observation. */
  result(sessionId = "session-a") {
    this.emit({ type: "service-result", sessionId,
      input: { id: this.calls.at(-1)?.id, type: "result", success: true, result: { context: { id: "context-a" }, response: null } } });
  }
  /** Emit a matching fresh observation, with overrides for negative cases. */
  observe(patch: Partial<LightObservation> = {}) {
    this.emit({ type: "observation", observation: { ...this.snapshot.observation, revision: 2,
      observedAt: NOW + 1, receivedAt: NOW + 1, isOn: true, contextId: "context-a", ...patch } });
  }
}

/** Each test owns actual temporary SQLite files and a deterministic logical clock. */
function harness(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "vanta-worker-"));
  const adapter = new TestAdapter();
  let now = NOW;
  let allowed = true;
  let failStatus: LightCommandRecord["status"] | null = null;
  let journal: SqliteLightJournal | undefined;
  journal = new SqliteLightJournal({ directory, binding, beforeCommit: () => {
    if (failStatus && journal?.read().some((record) => record.status === failStatus)) throw new Error("synthetic_commit_failure");
  } });
  const worker = new LightWorker({ journal, adapter, authorize: (actor) => allowed && actor.actorId === principal.actorId,
    clock: () => now, tickIntervalMs: 0 });
  t.after(() => { worker.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, adapter, journal, worker,
    time: (value: number) => { now = value; }, revoke: () => { allowed = false; },
    failCommit: (value: LightCommandRecord["status"]) => { failStatus = value; } };
}

for (const order of ["result-first", "observation-first"]) {
  test(`durably records correlated evidence ${order}`, (t) => {
    const { worker, adapter, journal, time } = harness(t);
    assert.equal(worker.submit(command(), principal).kind, "reserved");
    assert.equal(journal.read()[0].status, "dispatching");
    time(NOW + 1);
    if (order === "result-first") { adapter.result(); adapter.observe(); }
    else { adapter.observe(); adapter.result(); }
    assert.equal(worker.receipt("command-one", principal)?.status, "state_observed");
    assert.equal(journal.read()[0].observation?.isOn, true);
    assert.equal(adapter.calls.length, 1);
  });
}

test("service completion alone never reports observed state", (t) => {
  const { worker, adapter } = harness(t);
  worker.submit(command(), principal);
  adapter.result();
  assert.equal(worker.receipt("command-one", principal)?.status, "service_completed");
});

test("dispatch has been committed before a synchronous adapter callback", (t) => {
  const { worker, adapter, journal, time } = harness(t);
  adapter.onSend = () => {
    assert.equal(journal.read()[0].status, "dispatching");
    time(NOW + 1);
    adapter.observe();
    adapter.result();
  };
  const receipt = worker.submit(command(), principal);
  assert.equal(receipt.kind, "reserved");
  assert.equal(receipt.record.status, "state_observed");
});

test("exact retry returns one persisted receipt while conflicting reuse is rejected", (t) => {
  const { worker, adapter } = harness(t);
  worker.submit(command(), principal);
  assert.equal(worker.submit(command(), principal).kind, "duplicate");
  assert.deepEqual(worker.submit(command("one", { on: false }), principal), { kind: "refused", reason: "conflict" });
  assert.deepEqual(worker.submit(command("two"), principal), { kind: "refused", reason: "busy" });
  assert.equal(adapter.calls.length, 1);
});

test("another actor or home cannot inspect the owner's receipt", (t) => {
  const { worker } = harness(t);
  worker.submit(command(), principal);
  assert.equal(worker.receipt("command-one", { ...principal, actorId: "guest" }), null);
  assert.equal(worker.receipt("command-one", { ...principal, homeId: "home-b" }), null);
});

test("permission denial, implicit toggles and wrong device never dispatch", (t) => {
  const { worker, adapter, revoke } = harness(t);
  assert.equal(worker.submit({ ...command(), on: undefined }, principal).kind, "refused");
  assert.equal(worker.submit(command("one", { deviceId: "light-b" }), principal).kind, "refused");
  revoke();
  assert.deepEqual(worker.submit(command(), principal), { kind: "refused", reason: "permission_denied" });
  assert.equal(adapter.calls.length, 0);
});

test("wrong binding or stale baseline cannot cause a write", (t) => {
  const { worker, adapter } = harness(t);
  adapter.snapshot = { ...adapter.snapshot, observation: { ...adapter.snapshot.observation, receivedAt: NOW - 30_001 } };
  const receipt = worker.submit(command(), principal);
  assert.equal(receipt.kind, "reserved");
  assert.equal(receipt.record.status, "unavailable");
  adapter.snapshot = { ...adapter.snapshot, light: { ...adapter.snapshot.light, binding: { ...binding, homeId: "home-b" } } };
  assert.deepEqual(worker.submit(command("two"), principal), { kind: "refused", reason: "unavailable" });
  assert.equal(adapter.calls.length, 0);
});

test("transport allocation failure persists unavailability without poisoning storage", (t) => {
  const { worker, adapter, journal } = harness(t);
  adapter.allocateRequestId = () => { throw new Error("synthetic_session_loss"); };
  const receipt = worker.submit(command(), principal);
  assert.equal(receipt.kind, "reserved");
  assert.equal(receipt.record.status, "unavailable");
  assert.equal(worker.health(), "running");
  assert.equal(journal.read()[0].status, "unavailable");
  assert.equal(adapter.calls.length, 0);
});

test("transport snapshot errors return unavailable without throwing or touching storage", (t) => {
  const { worker, adapter, journal } = harness(t);
  adapter.getSnapshot = () => { throw new Error("synthetic_adapter_error"); };
  assert.deepEqual(worker.submit(command(), principal), { kind: "refused", reason: "unavailable" });
  assert.equal(worker.health(), "running");
  assert.equal(journal.read().length, 0);
});

test("expiry while integration is silent persists unknown outcome without replay", (t) => {
  const { worker, adapter, journal, time } = harness(t);
  worker.submit(command(), principal);
  time(NOW + 20_000);
  worker.tick();
  assert.equal(journal.read()[0].status, "outcome_unknown");
  adapter.result();
  adapter.observe();
  assert.equal(journal.read()[0].status, "outcome_unknown");
  assert.equal(adapter.calls.length, 1);
});

test("revocation invalidates in-flight work and hides its receipt", (t) => {
  const { worker, journal, revoke } = harness(t);
  worker.submit(command(), principal);
  revoke();
  worker.tick();
  assert.equal(journal.read()[0].status, "outcome_unknown");
  assert.equal(worker.receipt("command-one", principal), null);
});

test("wrong session, assumed state and wrong context cannot establish completion", (t) => {
  const { worker, adapter, journal, time } = harness(t);
  worker.submit(command(), principal);
  time(NOW + 1);
  adapter.result("session-other");
  assert.equal(journal.read()[0].status, "dispatching");
  adapter.result();
  adapter.observe({ assumedState: true });
  assert.equal(journal.read()[0].status, "service_completed");
  adapter.observe({ revision: 3, contextId: "unrelated" });
  assert.equal(journal.read()[0].status, "service_completed");
});

test("disconnect persists uncertainty and ignores late evidence", (t) => {
  const { worker, adapter, journal, time } = harness(t);
  worker.submit(command(), principal);
  adapter.close();
  time(NOW + 1);
  adapter.result(); adapter.observe();
  assert.equal(journal.read()[0].status, "outcome_unknown");
  assert.equal(adapter.calls.length, 1);
});

test("a thrown send is an uncertain effect, never an automatic retry", (t) => {
  const { worker, adapter, journal } = harness(t);
  adapter.throwOnSend = true;
  worker.submit(command(), principal);
  assert.equal(journal.read()[0].status, "outcome_unknown");
  worker.submit(command(), principal);
  assert.equal(adapter.calls.length, 1);
});

for (const status of ["reserved", "dispatching"] as const) {
  test(`${status} commit failure prevents all transport calls and survives reopen`, (t) => {
    const { worker, adapter, directory, failCommit } = harness(t);
    failCommit(status);
    assert.deepEqual(worker.submit(command(), principal), { kind: "refused", reason: "storage_unavailable" });
    assert.equal(worker.health(), "storage-failed");
    assert.equal(adapter.calls.length, 0);
    const reopened = new SqliteLightJournal({ directory, binding });
    try {
      assert.equal(reopened.read().length, status === "reserved" ? 0 : 1);
      if (status === "dispatching") assert.equal(reopened.read()[0].status, "unavailable");
    } finally { reopened.close(); }
  });
}

test("result commit failure closes transport and restart retains unknown outcome", (t) => {
  const { worker, adapter, directory, failCommit } = harness(t);
  worker.submit(command(), principal);
  failCommit("service_completed");
  adapter.result();
  assert.equal(worker.health(), "storage-failed");
  assert.equal(adapter.closed, true);
  assert.equal(adapter.calls.length, 1);
  const reopened = new SqliteLightJournal({ directory, binding });
  try { assert.equal(reopened.read()[0].status, "outcome_unknown"); }
  finally { reopened.close(); }
});

test("closing worker cancels outstanding work and cannot send again", (t) => {
  const { worker, adapter, directory } = harness(t);
  worker.submit(command(), principal);
  worker.close();
  assert.equal(worker.health(), "stopped");
  assert.deepEqual(worker.submit(command("two"), principal), { kind: "refused", reason: "unavailable" });
  const reopened = new SqliteLightJournal({ directory, binding });
  try { assert.equal(reopened.read()[0].status, "outcome_unknown"); }
  finally { reopened.close(); }
  assert.equal(adapter.calls.length, 1);
});
