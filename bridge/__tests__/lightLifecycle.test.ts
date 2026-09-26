import {
  type LightAuthorizer,
  type LightCommandRecord,
  type LightObservation,
  type LightPowerCommand,
  type PilotLight,
} from "../lightContract";
import { LIGHT_JOURNAL_CAPACITY, planLightAdmission } from "../lightAdmission";
import { discoverPilotLight, normalizeLightObservation } from "../homeAssistantLight";
import {
  expireLightCommand,
  interruptLightCommand,
  planLightDispatch,
  recordLightObservation,
  recordLightServiceResult,
  type LightServiceCall,
} from "../lightLifecycle";

const NOW = 1_800_000_000_000;
const binding = Object.freeze({
  homeId: "home-one", bridgeId: "bridge-one", integrationId: "integration-one",
  deviceId: "vanta-light-one", registryEntryId: "registry-light-one",
});
const principal = Object.freeze({ actorId: "owner-one", homeId: binding.homeId });
const allow: LightAuthorizer = () => true;

/** Synthetic envelope only; no household identifiers or transport are used. */
function command(overrides: Partial<LightPowerCommand> = {}): LightPowerCommand {
  return {
    deviceId: binding.deviceId, op: "toggle", on: true, commandId: "command-one",
    nonce: "nonce-one", idempotencyKey: "intent-one", createdAt: NOW,
    expiresAt: NOW + 15_000, ...overrides,
  };
}

/** Discover a synthetic color light by stable ID, independently of its current name. */
function light(entityId = "light.hue_fixture"): PilotLight {
  const result = discoverPilotLight([
    { id: binding.registryEntryId, entity_id: entityId, disabled_by: null },
  ], binding);
  if (!result) throw new Error("Invalid discovery fixture.");
  return result;
}

/** Construct a validated reported state; matching desired state is not assumed. */
function observation(overrides: Partial<LightObservation> = {}): LightObservation {
  const result = normalizeLightObservation({
    entity_id: "light.hue_fixture", state: "on", attributes: { supported_color_modes: ["xy"] },
    last_updated: new Date(NOW + 1000).toISOString(), context: { id: "context-one" },
  }, light(), { sessionId: "session-one", revision: 2, receivedAt: NOW + 1000 });
  if (!result) throw new Error("Invalid observation fixture.");
  return { ...result, ...overrides };
}

/** Build a model-owned reservation, not an assertion of durable storage. */
function reserve(input = command()): LightCommandRecord {
  const admission = planLightAdmission([], input, principal, light(), allow, NOW);
  if (admission.kind !== "reserved") throw new Error("Invalid admission fixture.");
  return admission.record;
}

/** Advance once with a fresh known baseline; the returned call is inert data. */
function dispatch(record = reserve(), journal: readonly LightCommandRecord[] = [record]) {
  return planLightDispatch(record, light(), {
    sessionId: "session-one", requestId: 7,
    observation: observation({ revision: 1, isOn: false, observedAt: NOW - 1000, receivedAt: NOW }),
  }, allow, NOW, journal);
}

/** Model HA's response without fabricating any device-state observation. */
function response(contextId: string | null = "context-one") {
  return { id: 7, type: "result", success: true, result: { context: contextId === null ? null : { id: contextId } } };
}

/** Exercise the ordinary service-result-first ordering. */
function completed() {
  return recordLightServiceResult(dispatch().record, response(), "session-one", allow, NOW + 500);
}

