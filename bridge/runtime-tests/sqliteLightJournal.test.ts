import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { LightCommandRecord, LightPowerCommand } from "../lightContract";
import { planLightDispatch, recordLightObservation, recordLightServiceResult } from "../lightLifecycle";
import { BridgeStorageError, SqliteLightJournal } from "../runtime/sqliteLightJournal";

const binding = Object.freeze({
  homeId: "home-test", bridgeId: "bridge-test", integrationId: "ha-test",
  deviceId: "light-test", registryEntryId: "registry-test",
});
const principal = Object.freeze({ actorId: "owner-test", homeId: binding.homeId });
const light = Object.freeze({ binding, entityId: "light.test", canSetPower: true });
const allowed = () => true;

/** Use explicit intent and a caller-controlled clock, with no application state or network. */
function command(now: number, id = "one"): LightPowerCommand {
  return Object.freeze({
    deviceId: binding.deviceId, op: "toggle", on: true,
    commandId: `command-${id}`, nonce: `nonce-${id}`, idempotencyKey: `intent-${id}`,
    createdAt: now, expiresAt: now + 30_000,
  });
}

/** Give every case its own private journal and remove it after handles close. */
function temporaryDirectory(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "vantahome-journal-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/** Obtain a real planned dispatch record so persistence tests respect lifecycle invariants. */
function dispatch(journal: SqliteLightJournal, intent: LightPowerCommand, now: number): LightCommandRecord {
  const result = journal.update(intent.commandId, (record, rows) => planLightDispatch(
    record, light, {
      sessionId: "session-test", requestId: 10,
      observation: {
        binding, entityId: light.entityId, sessionId: "session-test", revision: 1,
        observedAt: now, receivedAt: now, availability: "available", isOn: false,
        assumedState: false, contextId: null,
      },
    }, allowed, now, rows,
  ).record);
  assert.equal(result?.status, "dispatching");
  return result!;
}

/** Match a sanitized journal failure without leaking filesystem or SQLite details. */
function hasCode(code: BridgeStorageError["code"]): (error: unknown) => boolean {
  return (error) => error instanceof BridgeStorageError && error.code === code && error.message === code;
}

/** Kill a separate process without graceful cleanup, exercising actual SQLite recovery. */
function crashChild(directory: string, stage: "reserved" | "dispatching" | "uncommitted") {
  const modulePath = resolve(__dirname, "../runtime/sqliteLightJournal.js");
  const source = `
    const { SqliteLightJournal } = require(${JSON.stringify(modulePath)});
    const binding = ${JSON.stringify(binding)};
    const principal = ${JSON.stringify(principal)};
    const light = ${JSON.stringify(light)};
    const stage = process.argv[2];
    let killOnCommit = false;
    const journal = new SqliteLightJournal({ directory: process.argv[1], binding,
      beforeCommit() { if (killOnCommit) process.kill(process.pid, 'SIGKILL'); } });
    const now = Date.now();
    const intent = { deviceId: binding.deviceId, op: 'toggle', on: true,
      commandId: 'command-child', nonce: 'nonce-child', idempotencyKey: 'intent-child',
      createdAt: now, expiresAt: now + 30000 };
    if (stage === 'uncommitted') killOnCommit = true;
    journal.reserve(intent, principal, light, () => true, now);
    if (stage === 'dispatching') journal.update(intent.commandId, record => ({ ...record,
      status: 'dispatching', sessionId: 'session-child', entityId: light.entityId,
      requestId: 1, dispatchedAt: now, lastRevision: 1, lastObservedAt: now }));
    process.kill(process.pid, 'SIGKILL');
  `;
  return spawnSync(process.execPath, ["-e", source, directory, stage], { encoding: "utf8", timeout: 10_000 });
}

test("journal survives abrupt process death with replay identity and conservative recovery", (t) => {
  for (const stage of ["reserved", "dispatching"] as const) {
    const directory = temporaryDirectory(t);
    const child = crashChild(directory, stage);
    assert.equal(child.signal, "SIGKILL", child.stderr);
    const journal = new SqliteLightJournal({ directory, binding });
    try {
      const [record] = journal.read();
      assert.equal(record.status, stage === "reserved" ? "unavailable" : "outcome_unknown");
      assert.equal(record.observation, null);
      const retry = journal.reserve(record.command, principal, light, allowed, record.command.createdAt + 1);
      assert.equal(retry.kind, "duplicate");
      assert.equal(journal.read().length, 1);
    } finally { journal.close(); }
  }
});

test("an actual kill before reservation COMMIT rolls back the incomplete row", (t) => {
  const directory = temporaryDirectory(t);
  const child = crashChild(directory, "uncommitted");
  assert.equal(child.signal, "SIGKILL", child.stderr);
  const journal = new SqliteLightJournal({ directory, binding });
  try { assert.deepEqual(journal.read(), []); } finally { journal.close(); }
});

test("a second process cannot recover or alter the active worker's reservation", (t) => {
  const directory = temporaryDirectory(t);
  const journal = new SqliteLightJournal({ directory, binding });
  try {
    const now = Date.now();
    journal.reserve(command(now), principal, light, allowed, now);
    assert.throws(() => new SqliteLightJournal({ directory, binding }), hasCode("runtime_busy"));
    const source = `
      const { SqliteLightJournal } = require(${JSON.stringify(resolve(__dirname, "../runtime/sqliteLightJournal.js"))});
      try { const journal = new SqliteLightJournal({ directory: process.argv[1], binding: ${JSON.stringify(binding)} });
        journal.close(); process.exitCode = 3;
      } catch (error) { process.stdout.write(error.code || 'unexpected'); }
    `;
    const child = spawnSync(process.execPath, ["-e", source, directory], { encoding: "utf8", timeout: 10_000 });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "runtime_busy");
    assert.equal(journal.read()[0].status, "reserved");
  } finally { journal.close(); }
});

