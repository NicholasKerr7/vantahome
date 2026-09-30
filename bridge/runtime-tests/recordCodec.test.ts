import assert from "node:assert/strict";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { planLightAdmission } from "../lightAdmission";
import type { LightBinding, LightCommandRecord, LightObservation } from "../lightContract";
import { planLightDispatch, recordLightObservation, recordLightServiceResult } from "../lightLifecycle";
import { BridgeStorageError, preparePrivateDirectory, verifyPrivateFile } from "../runtime/privateStorage";
import { decodeLightRecord, MAX_RECORD_BYTES } from "../runtime/recordCodec";

const NOW = 1_800_000_000_000;
const binding: LightBinding = Object.freeze({
  homeId: "home-codec", bridgeId: "bridge-codec", integrationId: "integration-codec",
  deviceId: "device-codec", registryEntryId: "registry-codec",
});

/** Derive valid fixtures from the lifecycle instead of duplicating its transition rules. */
function lifecycleRecords() {
  const principal = { homeId: binding.homeId, actorId: "owner-codec" };
  const light = { binding, entityId: "light.codec", canSetPower: true };
  const command = { deviceId: binding.deviceId, op: "toggle", on: true,
    commandId: "command-codec", nonce: "nonce-codec", idempotencyKey: "key-codec",
    createdAt: NOW, expiresAt: NOW + 30_000 };
  const authorize = () => true;
  const admission = planLightAdmission([], command, principal, light, authorize, NOW);
  assert.equal(admission.kind, "reserved");
  if (admission.kind !== "reserved") throw new Error("Expected a canonical reservation");
  const observation: LightObservation = {
    binding, entityId: light.entityId, sessionId: "session-codec", revision: 1,
    observedAt: NOW, receivedAt: NOW, availability: "available", isOn: false,
    assumedState: false, contextId: null,
  };
  const dispatching = planLightDispatch(admission.record, light,
    { sessionId: observation.sessionId, requestId: 10, observation },
    authorize, NOW + 1, admission.journal).record;
  const completed = recordLightServiceResult(dispatching,
    { type: "result", id: 10, success: true, result: { context: { id: "context-codec" } } },
    observation.sessionId, authorize, NOW + 2);
  const observed = recordLightObservation(completed, {
    ...observation, revision: 2, isOn: true, contextId: "context-codec",
    observedAt: NOW + 3, receivedAt: NOW + 4,
  }, authorize, NOW + 4);
  assert.equal(observed.status, "state_observed");
  return { reserved: admission.record, dispatching, completed, observed };
}

const { reserved, dispatching, completed, observed } = lifecycleRecords();
assert.ok(observed.observation);
const evidence = observed.observation;

test("historical canonical phases round-trip without applying today's admission freshness", () => {
  const records: LightCommandRecord[] = [reserved, dispatching, completed, observed,
    ...(["expired", "refused", "unavailable"] as const).map((status) => ({ ...reserved, status })),
    { ...completed, status: "outcome_unknown", observation: null },
  ];
  for (const record of records) assert.deepEqual(decodeLightRecord(JSON.stringify(record), binding), record);
});

test("decoded records and all nested authority, intent and evidence fields are immutable copies", () => {
  const source = structuredClone(observed);
  const decoded = decodeLightRecord(JSON.stringify(source), binding);
  assert.ok(decoded?.observation);
  for (const value of [decoded, decoded.command, decoded.principal, decoded.binding,
    decoded.observation, decoded.observation.binding]) assert.ok(Object.isFrozen(value));
  assert.notEqual(decoded.command, source.command);
  assert.notEqual(decoded.binding, binding);
  assert.notEqual(decoded.observation.binding, source.observation?.binding);
  assert.throws(() => Object.assign(decoded.command, { on: false }), TypeError);
  assert.throws(() => Object.assign(decoded.observation!.binding, { homeId: "other-home" }), TypeError);
  assert.equal(decoded.command.on, true);
  assert.equal(decoded.observation.binding.homeId, binding.homeId);
});