describe("offline one-light admission and replay contract", () => {
  test("admits explicit power without changing live state or sending anything", () => {
    const record = reserve();
    expect(record.status).toBe("reserved");
    expect(record.observation).toBeNull();
    expect(record.dispatchedAt).toBeNull();
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.principal)).toBe(true);
  });

  test.each([
    ["wrong home", { ...principal, homeId: "other-home" }, allow, light()],
    ["denied action", principal, () => false, light()],
    ["policy failure", principal, () => { throw new Error("private policy detail"); }, light()],
    ["unsupported power", principal, allow, { ...light(), canSetPower: false }],
    ["wrong device", principal, allow, { ...light(), binding: { ...binding, deviceId: "other-device" } }],
  ] as const)("refuses %s before any reservation", (_name, actor, authorize, target) => {
    const result = planLightAdmission([], command(), actor, target, authorize, NOW);
    expect(result.kind).toBe("refused");
    expect(JSON.stringify(result)).not.toContain("private policy detail");
  });

  test.each(["reserved", "dispatching", "service_completed", "state_observed", "outcome_unknown"] as const)(
    "returns an exact %s duplicate without creating another record", (status) => {
      const record = Object.freeze({ ...reserve(), status });
      const journal = Object.freeze([record]);
      expect(planLightAdmission(journal, command(), principal, light(), allow, NOW + 1))
        .toEqual({ kind: "duplicate", record, journal });
    },
  );

  test.each([
    { on: false }, { deviceId: "another-device" }, { expiresAt: NOW + 16_000 },
    { createdAt: NOW - 1 }, { commandId: "different" }, { nonce: "different" },
    { idempotencyKey: "different" },
  ])("rejects reuse of any reserved identity with changed intent: %j", (changes) => {
    const input = command(changes);
    const target = { ...light(), binding: { ...binding, deviceId: input.deviceId } };
    expect(planLightAdmission([reserve()], input, principal, target, allow, NOW).kind).toBe("refused");
  });

  test("cannot read a previous actor's result or reuse a nonce for another actor/home", () => {
    expect(planLightAdmission([reserve()], command(), { ...principal, actorId: "other" }, light(), allow, NOW))
      .toEqual({ kind: "refused", reason: "conflict" });
    const target = { ...light(), binding: { ...binding, homeId: "other-home" } };
    expect(planLightAdmission([reserve()], command(), { ...principal, homeId: "other-home" }, target, allow, NOW))
      .toEqual({ kind: "refused", reason: "conflict" });
  });

  test("serializes a light's outstanding effects", () => {
    expect(planLightAdmission([reserve()], command({ commandId: "two", nonce: "two", idempotencyKey: "two" }), principal, light(), allow, NOW))
      .toEqual({ kind: "refused", reason: "busy" });
  });

  test("fails closed at capacity instead of evicting replay records", () => {
    let journal: readonly LightCommandRecord[] = [];
    for (let index = 0; index < LIGHT_JOURNAL_CAPACITY; index += 1) {
      const admission = planLightAdmission(journal, command({ commandId: `command-${index}`, nonce: `nonce-${index}`, idempotencyKey: `key-${index}` }), principal, light(), allow, NOW);
      if (admission.kind !== "reserved") throw new Error("Capacity fixture refused early.");
      journal = Object.freeze([...journal, interruptLightCommand(admission.record)]);
    }
    expect(planLightAdmission(journal, command(), principal, light(), allow, NOW))
      .toEqual({ kind: "refused", reason: "capacity" });
    expect(journal).toHaveLength(LIGHT_JOURNAL_CAPACITY);
  });
});