test("reservation commit failure persists nothing and permanently closes admission for the instance", (t) => {
  const directory = temporaryDirectory(t);
  let fail = false;
  const journal = new SqliteLightJournal({ directory, binding, beforeCommit: () => { if (fail) throw new Error("injected"); } });
  const now = Date.now();
  fail = true;
  assert.throws(() => journal.reserve(command(now), principal, light, allowed, now), hasCode("storage_unavailable"));
  fail = false;
  assert.throws(() => journal.read(), hasCode("storage_unavailable"));
  journal.close();
  const reopened = new SqliteLightJournal({ directory, binding });
  try { assert.deepEqual(reopened.read(), []); } finally { reopened.close(); }
});

test("dispatch commit failure leaves a pre-send reservation, never committed dispatch intent", (t) => {
  const directory = temporaryDirectory(t);
  let fail = false;
  const journal = new SqliteLightJournal({ directory, binding, beforeCommit: () => { if (fail) throw new Error("injected"); } });
  const now = Date.now();
  const intent = command(now);
  journal.reserve(intent, principal, light, allowed, now);
  fail = true;
  assert.throws(() => dispatch(journal, intent, now + 1), hasCode("storage_unavailable"));
  journal.close();
  const reopened = new SqliteLightJournal({ directory, binding });
  try {
    const [record] = reopened.read();
    assert.equal(record.status, "unavailable");
    assert.equal(record.dispatchedAt, null);
    assert.equal(record.requestId, null);
  } finally { reopened.close(); }
});

test("service completion becomes outcome_unknown after restart without losing command identity", (t) => {
  const directory = temporaryDirectory(t);
  const journal = new SqliteLightJournal({ directory, binding });
  const now = Date.now();
  const intent = command(now);
  journal.reserve(intent, principal, light, allowed, now);
  dispatch(journal, intent, now + 1);
  const completed = journal.update(intent.commandId, (record) => recordLightServiceResult(record,
    { type: "result", id: 10, success: true, result: { context: { id: "context-test" } } },
    "session-test", allowed, now + 2));
  assert.equal(completed?.status, "service_completed");
  journal.close();
  const reopened = new SqliteLightJournal({ directory, binding });
  try {
    assert.equal(reopened.read()[0].status, "outcome_unknown");
    assert.equal(reopened.reserve(intent, principal, light, allowed, now + 3).kind, "duplicate");
  } finally { reopened.close(); }
});

