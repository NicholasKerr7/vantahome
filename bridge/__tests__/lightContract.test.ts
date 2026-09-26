import {
  isActiveLightCommand,
  isBridgeIdentifier,
  isBridgeTimestamp,
  isDataRecord,
  parseLightBinding,
  parseLightObservation,
  parseLightPowerCommand,
  permitsLightPower,
  sameLightBinding,
  type LightAuthorizer,
  type LightBinding,
  type LightCommandRecord,
  type LightCommandStatus,
} from "../lightContract";

const NOW = 1_800_000_000_000;
const BINDING: LightBinding = {
  homeId: "synthetic-home",
  bridgeId: "synthetic-bridge",
  integrationId: "synthetic-integration",
  deviceId: "synthetic-light",
  registryEntryId: "synthetic-registry-entry",
};

/** Build invented wire data without importing a runtime client or transport. */
function command(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deviceId: BINDING.deviceId,
    op: "toggle",
    on: true,
    commandId: "synthetic-command",
    nonce: "synthetic-nonce",
    idempotencyKey: "synthetic-idempotency",
    createdAt: NOW,
    expiresAt: NOW + 15_000,
    ...overrides,
  };
}

/** Omit a required field while preserving all other valid synthetic fields. */
function withoutField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

/** Build normalized synthetic adapter data without asserting a real observation. */
function observation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    binding: { ...BINDING },
    entityId: "light.synthetic_bulb",
    sessionId: "synthetic-session",
    revision: 1,
    observedAt: NOW,
    receivedAt: NOW,
    availability: "available",
    isOn: true,
    assumedState: false,
    contextId: "synthetic-context",
    ...overrides,
  };
}

/** Construct a model-owned record solely for terminal-phase classification tests. */
function recordWithStatus(status: LightCommandStatus): LightCommandRecord {
  const parsed = parseLightPowerCommand(command(), NOW);
  if (!parsed.ok) throw new Error("Expected a valid synthetic command.");
  return {
    command: parsed.command,
    principal: { actorId: "synthetic-actor", homeId: BINDING.homeId },
    binding: BINDING,
    status,
    sessionId: null,
    entityId: null,
    requestId: null,
    dispatchedAt: null,
    lastRevision: 0,
    lastObservedAt: 0,
    serviceContextId: null,
    observation: null,
  };
}

describe("offline light power contract", () => {
  it.each([true, false])("accepts the explicit %s power intent without changing it", (on) => {
    const input = command({ on });
    const parsed = parseLightPowerCommand(input, NOW);

    expect(parsed).toEqual({ ok: true, command: input });
    if (!parsed.ok) throw new Error("Expected a valid synthetic command.");
    expect(parsed.command).not.toBe(input);
    expect(Object.isFrozen(parsed.command)).toBe(true);
  });

  it("accepts a plain null-prototype JSON-like envelope", () => {
    const input: Record<string, unknown> = Object.assign(Object.create(null), command());
    expect(parseLightPowerCommand(input, NOW).ok).toBe(true);
  });

  it.each([
    "deviceId", "op", "on", "commandId", "nonce", "idempotencyKey", "createdAt", "expiresAt",
  ])("rejects a missing %s rather than inventing a default", (key) => {
    expect(parseLightPowerCommand(withoutField(command(), key), NOW)).toEqual({
      ok: false, reason: "invalid_command",
    });
  });

  it.each([undefined, null, 0, 1, "true", "false", {}, []])(
    "rejects a non-boolean on value: %p",
    (on) => {
      expect(parseLightPowerCommand(command({ on }), NOW)).toEqual({
        ok: false, reason: "invalid_command",
      });
    },
  );

  it.each(["set-properties", "set-brightness", "set-temp", "turn_on", "TOGGLE", "", null])(
    "rejects the unsupported operation %p",
    (op) => {
      expect(parseLightPowerCommand(command({ op }), NOW)).toEqual({
        ok: false, reason: "invalid_command",
      });
    },
  );

  it.each([
    ["actorId", "synthetic-owner"],
    ["homeId", BINDING.homeId],
    ["bridgeId", BINDING.bridgeId],
    ["authorized", true],
    ["source", "alexa"],
    ["changes", { isOn: true }],
    ["value", 100],
    ["extra", undefined],
  ])("rejects the extra %s field, including caller-supplied authority", (key, value) => {
    expect(parseLightPowerCommand(command({ [key as string]: value }), NOW)).toEqual({
      ok: false, reason: "invalid_command",
    });
  });

  it.each([null, undefined, [], "command", 1, true])("rejects a non-object envelope %p", (input) => {
    expect(parseLightPowerCommand(input, NOW)).toEqual({ ok: false, reason: "invalid_command" });
  });

  it("does not change a parsed intent when the caller later mutates the input", () => {
    const input = command();
    const parsed = parseLightPowerCommand(input, NOW);
    if (!parsed.ok) throw new Error("Expected a valid synthetic command.");

    input.on = false;
    input.deviceId = "another-light";
    input.expiresAt = NOW + 60_000;
    expect(parsed.command.on).toBe(true);
    expect(parsed.command.deviceId).toBe(BINDING.deviceId);
    expect(parsed.command.expiresAt).toBe(NOW + 15_000);
    expect(Reflect.set(parsed.command, "on", false)).toBe(false);
    expect(parsed.command.on).toBe(true);
  });
});

