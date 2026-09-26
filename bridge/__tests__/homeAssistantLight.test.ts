import {
  discoverPilotLight,
  normalizeLightObservation,
  parseLightServiceResult,
} from "../homeAssistantLight";
import type { LightBinding, PilotLight } from "../lightContract";

const binding: LightBinding = {
  homeId: "home-a",
  bridgeId: "bridge-a",
  integrationId: "ha-a",
  deviceId: "vanta-light-a",
  registryEntryId: "registry-a",
};
const light: PilotLight = { binding, entityId: "light.reading", canSetPower: true };
const source = { sessionId: "session-a", revision: 4, receivedAt: 1_790_438_400_123 };

/** Make an ordinary registry entry without modeling integration transport. */
function registryEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "registry-a", entity_id: "light.reading", disabled_by: null, ...overrides };
}

/** Use explicit integration timestamps rather than a local clock fallback. */
function state(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entity_id: "light.reading",
    state: "on",
    last_updated: "2026-09-26T00:00:00.123456+00:00",
    attributes: { supported_color_modes: ["xy", "color_temp"] },
    context: { id: "context-a", parent_id: null, user_id: "not-retained" },
    ...overrides,
  };
}

/** Build a response that records service completion, never a power observation. */
function result(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 42, type: "result", success: true, result: { context: { id: "context-a" } }, ...overrides };
}