test("terminal observed evidence remains immutable across close/reopen and attempted rewrites", (t) => {
  const directory = temporaryDirectory(t);
  const journal = new SqliteLightJournal({ directory, binding });
  const now = Date.now();
  const intent = command(now);
  journal.reserve(intent, principal, light, allowed, now);
  dispatch(journal, intent, now + 1);
  journal.update(intent.commandId, (record) => recordLightServiceResult(record,
    { type: "result", id: 10, success: true, result: { context: { id: "context-test" } } },
    "session-test", allowed, now + 2));
  const terminal = journal.update(intent.commandId, (record) => recordLightObservation(record, {
    binding, entityId: light.entityId, sessionId: "session-test", revision: 2,
    observedAt: now + 3, receivedAt: now + 3, availability: "available", isOn: true,
    assumedState: false, contextId: "context-test",
  }, allowed, now + 3));
  assert.equal(terminal?.status, "state_observed");
  journal.close();
  const reopened = new SqliteLightJournal({ directory, binding });
  try {
    assert.deepEqual(reopened.read()[0], terminal);
    assert.ok(Object.isFrozen(reopened.read()[0].command));
    assert.throws(() => reopened.update(intent.commandId, (record) => ({ ...record, status: "outcome_unknown", observation: null })), hasCode("invalid_journal"));
  } finally { reopened.close(); }
  const verified = new SqliteLightJournal({ directory, binding });
  try { assert.deepEqual(verified.read()[0], terminal); } finally { verified.close(); }
});

test("future schema and a different trusted binding fail closed without resetting stored evidence", (t) => {
  const directory = temporaryDirectory(t);
  const journal = new SqliteLightJournal({ directory, binding });
  const now = Date.now();
  journal.reserve(command(now), principal, light, allowed, now);
  journal.close();
  assert.throws(() => new SqliteLightJournal({ directory, binding: { ...binding, homeId: "other-home" } }), hasCode("scope_mismatch"));
  const db = new DatabaseSync(join(directory, "commands.sqlite"));
  db.exec("PRAGMA user_version = 99");
  db.close();
  assert.throws(() => new SqliteLightJournal({ directory, binding }), hasCode("invalid_journal"));
  const inspect = new DatabaseSync(join(directory, "commands.sqlite"), { readOnly: true });
  try {
    assert.equal(inspect.prepare("PRAGMA user_version").get()?.user_version, 99);
    assert.equal(inspect.prepare("SELECT count(*) AS total FROM light_commands").get()?.total, 1);
  } finally { inspect.close(); }
});

test("malformed persisted records are refused rather than trusted or silently discarded", (t) => {
  const directory = temporaryDirectory(t);
  const journal = new SqliteLightJournal({ directory, binding });
  const now = Date.now();
  journal.reserve(command(now), principal, light, allowed, now);
  journal.close();
  const db = new DatabaseSync(join(directory, "commands.sqlite"));
  db.prepare("UPDATE light_commands SET record = ?").run('{"status":"state_observed"}');
  db.close();
  assert.throws(() => new SqliteLightJournal({ directory, binding }), hasCode("invalid_journal"));
  const inspect = new DatabaseSync(join(directory, "commands.sqlite"), { readOnly: true });
  try { assert.equal(inspect.prepare("SELECT count(*) AS total FROM light_commands").get()?.total, 1); }
  finally { inspect.close(); }
});

test("retained replay keys reject conflicting intent after restart and enforce bounded capacity", (t) => {
  const directory = temporaryDirectory(t);
  const journal = new SqliteLightJournal({ directory, binding });
  const now = Date.now();
  for (let index = 0; index < 32; index++) {
    const intent = command(now, String(index));
    assert.equal(journal.reserve(intent, principal, light, allowed, now).kind, "reserved");
    journal.update(intent.commandId, (record) => ({ ...record, status: "unavailable" }));
  }
  journal.close();
  const reopened = new SqliteLightJournal({ directory, binding });
  try {
    const conflict = reopened.reserve({ ...command(now, "0"), on: false }, principal, light, allowed, now);
    assert.deepEqual(conflict, { kind: "refused", reason: "conflict" });
    assert.deepEqual(reopened.reserve(command(now, "overflow"), principal, light, allowed, now), { kind: "refused", reason: "capacity" });
    assert.equal(reopened.read().length, 32);
  } finally { reopened.close(); }
});