describe("command clock boundaries", () => {
  it.each([
    ["oldest admitted creation", NOW - 30_000, NOW + 1],
    ["largest future skew", NOW + 5_000, NOW + 5_001],
    ["maximum lifetime", NOW, NOW + 60_000],
    ["one millisecond remaining", NOW, NOW + 1],
  ])("accepts %s", (_label, createdAt, expiresAt) => {
    expect(parseLightPowerCommand(command({ createdAt, expiresAt }), NOW).ok).toBe(true);
  });

  it.each([
    ["creation too old", NOW - 30_001, NOW + 1],
    ["creation too far in future", NOW + 5_001, NOW + 15_000],
    ["lifetime over maximum", NOW, NOW + 60_001],
    ["empty lifetime", NOW, NOW],
    ["negative lifetime", NOW, NOW - 1],
  ])("rejects %s", (_label, createdAt, expiresAt) => {
    expect(parseLightPowerCommand(command({ createdAt, expiresAt }), NOW)).toEqual({
      ok: false, reason: "invalid_command",
    });
  });

  it.each([NOW - 1, NOW])("marks a well-formed deadline %s as expired", (expiresAt) => {
    expect(parseLightPowerCommand(command({ createdAt: NOW - 1_000, expiresAt }), NOW)).toEqual({
      ok: false, reason: "expired",
    });
  });

  it.each([NaN, Infinity, -Infinity, -1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1, "1800000000000", null])(
    "rejects an invalid numeric clock value %p in every clock field",
    (invalid) => {
      expect(parseLightPowerCommand(command({ createdAt: invalid }), NOW)).toEqual({
        ok: false, reason: "invalid_command",
      });
      expect(parseLightPowerCommand(command({ expiresAt: invalid }), NOW)).toEqual({
        ok: false, reason: "invalid_command",
      });
      expect(isBridgeTimestamp(invalid)).toBe(false);
      if (typeof invalid === "number") {
        expect(parseLightPowerCommand(command(), invalid)).toEqual({
          ok: false, reason: "invalid_command",
        });
      }
    },
  );

  it("accepts explicit nonnegative safe integer timestamps without coercion", () => {
    expect(isBridgeTimestamp(0)).toBe(true);
    expect(isBridgeTimestamp(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(parseLightPowerCommand(command({ createdAt: 0, expiresAt: 1 }), 0).ok).toBe(true);
  });
});

describe("bounded identifiers", () => {
  it.each(["a", "A0_b.c:d-e", "a".repeat(128)])("accepts the bounded opaque identifier %s", (value) => {
    expect(isBridgeIdentifier(value)).toBe(true);
    for (const key of ["deviceId", "commandId", "nonce", "idempotencyKey"]) {
      expect(parseLightPowerCommand(command({ [key]: value }), NOW).ok).toBe(true);
    }
  });

  it.each(["", "a".repeat(129), " leading", "trailing ", "two words", "line\nbreak", "trailing\n", "trailing\r", "trailing\u2028", "/light", "_light", "https://light", "💡", 1, null])(
    "rejects the malformed identifier %p in every envelope identifier field",
    (value) => {
      expect(isBridgeIdentifier(value)).toBe(false);
      for (const key of ["deviceId", "commandId", "nonce", "idempotencyKey"]) {
        expect(parseLightPowerCommand(command({ [key]: value }), NOW)).toEqual({
          ok: false, reason: "invalid_command",
        });
      }
    },
  );
});

describe("data-only records", () => {
  it("rejects an inherited command envelope", () => {
    expect(parseLightPowerCommand(Object.create(command()), NOW)).toEqual({
      ok: false, reason: "invalid_command",
    });
  });

  it("rejects a custom prototype even when all command fields are owned", () => {
    const input = Object.assign(Object.create({ trusted: true }), command());
    expect(isDataRecord(input)).toBe(false);
    expect(parseLightPowerCommand(input, NOW)).toEqual({ ok: false, reason: "invalid_command" });
  });

  it.each(["__proto__", "prototype", "constructor"])("rejects an owned poison key %s", (key) => {
    const input = command();
    Object.defineProperty(input, key, { value: {}, enumerable: true });
    expect(isDataRecord(input)).toBe(false);
    expect(parseLightPowerCommand(input, NOW)).toEqual({ ok: false, reason: "invalid_command" });
    expect(parseLightBinding({ ...BINDING, [key]: {} })).toBeNull();
  });

  it("rejects accessors without invoking command or binding getters", () => {
    const getter = jest.fn(() => { throw new Error("A parser must not execute this getter."); });
    const input = command();
    const binding = { ...BINDING };
    Object.defineProperty(input, "on", { get: getter, enumerable: true });
    Object.defineProperty(binding, "homeId", { get: getter, enumerable: true });

    expect(parseLightPowerCommand(input, NOW)).toEqual({ ok: false, reason: "invalid_command" });
    expect(parseLightBinding(binding)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects non-enumerable and symbol data instead of silently dropping it", () => {
    const hidden = command();
    Object.defineProperty(hidden, "authorized", { value: true, enumerable: false });
    const symbol = { ...command(), [Symbol("authority")]: true };
    expect(isDataRecord(hidden)).toBe(false);
    expect(isDataRecord(symbol)).toBe(false);
    expect(parseLightPowerCommand(hidden, NOW).ok).toBe(false);
    expect(parseLightPowerCommand(symbol, NOW).ok).toBe(false);
  });
});

describe("trusted registry binding shape", () => {
  it("returns a frozen independent binding rather than retaining caller state", () => {
    const input = { ...BINDING };
    const parsed = parseLightBinding(input);
    expect(parsed).toEqual(BINDING);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);

    input.homeId = "another-home";
    expect(parsed?.homeId).toBe(BINDING.homeId);
    if (!parsed) throw new Error("Expected a valid synthetic binding.");
    expect(Reflect.set(parsed, "homeId", "another-home")).toBe(false);
    expect(sameLightBinding(parsed, BINDING)).toBe(true);
  });

  it.each(Object.keys(BINDING) as (keyof LightBinding)[])(
    "requires %s, validates it, and includes it in scope equality",
    (key) => {
      expect(parseLightBinding(withoutField({ ...BINDING }, key))).toBeNull();
      expect(parseLightBinding({ ...BINDING, [key]: "" })).toBeNull();
      expect(parseLightBinding({ ...BINDING, [key]: "a".repeat(129) })).toBeNull();
      expect(sameLightBinding(BINDING, { ...BINDING, [key]: "another-scope" })).toBe(false);
    },
  );

  it("rejects extra authority fields and unknown keys replacing required keys", () => {
    expect(parseLightBinding({ ...BINDING, authorized: true })).toBeNull();
    expect(parseLightBinding({ ...withoutField({ ...BINDING }, "homeId"), actorId: "synthetic-owner" })).toBeNull();
  });

  it.each([null, undefined, [], "binding", 1, true])("rejects a non-record binding %p", (value) => {
    expect(parseLightBinding(value)).toBeNull();
  });
});

describe("normalized observation boundary", () => {
  it.each([true, false])("preserves a reported available power state of %s", (isOn) => {
    const input = observation({ isOn });
    expect(parseLightObservation(input)).toEqual(input);
  });

  it.each(["unknown", "unavailable"])("preserves %s without inventing an off state", (availability) => {
    const input = observation({ availability, isOn: null, contextId: null });
    expect(parseLightObservation(input)).toEqual(input);
    expect(parseLightObservation(observation({ availability, isOn: false }))).toBeNull();
  });

  it("does not erase assumed-state provenance", () => {
    expect(parseLightObservation(observation({ assumedState: true }))?.assumedState).toBe(true);
  });

  it("copies and freezes the observation and its nested registry binding", () => {
    const binding = { ...BINDING };
    const input = observation({ binding });
    const parsed = parseLightObservation(input);
    if (!parsed) throw new Error("Expected a valid synthetic observation.");

    expect(parsed).not.toBe(input);
    expect(parsed.binding).not.toBe(binding);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.binding)).toBe(true);
    binding.homeId = "another-home";
    input.isOn = false;
    expect(parsed.binding.homeId).toBe(BINDING.homeId);
    expect(parsed.isOn).toBe(true);
    expect(Reflect.set(parsed, "contextId", "another-context")).toBe(false);
    expect(Reflect.set(parsed.binding, "homeId", "another-home")).toBe(false);
  });

  it.each([
    "binding", "entityId", "sessionId", "revision", "observedAt", "receivedAt",
    "availability", "isOn", "assumedState", "contextId",
  ])("requires explicit %s instead of fabricating normalized evidence", (key) => {
    expect(parseLightObservation(withoutField(observation(), key))).toBeNull();
  });

  it.each([
    ["binding", { ...BINDING, homeId: "" }],
    ["entityId", "switch.synthetic_bulb"],
    ["entityId", "light."],
    ["entityId", "light.UPPERCASE"],
    ["entityId", `light.${"a".repeat(250)}`],
    ["sessionId", ""],
    ["revision", 0],
    ["revision", 1.5],
    ["revision", Number.MAX_SAFE_INTEGER + 1],
    ["observedAt", NaN],
    ["observedAt", Infinity],
    ["observedAt", -1],
    ["observedAt", "1800000000000"],
    ["receivedAt", NOW + 0.5],
    ["receivedAt", undefined],
    ["availability", "online"],
    ["isOn", null],
    ["isOn", 1],
    ["assumedState", "false"],
    ["contextId", ""],
    ["contextId", { id: "synthetic-context" }],
  ])("rejects malformed normalized field %s = %p", (key, value) => {
    expect(parseLightObservation(observation({ [key as string]: value }))).toBeNull();
  });

  it("bounds observation clock skew without creating timestamps from receipt time", () => {
    expect(parseLightObservation(observation({ observedAt: NOW + 5_000 }))?.observedAt).toBe(NOW + 5_000);
    expect(parseLightObservation(observation({ observedAt: NOW + 5_001 }))).toBeNull();
    expect(parseLightObservation(observation({ observedAt: 0 }))?.observedAt).toBe(0);
  });

  it("rejects top-level and nested accessors without executing them", () => {
    const getter = jest.fn(() => { throw new Error("Observation parsing must not run this getter."); });
    const input = observation();
    Object.defineProperty(input, "isOn", { get: getter, enumerable: true });
    const binding = { ...BINDING };
    Object.defineProperty(binding, "integrationId", { get: getter, enumerable: true });

    expect(parseLightObservation(input)).toBeNull();
    expect(parseLightObservation(observation({ binding }))).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects inherited and poisoned normalized observations", () => {
    expect(parseLightObservation(Object.create(observation()))).toBeNull();
    expect(parseLightObservation(observation({ constructor: "unsafe" }))).toBeNull();
    expect(parseLightObservation(observation({ binding: Object.create(BINDING) }))).toBeNull();
  });
});