describe("Home Assistant pilot discovery", () => {
  it("discovers a color-capable Hue light without demanding an onoff color mode", () => {
    const entry = registryEntry({ capabilities: { supported_color_modes: ["xy", "color_temp"] } });
    expect(discoverPilotLight([entry], binding)).toEqual(light);
  });

  it("follows a stable registry ID through a rename instead of reusing the old address", () => {
    const renamed = registryEntry({ entity_id: "light.renamed" });
    const oldAddress = registryEntry({ id: "registry-other" });
    expect(discoverPilotLight([oldAddress, renamed], binding)?.entityId).toBe("light.renamed");
    expect(discoverPilotLight([oldAddress], binding)).toBeNull();
  });

  it("returns a frozen sanitized copy with no registry payload references", () => {
    const originalBinding = { ...binding };
    const entry = registryEntry({ unique_id: "private-serial", token: "not-retained", name: "Kitchen" });
    const discovered = discoverPilotLight([entry], originalBinding);
    originalBinding.homeId = "home-other";
    entry.entity_id = "light.other";
    expect(discovered).toEqual(light);
    expect(Object.isFrozen(discovered)).toBe(true);
    expect(Object.isFrozen(discovered?.binding)).toBe(true);
  });

  it.each([
    ["missing", []],
    ["not an array", {}],
    ["null", null],
    ["oversized", Array(10_001)],
    ["sparse", Array(1)],
    ["non-record", [null]],
    ["unknown ID", [registryEntry({ id: "different" })]],
    ["duplicate ID", [registryEntry(), registryEntry({ entity_id: "light.other" })]],
    ["duplicate address", [registryEntry(), registryEntry({ id: "other" })]],
    ["not a light", [registryEntry({ entity_id: "switch.reading" })]],
    ["malformed address", [registryEntry({ entity_id: "light.*" })]],
    ["URL address", [registryEntry({ entity_id: "https://local/light.reading" })]],
    ["missing disabled flag", [{ id: "registry-a", entity_id: "light.reading" }]],
    ["disabled", [registryEntry({ disabled_by: "user" })]],
    ["invalid disabled flag", [registryEntry({ disabled_by: false })]],
    ["invalid ID", [registryEntry({ id: "registry a" })]],
    ["inherited record", [Object.assign(Object.create({ inherited: true }), registryEntry())]],
  ])("rejects %s discovery", (_label, registry) => {
    expect(discoverPilotLight(registry, binding)).toBeNull();
  });

  it("does not execute accessors in entries, bindings, or the array", () => {
    const getter = jest.fn(() => "registry-a");
    const entry = Object.defineProperty(registryEntry(), "id", { enumerable: true, get: getter });
    expect(discoverPilotLight([entry], binding)).toBeNull();
    const entries: unknown[] = [];
    Object.defineProperty(entries, 0, { enumerable: true, get: getter });
    expect(discoverPilotLight(entries, binding)).toBeNull();
    const unsafeBinding = Object.defineProperty({ ...binding }, "homeId", { enumerable: true, get: getter });
    expect(discoverPilotLight([registryEntry()], unsafeBinding)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("Home Assistant light observations", () => {
  it.each([
    ["on", true, "available"],
    ["off", false, "available"],
    ["unknown", null, "unknown"],
    ["unavailable", null, "unavailable"],
  ])("keeps %s distinct without inferring an off state", (reportedState, isOn, availability) => {
    expect(normalizeLightObservation(state({ state: reportedState }), light, source)).toEqual({
      binding, entityId: light.entityId, ...source, observedAt: Date.parse("2026-09-26T00:00:00.123Z"),
      isOn, availability, assumedState: false, contextId: "context-a",
    });
  });

  it("preserves assumed state and freezes a new snapshot without private attributes", () => {
    const raw = state({ attributes: { assumed_state: true, secret: "not-retained" } });
    const originalLight = { ...light, binding: { ...binding } };
    const observed = normalizeLightObservation(raw, originalLight, source);
    originalLight.binding.homeId = "home-other";
    raw.state = "off";
    expect(observed?.assumedState).toBe(true);
    expect(observed?.isOn).toBe(true);
    expect(observed?.binding.homeId).toBe("home-a");
    expect(Object.keys(observed ?? {})).not.toContain("attributes");
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed?.binding)).toBe(true);
  });

  it.each([undefined, null])("allows uncorrelated context %s without inventing an ID", (context) => {
    expect(normalizeLightObservation(state({ context }), light, source)?.contextId).toBeNull();
  });

  it.each([
    undefined, null, 0, "2026-09-26", "2026-09-26T00:00:00", "not-a-date",
    "2026-02-30T00:00:00Z", "2025-02-29T00:00:00Z", "2026-13-01T00:00:00Z",
    "2026-00-01T00:00:00Z", "2026-01-00T00:00:00Z", "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z", "2026-01-01T00:00:00+24:00",
    "2026-01-01T00:00:00+00:60", "1969-01-01T00:00:00Z",
  ])("rejects invalid explicit last_updated %s", (last_updated) => {
    expect(normalizeLightObservation(state({ last_updated }), light, source)).toBeNull();
  });

  it("accepts a valid leap day and explicit timezone offset", () => {
    const last_updated = "2024-02-29T12:30:01-04:00";
    expect(normalizeLightObservation(state({ last_updated }), light, source)?.observedAt).toBe(Date.parse(last_updated));
  });

  it("allows at most five seconds of integration clock skew", () => {
    const observedAt = Date.parse("2026-09-26T00:00:00.123Z");
    expect(normalizeLightObservation(state(), light, { ...source, receivedAt: observedAt - 5_000 })).not.toBeNull();
    expect(normalizeLightObservation(state(), light, { ...source, receivedAt: observedAt - 5_001 })).toBeNull();
  });

  it("requires an explicit receivedAt timestamp rather than a local clock fallback", () => {
    const missingReceivedAt = { sessionId: source.sessionId, revision: source.revision };
    expect(normalizeLightObservation(state(), light, missingReceivedAt as typeof source)).toBeNull();
  });

  it.each([
    { entity_id: "light.other" }, { state: true }, { state: "ON" }, { state: "" },
    { attributes: null }, { attributes: [] }, { attributes: { assumed_state: "true" } },
    { context: {} }, { context: { id: "" } }, { context: "context-a" },
  ])("rejects malformed or wrong-entity state %j", (overrides) => {
    expect(normalizeLightObservation(state(overrides), light, source)).toBeNull();
  });

  it.each([
    { sessionId: "" }, { sessionId: "https://private" }, { revision: -1 }, { revision: 0 },
    { revision: 0.5 }, { receivedAt: Number.NaN }, { receivedAt: Number.POSITIVE_INFINITY },
    { receivedAt: -1 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid adapter source %j", (overrides) => {
    expect(normalizeLightObservation(state(), light, { ...source, ...overrides })).toBeNull();
  });

  it("does not execute nested accessors or coerce attacker-controlled state objects", () => {
    const getter = jest.fn();
    const attributes = Object.defineProperty({}, "assumed_state", { enumerable: true, get: getter });
    const context = Object.defineProperty({}, "id", { enumerable: true, get: getter });
    expect(normalizeLightObservation(state({ attributes }), light, source)).toBeNull();
    expect(normalizeLightObservation(state({ context }), light, source)).toBeNull();
    expect(normalizeLightObservation(state({ state: { toString: getter } }), light, source)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("Home Assistant service results", () => {
  it.each([undefined, null])("accepts completion with response %s, not physical confirmation", (response) => {
    const parsed = parseLightServiceResult(result({ result: { context: { id: "context-a" }, response } }), 42);
    expect(parsed).toEqual({ status: "completed", contextId: "context-a" });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("accepts the actual wire shape with the response field absent", () => {
    expect(parseLightServiceResult(result(), 42)).toEqual({ status: "completed", contextId: "context-a" });
  });

  it.each([{}, { context: null }])("leaves completion uncorrelated when context is absent: %j", (serviceResult) => {
    expect(parseLightServiceResult(result({ result: serviceResult }), 42)).toEqual({ status: "completed", contextId: null });
  });

  it("sanitizes rejection instead of retaining integration errors or payloads", () => {
    const parsed = parseLightServiceResult(result({ success: false, error: { message: "private information", code: "not_found" } }), 42);
    expect(parsed).toEqual({ status: "rejected" });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    null, [], {}, result({ id: 41 }), result({ id: "42" }), result({ type: "event" }),
    result({ success: "true" }), result({ result: null }), result({ result: [] }),
    result({ result: { response: { unexpected: "data" } } }),
    result({ result: { context: {} } }), result({ result: { context: { id: "bad id" } } }),
    result({ result: { context: "context-a" } }),
  ])("rejects malformed or uncorrelated response %j", (raw) => {
    expect(parseLightServiceResult(raw, 42)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid request ID %s", (requestId) => {
    expect(parseLightServiceResult(result({ id: requestId }), requestId)).toBeNull();
  });

  it("does not execute service result getters", () => {
    const getter = jest.fn();
    const raw = Object.defineProperty(result(), "success", { enumerable: true, get: getter });
    expect(parseLightServiceResult(raw, 42)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
});
