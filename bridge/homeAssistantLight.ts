/** Pure Home Assistant data normalization; this module performs no transport I/O. */
import {
  isBridgeIdentifier,
  isBridgeTimestamp,
  isDataRecord,
  parseLightBinding,
  parseLightObservation,
  type LightBinding,
  type LightObservation,
  type PilotLight,
} from "./lightContract";

/** Service completion describes Home Assistant execution, not physical success. */
export type LightServiceResult =
  | Readonly<{ status: "completed"; contextId: string | null }>
  | Readonly<{ status: "rejected" }>;

const MAX_REGISTRY_ENTRIES = 10_000;

/** Home Assistant entity addresses are bounded identifiers, never URLs or names. */
function isEntityId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 255 &&
    /^[a-z0-9_]+\.[a-z0-9_]+$/.test(value);
}

/** Copy a selected stable registry identity; a rename only changes its address. */
export function discoverPilotLight(registry: unknown, binding: LightBinding): PilotLight | null {
  const safeBinding = parseLightBinding(binding);
  if (!safeBinding || !Array.isArray(registry) || registry.length > MAX_REGISTRY_ENTRIES) return null;
  const ids = new Set<string>();
  const addresses = new Set<string>();
  let selected: Record<string, unknown> | null = null;
  for (let index = 0; index < registry.length; index += 1) {
    // Do not execute accessors or silently skip sparse/malformed discovery entries.
    const descriptor = Object.getOwnPropertyDescriptor(registry, index);
    const entry: unknown = descriptor && "value" in descriptor ? descriptor.value : null;
    if (!isDataRecord(entry) || !isBridgeIdentifier(entry.id) || !isEntityId(entry.entity_id) ||
        ids.has(entry.id) || addresses.has(entry.entity_id)) return null;
    ids.add(entry.id);
    addresses.add(entry.entity_id);
    if (entry.id === safeBinding.registryEntryId) selected = entry;
  }
  if (!selected || selected.disabled_by !== null ||
      typeof selected.entity_id !== "string" || !selected.entity_id.startsWith("light.")) return null;
  // Every HA light supports explicit power. Color lights need not advertise "onoff".
  return Object.freeze({ binding: safeBinding, entityId: selected.entity_id, canSetPower: true });
}

/** Parse explicit ISO timestamps without Date.parse's invalid-calendar coercion. */
function parseObservedAt(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , offset] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const leapYear = yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monthNumber < 1 || monthNumber > 12 || Number(day) < 1 ||
      Number(day) > days[monthNumber - 1] || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second) > 59 ||
      (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))) return null;
  const timestamp = Date.parse(value);
  return isBridgeTimestamp(timestamp) ? timestamp : null;
}

/** Missing context is uncorrelated; malformed context is not trustworthy evidence. */
function parseContextId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (!isDataRecord(value) || !isBridgeIdentifier(value.id)) return undefined;
  return value.id;
}

/** Normalize only reported power/availability; unknown state is never inferred off. */
export function normalizeLightObservation(
  rawState: unknown,
  light: PilotLight,
  source: Readonly<{ sessionId: string; revision: number; receivedAt: number }>,
): LightObservation | null {
  if (!isDataRecord(light) || !isDataRecord(source)) return null;
  const binding = parseLightBinding(light.binding);
  if (!binding || !isEntityId(light.entityId) || !light.entityId.startsWith("light.") ||
      typeof light.canSetPower !== "boolean" || !isBridgeIdentifier(source.sessionId) ||
      !isBridgeTimestamp(source.revision) || !isBridgeTimestamp(source.receivedAt) ||
      !isDataRecord(rawState) || rawState.entity_id !== light.entityId ||
      !isDataRecord(rawState.attributes)) return null;
  const observedAt = parseObservedAt(rawState.last_updated);
  const contextId = parseContextId(rawState.context);
  const assumedState = rawState.attributes.assumed_state;
  const state = rawState.state;
  if (observedAt === null || contextId === undefined ||
      (assumedState !== undefined && typeof assumedState !== "boolean") ||
      typeof state !== "string" || !["on", "off", "unknown", "unavailable"].includes(state)) return null;
  // Reuse the lifecycle boundary for revision/clock-skew policy and sanitized copies.
  return parseLightObservation({
    binding,
    entityId: light.entityId,
    sessionId: source.sessionId,
    revision: source.revision,
    observedAt,
    receivedAt: source.receivedAt,
    availability: state === "unavailable" ? "unavailable" : state === "unknown" ? "unknown" : "available",
    isOn: state === "on" ? true : state === "off" ? false : null,
    assumedState: assumedState === true,
    contextId,
  });
}

/** Correlate a service response without exposing raw errors or claiming state. */
export function parseLightServiceResult(raw: unknown, expectedRequestId: number): LightServiceResult | null {
  if (!Number.isSafeInteger(expectedRequestId) || expectedRequestId <= 0 ||
      !isDataRecord(raw) || raw.type !== "result" || raw.id !== expectedRequestId ||
      typeof raw.success !== "boolean") return null;
  if (!raw.success) return Object.freeze({ status: "rejected" });
  if (!isDataRecord(raw.result) || (raw.result.response !== undefined && raw.result.response !== null)) return null;
  const contextId = parseContextId(raw.result.context);
  if (contextId === undefined) return null;
  return Object.freeze({ status: "completed", contextId });
}