const invalidRecords: { name: string; record: unknown }[] = [
  { name: "extra top-level credential", record: { ...reserved, accessToken: "synthetic-secret" } },
  { name: "extra command credential", record: { ...reserved, command: { ...reserved.command, authorization: "synthetic-secret" } } },
  { name: "extra principal authority", record: { ...reserved, principal: { ...reserved.principal, role: "owner" } } },
  { name: "extra binding credential", record: { ...reserved, binding: { ...binding, token: "synthetic-secret" } } },
  { name: "extra observation credential", record: { ...observed, observation: { ...evidence, accessToken: "synthetic-secret" } } },
  { name: "extra observation binding credential", record: { ...observed, observation: { ...evidence, binding: { ...binding, token: "synthetic-secret" } } } },
  { name: "missing canonical field", record: { ...reserved, requestId: undefined } },
  { name: "prototype payload", record: JSON.parse('{"__proto__":{"role":"owner"}}') as unknown },
  { name: "different command device", record: { ...reserved, command: { ...reserved.command, deviceId: "another-device" } } },
  { name: "different principal home", record: { ...reserved, principal: { ...reserved.principal, homeId: "another-home" } } },
  { name: "missing actor identity", record: { ...reserved, principal: { homeId: binding.homeId, actorId: "" } } },
  { name: "invented confirmed status", record: { ...observed, status: "confirmed" } },
  { name: "reserved record with dispatch session", record: { ...reserved, sessionId: "session-codec" } },
  { name: "reserved record with request identity", record: { ...reserved, requestId: 10 } },
  { name: "reserved record with observed evidence", record: { ...reserved, observation: evidence } },
  { name: "reserved record with revision watermark", record: { ...reserved, lastRevision: 1 } },
  { name: "reserved record with service context", record: { ...reserved, serviceContextId: "context-codec" } },
  { name: "dispatched record without timestamp", record: { ...dispatching, dispatchedAt: null } },
  { name: "dispatched record without session", record: { ...dispatching, sessionId: null } },
  { name: "dispatched record without entity", record: { ...dispatching, entityId: null } },
  { name: "non-light dispatch entity", record: { ...dispatching, entityId: "switch.codec" } },
  { name: "zero service request identity", record: { ...dispatching, requestId: 0 } },
  { name: "zero dispatch revision", record: { ...dispatching, lastRevision: 0 } },
  { name: "dispatching record with premature service completion", record: { ...dispatching, serviceContextId: "context-codec" } },
  { name: "pre-send refusal with dispatch metadata", record: { ...dispatching, status: "refused" } },
  { name: "unknown outcome retaining apparent evidence", record: { ...observed, status: "outcome_unknown" } },
  { name: "observed terminal without evidence", record: { ...observed, observation: null } },
  { name: "observed terminal without service completion context", record: { ...observed, serviceContextId: null } },
  { name: "unrelated observation session", record: { ...observed, observation: { ...evidence, sessionId: "other-session" } } },
  { name: "unrelated observation entity", record: { ...observed, observation: { ...evidence, entityId: "light.other" } } },
  { name: "unrelated observation registry entry", record: { ...observed, observation: { ...evidence, binding: { ...binding, registryEntryId: "other-entry" } } } },
  { name: "unrelated service context", record: { ...observed, observation: { ...evidence, contextId: "other-context" } } },
  { name: "uncorrelated observation context", record: { ...observed, observation: { ...evidence, contextId: null } } },
  { name: "different reported power", record: { ...observed, observation: { ...evidence, isOn: false } } },
  { name: "assumed reported power", record: { ...observed, observation: { ...evidence, assumedState: true } } },
  { name: "unavailable reported state", record: { ...observed, observation: { ...evidence, availability: "unavailable", isOn: null } } },
  { name: "unknown reported state", record: { ...observed, observation: { ...evidence, availability: "unknown", isOn: null } } },
  { name: "observation revision mismatch", record: { ...observed, observation: { ...evidence, revision: evidence.revision + 1 } } },
  { name: "initial dispatch revision reused as new evidence", record: { ...observed, lastRevision: 1, observation: { ...evidence, revision: 1 } } },
  { name: "watermark newer than retained evidence", record: { ...observed, lastObservedAt: evidence.observedAt + 1 } },
  { name: "state observed before dispatch", record: { ...observed, observation: { ...evidence, observedAt: NOW } } },
  { name: "state received before dispatch", record: { ...observed, observation: { ...evidence, receivedAt: NOW } } },
  { name: "state received after its command deadline", record: { ...observed, observation: { ...evidence, receivedAt: observed.command.expiresAt } } },
  { name: "state observed after its command deadline", record: { ...observed, lastObservedAt: observed.command.expiresAt,
    observation: { ...evidence, observedAt: observed.command.expiresAt, receivedAt: observed.command.expiresAt } } },
  { name: "dispatch before permitted clock skew", record: { ...dispatching, dispatchedAt: NOW - 5_001 } },
  { name: "dispatch at command expiry", record: { ...dispatching, dispatchedAt: dispatching.command.expiresAt } },
  { name: "nonintegral dispatch time", record: { ...dispatching, dispatchedAt: NOW + 0.5 } },
  { name: "negative observation watermark", record: { ...dispatching, lastObservedAt: -1 } },
  { name: "unsafe revision integer", record: { ...observed, lastRevision: Number.MAX_SAFE_INTEGER + 1 } },
  { name: "nonfinite command time", record: { ...reserved, command: { ...reserved.command, createdAt: Infinity } } },
  { name: "string command timestamp", record: { ...reserved, command: { ...reserved.command, createdAt: String(NOW) } } },
  { name: "reversed command interval", record: { ...reserved, command: { ...reserved.command, expiresAt: NOW - 1 } } },
  { name: "excessive command lifetime", record: { ...reserved, command: { ...reserved.command, expiresAt: NOW + 60_001 } } },
];

