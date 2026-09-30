import {
  isBridgeIdentifier, isBridgeTimestamp, isDataRecord, parseLightBinding,
  parseLightObservation, parseLightPowerCommand, sameLightBinding,
  type LightBinding, type LightCommandRecord,
} from "../lightContract";

const RECORD_KEYS = [
  "command", "principal", "binding", "status", "sessionId", "entityId", "requestId",
  "dispatchedAt", "lastRevision", "lastObservedAt", "serviceContextId", "observation",
];
const OBSERVATION_KEYS = [
  "binding", "entityId", "sessionId", "revision", "observedAt", "receivedAt",
  "availability", "isOn", "assumedState", "contextId",
];
const STATUSES = new Set([
  "reserved", "dispatching", "service_completed", "state_observed",
  "expired", "refused", "unavailable", "outcome_unknown",
]);
export const MAX_RECORD_BYTES = 16_384;

/** Revalidate historical records without applying today's admission freshness window. */
export function decodeLightRecord(json: string, expectedBinding: LightBinding): LightCommandRecord | null {
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!isDataRecord(value) || Object.keys(value).length !== RECORD_KEYS.length ||
      !RECORD_KEYS.every((key) => Object.hasOwn(value, key)) || !isDataRecord(value.command)) return null;
  const parsed = parseLightPowerCommand(value.command, value.command.createdAt as number);
  const binding = parseLightBinding(value.binding);
  if (!parsed.ok || !binding || !sameLightBinding(binding, expectedBinding) ||
      parsed.command.deviceId !== binding.deviceId || !isDataRecord(value.principal) ||
      Object.keys(value.principal).length !== 2 || !isBridgeIdentifier(value.principal.actorId) ||
      value.principal.homeId !== binding.homeId || typeof value.status !== "string" ||
      !STATUSES.has(value.status) || !isBridgeTimestamp(value.lastRevision) ||
      !isBridgeTimestamp(value.lastObservedAt)) return null;
  const dispatched = value.dispatchedAt !== null;
  if (value.observation !== null && (!isDataRecord(value.observation) ||
      Object.keys(value.observation).length !== OBSERVATION_KEYS.length ||
      !OBSERVATION_KEYS.every((key) => Object.hasOwn(value.observation as object, key)))) return null;
  const observation = value.observation === null ? null : parseLightObservation(value.observation);
  if (value.observation !== null && !observation) return null;
  if (dispatched) {
    if (!isBridgeTimestamp(value.dispatchedAt) || value.dispatchedAt < parsed.command.createdAt - 5_000 ||
        value.dispatchedAt >= parsed.command.expiresAt || !isBridgeIdentifier(value.sessionId) ||
        typeof value.entityId !== "string" || !/^light\.[a-z0-9_]{1,249}$/.test(value.entityId) ||
        !isBridgeTimestamp(value.requestId) || value.requestId === 0 || value.lastRevision === 0 ||
        value.lastObservedAt >= parsed.command.expiresAt ||
        !["dispatching", "service_completed", "state_observed", "outcome_unknown"].includes(value.status)) return null;
  } else if (!["reserved", "expired", "refused", "unavailable"].includes(value.status) ||
      value.sessionId !== null || value.entityId !== null || value.requestId !== null ||
      value.lastRevision !== 0 || value.lastObservedAt !== 0 || value.serviceContextId !== null || observation) return null;
  if (value.serviceContextId !== null && !isBridgeIdentifier(value.serviceContextId)) return null;
  if (value.status === "dispatching" && value.serviceContextId !== null) return null;
  if (value.status === "outcome_unknown" && observation !== null) return null;
  if (observation && (!sameLightBinding(observation.binding, binding) ||
      observation.entityId !== value.entityId || observation.sessionId !== value.sessionId ||
      observation.revision <= 1 ||
      observation.revision !== value.lastRevision || observation.observedAt !== value.lastObservedAt ||
      observation.receivedAt >= parsed.command.expiresAt ||
      observation.receivedAt < (value.dispatchedAt as number) ||
      observation.observedAt < (value.dispatchedAt as number))) return null;
  if (value.status === "state_observed" && (!observation || !value.serviceContextId ||
      observation.contextId !== value.serviceContextId || observation.assumedState ||
      observation.availability !== "available" || observation.isOn !== parsed.command.on)) return null;
  return Object.freeze({
    command: parsed.command,
    principal: Object.freeze({ actorId: value.principal.actorId, homeId: binding.homeId }),
    binding,
    status: value.status as LightCommandRecord["status"],
    sessionId: value.sessionId as string | null,
    entityId: value.entityId as string | null,
    requestId: value.requestId as number | null,
    dispatchedAt: value.dispatchedAt as number | null,
    lastRevision: value.lastRevision,
    lastObservedAt: value.lastObservedAt,
    serviceContextId: value.serviceContextId as string | null,
    observation,
  });
}