describe("current authorization boundary", () => {
  const principal = { actorId: "synthetic-actor", homeId: BINDING.homeId };

  it("requires an exact true result from the supplied policy boundary", () => {
    const authorize = jest.fn(() => true);
    expect(permitsLightPower(principal, BINDING, authorize)).toBe(true);
    expect(authorize).toHaveBeenCalledWith(principal, BINDING);
  });

  it.each([false, undefined, null, 1, "true", { allowed: true }])(
    "fails closed for the policy result %p without truthy coercion",
    (result) => {
      const authorize = jest.fn(() => result) as unknown as LightAuthorizer;
      expect(permitsLightPower(principal, BINDING, authorize)).toBe(false);
    },
  );

  it("fails closed when policy lookup throws", () => {
    const authorize = jest.fn(() => { throw new Error("Synthetic policy lookup failed."); });
    expect(permitsLightPower(principal, BINDING, authorize)).toBe(false);
  });

  it.each([
    { actorId: "", homeId: BINDING.homeId },
    { actorId: "not an identifier", homeId: BINDING.homeId },
    { actorId: principal.actorId, homeId: "another-home" },
  ])("refuses malformed or cross-home principal %p before policy lookup", (invalid) => {
    const authorize = jest.fn(() => true);
    expect(permitsLightPower(invalid, BINDING, authorize)).toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("consults current policy again rather than caching a previous grant", () => {
    const authorize = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(permitsLightPower(principal, BINDING, authorize)).toBe(true);
    expect(permitsLightPower(principal, BINDING, authorize)).toBe(false);
    expect(authorize).toHaveBeenCalledTimes(2);
  });
});

describe("active reference-model phases", () => {
  it.each<LightCommandStatus>(["reserved", "dispatching", "service_completed"])(
    "allows the %s phase to advance",
    (status) => expect(isActiveLightCommand(recordWithStatus(status))).toBe(true),
  );

  it.each<LightCommandStatus>(["state_observed", "expired", "refused", "unavailable", "outcome_unknown"])(
    "treats %s as terminal without introducing a confirmed state",
    (status) => expect(isActiveLightCommand(recordWithStatus(status))).toBe(false),
  );
});