describe("offline one-light dispatch and observations", () => {
  test.each([true, false])("describes explicit power=%s, never HA toggle", (on) => {
    const result = dispatch(reserve(command({ on })));
    expect(result.call).toEqual({ id: 7, type: "call_service", domain: "light", service: on ? "turn_on" : "turn_off", target: { entity_id: "light.hue_fixture" } });
    expect(result.record.status).toBe("dispatching");
    expect(result.record.observation).toBeNull();
    expect(Object.isFrozen(result.call?.target)).toBe(true);
    expect(dispatch(result.record).call).toBeNull();
  });

  test("re-resolves the same registry identity after an entity rename", () => {
    const renamed = light("light.renamed_fixture");
    const record = reserve();
    const result = planLightDispatch(record, renamed, {
      sessionId: "session-one", requestId: 7,
      observation: observation({ entityId: renamed.entityId, observedAt: NOW, receivedAt: NOW, revision: 1 }),
    }, allow, NOW, [record]);
    expect(result.call?.target.entity_id).toBe("light.renamed_fixture");
    expect(result.record.binding).toEqual(binding);
  });

  test.each([
    { availability: "unknown", isOn: null }, { availability: "unavailable", isOn: null },
    { sessionId: "old-session" }, { binding: { ...binding, integrationId: "other" } },
    { observedAt: NOW + 1 }, { receivedAt: NOW + 1 }, { receivedAt: NOW - 30_001, observedAt: NOW - 30_001 },
  ] satisfies Partial<LightObservation>[])("does not dispatch with an unusable baseline: %j", (changes) => {
    const record = reserve();
    const result = planLightDispatch(record, light(), {
      sessionId: "session-one", requestId: 7,
      observation: observation({ observedAt: NOW, receivedAt: NOW, revision: 1, ...changes }),
    }, allow, NOW, [record]);
    expect(result.call).toBeNull();
    expect(result.record.status).toBe("unavailable");
  });

  test("revocation and expiry are rechecked immediately before dispatch", () => {
    const source = { sessionId: "session-one", requestId: 7, observation: observation({ observedAt: NOW, receivedAt: NOW }) };
    const record = reserve();
    expect(planLightDispatch(record, light(), source, () => false, NOW, [record]).record.status).toBe("refused");
    expect(planLightDispatch(record, light(), source, allow, NOW + 15_000, [record]).record.status).toBe("expired");
  });

  test("refuses stale reservations and previously used same-session request IDs", () => {
    const earlier = interruptLightCommand(dispatch().record);
    const record = reserve(command({ commandId: "new-command", nonce: "new-nonce", idempotencyKey: "new-key" }));
    expect(dispatch(record, []).call).toBeNull();
    expect(dispatch(record, [earlier, record]).call).toBeNull();
    expect(dispatch(record, [earlier, record]).record.status).toBe("refused");
  });

  test("service completion does not manufacture a state or physical confirmation", () => {
    expect(completed().status).toBe("service_completed");
    expect(completed().observation).toBeNull();
  });

  test.each(["state-first", "result-first"])("retains correctly scoped integration evidence: %s", (ordering) => {
    let record = dispatch().record;
    if (ordering === "state-first") record = recordLightObservation(record, observation(), allow, NOW + 1000);
    record = recordLightServiceResult(record, response(), "session-one", allow, NOW + 1100);
    if (ordering === "result-first") record = recordLightObservation(record, observation(), allow, NOW + 1200);
    expect(record.status).toBe("state_observed");
    expect(record.status).not.toBe("confirmed");
    expect(record.observation?.isOn).toBe(true);
    expect(recordLightObservation(record, observation({ isOn: false, revision: 9 }), allow, NOW + 1300)).toBe(record);
  });

  test.each([
    { contextId: null }, { contextId: "external-context" }, { assumedState: true }, { isOn: false },
    { availability: "unknown", isOn: null }, { availability: "unavailable", isOn: null },
    { observedAt: NOW - 1 }, { observedAt: NOW + 2000 }, { receivedAt: NOW - 1, observedAt: NOW - 1 },
    { receivedAt: NOW + 2000 }, { revision: 1 }, { sessionId: "old-session" },
    { binding: { ...binding, homeId: "other" } }, { binding: { ...binding, deviceId: "other" } },
    { binding: { ...binding, registryEntryId: "other" } }, { entityId: "light.other" },
  ] satisfies Partial<LightObservation>[])("cannot finish with unsuitable observation: %j", (changes) => {
    const result = recordLightObservation(completed(), observation(changes), allow, NOW + 1000);
    expect(result.status).toBe("service_completed");
  });

  test("uncorrelated external state remains distinguishable from command evidence", () => {
    const state = observation({ contextId: "wall-switch" });
    const result = recordLightObservation(completed(), state, allow, NOW + 1000);
    expect(result.observation?.isOn).toBe(true);
    expect(result.status).toBe("service_completed");
    expect(expireLightCommand(result, allow, NOW + 15_000).status).toBe("outcome_unknown");
  });

  test.each([NOW + 500, NOW + 4000])("newer contradictory chronology %i clears matching evidence before the result", (observedAt) => {
    let record = recordLightObservation(dispatch().record, observation(), allow, NOW + 1000);
    record = recordLightObservation(record, observation({ revision: 3, isOn: false, observedAt, receivedAt: NOW + 2000 }), allow, NOW + 2000);
    expect(record.observation).toBeNull();
    record = recordLightServiceResult(record, response(), "session-one", allow, NOW + 2100);
    expect(record.status).toBe("service_completed");
    record = recordLightObservation(record, observation({ revision: 4, observedAt: NOW + 750, receivedAt: NOW + 2200 }), allow, NOW + 2200);
    expect(record.status).toBe("service_completed");
    expect(record.lastObservedAt).toBe(NOW + 1000);
  });

  test("a newer contrary state cannot be overwritten by an older matching frame", () => {
    let record = recordLightObservation(completed(), observation({ isOn: false, revision: 3, observedAt: NOW + 1200, receivedAt: NOW + 1200 }), allow, NOW + 1200);
    record = recordLightObservation(record, observation(), allow, NOW + 1300);
    expect(record.status).toBe("service_completed");
    expect(record.observation?.isOn).toBe(false);
  });

  test("wrong request/session results and duplicate results cannot replace correlation", () => {
    const record = dispatch().record;
    expect(recordLightServiceResult(record, { ...response(), id: 8 }, "session-one", allow, NOW + 500)).toBe(record);
    expect(recordLightServiceResult(record, response(), "old-session", allow, NOW + 500)).toBe(record);
    const accepted = completed();
    expect(recordLightServiceResult(accepted, response("other-context"), "session-one", allow, NOW + 1000)).toBe(accepted);
    expect(recordLightObservation(recordLightServiceResult(record, response(null), "session-one", allow, NOW + 500), observation(), allow, NOW + 1000).status).toBe("service_completed");
  });

  test("failure, revocation, and clock rollback after sending all preserve unknown effect", () => {
    const record = dispatch().record;
    expect(recordLightServiceResult(record, { id: 7, type: "result", success: false, error: { message: "private detail" } }, "session-one", allow, NOW + 500).status).toBe("outcome_unknown");
    expect(recordLightServiceResult(record, response(), "session-one", () => false, NOW + 500).status).toBe("outcome_unknown");
    expect(recordLightObservation(completed(), observation(), () => false, NOW + 1000).status).toBe("outcome_unknown");
    expect(expireLightCommand(record, allow, NOW - 1).status).toBe("outcome_unknown");
  });

  test("disconnect/restart never makes dispatched or expired work executable again", () => {
    expect(interruptLightCommand(reserve()).status).toBe("unavailable");
    for (const record of [dispatch().record, completed()]) {
      const interrupted = interruptLightCommand(record);
      expect(interrupted.status).toBe("outcome_unknown");
      expect(dispatch(interrupted).call).toBeNull();
      expect(recordLightServiceResult(interrupted, response(), "session-one", allow, NOW + 1000)).toBe(interrupted);
      expect(recordLightObservation(interrupted, observation(), allow, NOW + 1000)).toBe(interrupted);
    }
    expect(dispatch(expireLightCommand(reserve(), allow, NOW + 15_000)).call).toBeNull();
    expect(recordLightObservation(completed(), observation(), allow, NOW + 15_000).status).toBe("outcome_unknown");
  });
});