for (const { name, record } of invalidRecords) {
  test(`corrupt records reject ${name}`, () => {
    assert.equal(decodeLightRecord(JSON.stringify(record), binding), null);
  });
}

for (const key of Object.keys(binding) as (keyof LightBinding)[]) {
  test(`records cannot be replayed under a different ${key}`, () => {
    assert.equal(decodeLightRecord(JSON.stringify(observed), { ...binding, [key]: "other-scope" }), null);
  });
}

test("broken, non-record and oversized JSON fail closed without throwing", () => {
  for (const json of ["", "{", "null", "[]", "true", "42", JSON.stringify("record"),
    `${JSON.stringify(reserved)} trailing`, `"${"é".repeat(MAX_RECORD_BYTES / 2)}"`]) {
    assert.equal(decodeLightRecord(json, binding), null);
  }
});

/** Remove only this test's owned directory after all filesystem assertions finish. */
function privateDirectory(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "vanta-private-storage-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/** Check sanitized errors without relying on platform-specific filesystem messages. */
function isPrivateStorageError(error: unknown): boolean {
  return error instanceof BridgeStorageError && error.code === "storage_unavailable" && error.message === error.code;
}

test("private storage creates owned directories and files with private permissions", (t) => {
  const directory = join(privateDirectory(t), "journal");
  assert.equal(preparePrivateDirectory(directory), directory);
  assert.equal(lstatSync(directory).mode & 0o077, 0);
  const file = join(directory, "commands.sqlite");
  verifyPrivateFile(file, true);
  assert.equal(lstatSync(file).mode & 0o077, 0);
  assert.equal(lstatSync(file).nlink, 1);
  assert.doesNotThrow(() => verifyPrivateFile(file, true));
  assert.doesNotThrow(() => verifyPrivateFile(`${file}-wal`));
});

test("private storage rejects shared directories without silently changing permissions", (t) => {
  const directory = privateDirectory(t);
  chmodSync(directory, 0o750);
  assert.throws(() => preparePrivateDirectory(directory), isPrivateStorageError);
  assert.equal(lstatSync(directory).mode & 0o777, 0o750);
});

test("private storage rejects symbolic directory and file links without following targets", (t) => {
  const directory = privateDirectory(t);
  const targetDirectory = join(directory, "actual");
  mkdirSync(targetDirectory, { mode: 0o700 });
  const directoryLink = join(directory, "directory-link");
  symlinkSync(targetDirectory, directoryLink);
  assert.throws(() => preparePrivateDirectory(directoryLink), isPrivateStorageError);
  const target = join(targetDirectory, "target");
  writeFileSync(target, "preserve", { mode: 0o600 });
  const fileLink = join(directory, "commands.sqlite");
  symlinkSync(target, fileLink);
  for (const create of [false, true]) assert.throws(() => verifyPrivateFile(fileLink, create), isPrivateStorageError);
  assert.equal(readFileSync(target, "utf8"), "preserve");
});

test("private storage rejects readable, hard-linked and non-file SQLite paths", (t) => {
  const directory = privateDirectory(t);
  const file = join(directory, "commands.sqlite");
  writeFileSync(file, "preserve", { mode: 0o600 });
  chmodSync(file, 0o640);
  assert.throws(() => verifyPrivateFile(file), isPrivateStorageError);
  assert.equal(lstatSync(file).mode & 0o777, 0o640);
  chmodSync(file, 0o600);
  const hardLink = join(directory, "shared.sqlite");
  linkSync(file, hardLink);
  for (const path of [file, hardLink, directory]) assert.throws(() => verifyPrivateFile(path), isPrivateStorageError);
  assert.equal(readFileSync(file, "utf8"), "preserve");
});