/**
 * Fake commit boundary for contract tests, not a persistent journal implementation.
 * Calls are stored as inert data so this harness cannot actuate a real device.
 */
class SimulatedJournal {
  records: readonly LightCommandRecord[] = [];
  calls: LightServiceCall[] = [];
  writable = true;

  /** Simulate an atomic successful commit; failure preserves the earlier snapshot. */
  commit(records: readonly LightCommandRecord[]) {
    if (!this.writable) return false;
    this.records = records;
    return true;
  }

  /** Record admission first; an exact replay never creates a dispatch request. */
  admit(input: LightPowerCommand) {
    const result = planLightAdmission(this.records, input, principal, light(), allow, NOW);
    if (result.kind !== "reserved") return result.kind;
    return this.commit(result.journal) ? "reserved" : "storage_failed";
  }

  /** Commit dispatch intent before the simulated side effect, matching the required worker order. */
  sendFirst() {
    const before = this.records[0];
    if (!before) return;
    const result = dispatch(before, this.records);
    if (this.commit(Object.freeze([result.record, ...this.records.slice(1)])) && result.call) {
      this.calls.push(result.call);
    }
  }

  /** Simulate loading retained records after a restart; no ambiguous intent is replayed. */
  restart() {
    this.records = Object.freeze(this.records.map(interruptLightCommand));
  }
}

describe("synthetic journal-to-call ordering", () => {
  test("failed reservation or dispatch commit produces no device call", () => {
    const model = new SimulatedJournal();
    model.writable = false;
    expect(model.admit(command())).toBe("storage_failed");
    model.sendFirst();
    expect(model.calls).toHaveLength(0);
    expect(model.records).toHaveLength(0);
    model.writable = true;
    expect(model.admit(command())).toBe("reserved");
    model.writable = false;
    model.sendFirst();
    expect(model.calls).toHaveLength(0);
    expect(model.records[0].status).toBe("reserved");
  });

  test("one admission creates at most one simulated call across retry and restart", () => {
    const model = new SimulatedJournal();
    expect(model.admit(command())).toBe("reserved");
    model.sendFirst();
    expect(model.calls).toHaveLength(1);
    expect(model.admit(command())).toBe("duplicate");
    model.sendFirst();
    model.restart();
    expect(model.admit(command())).toBe("duplicate");
    model.sendFirst();
    expect(model.calls).toHaveLength(1);
    expect(model.records[0].status).toBe("outcome_unknown");
  });
});
