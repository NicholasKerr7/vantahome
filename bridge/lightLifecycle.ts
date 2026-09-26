import {
  isActiveLightCommand,
  isBridgeIdentifier,
  isBridgeTimestamp,
  parseLightBinding,
  parseLightObservation,
  permitsLightPower,
  sameLightBinding,
  type LightAuthorizer,
  type LightCommandRecord,
  type LightObservation,
  type PilotLight,
} from "./lightContract";
import { parseLightServiceResult } from "./homeAssistantLight";

/** An inert service-call description; this module never opens a connection. */
export type LightServiceCall = Readonly<{
  id: number;
  type: "call_service";
  domain: "light";
  service: "turn_on" | "turn_off";
  target: Readonly<{ entity_id: string }>;
}>;

/**
 * Adapter-owned metadata, never phone fields. The adapter must allocate request
 * IDs uniquely across ALL operations in one authenticated HA session.
 */
export type LightDispatchSource = Readonly<{
  sessionId: string;
  requestId: number;
  observation: LightObservation;
}>;

/** Freeze a transition built from model-owned immutable records and parsed fields. */
function change(record: LightCommandRecord, patch: Partial<LightCommandRecord>): LightCommandRecord {
  return Object.freeze({ ...record, ...patch });
}

/** Policy/clock loss after dispatch means unknown effect, never safe-to-retry failure. */
function stop(record: LightCommandRecord, beforeSend: "expired" | "refused" | "unavailable") {
  return change(record, { status: record.dispatchedAt === null ? beforeSend : "outcome_unknown", observation: null });
}

/** Recheck the future trusted authorization boundary and deadline before every result. */
function guard(record: LightCommandRecord, authorize: LightAuthorizer, now: number): LightCommandRecord {
  if (!isActiveLightCommand(record)) return record;
  if (!isBridgeTimestamp(now) || now < record.command.createdAt - 5_000 ||
      (record.dispatchedAt !== null && now < record.dispatchedAt)) return stop(record, "refused");
  if (now >= record.command.expiresAt) return stop(record, "expired");
  if (!permitsLightPower(record.principal, record.binding, authorize)) return stop(record, "refused");
  return record;
}

/**
 * Describe a single explicit on/off call after reservation. This is a reference
 * transition, not a production worker: a durable dispatcher must commit the
 * dispatching state before sending, and must not replay it after a crash.
 */
export function planLightDispatch(
  record: LightCommandRecord,
  light: PilotLight,
  source: LightDispatchSource,
  authorize: LightAuthorizer,
  now: number,
  journal: readonly LightCommandRecord[],
): { record: LightCommandRecord; call: LightServiceCall | null } {
  const checked = guard(record, authorize, now);
  if (checked.status !== "reserved") return { record: checked, call: null };
  if (!journal.includes(record) || journal.some((entry) => entry !== record &&
      entry.sessionId === source.sessionId && entry.requestId === source.requestId)) {
    return { record: stop(checked, "refused"), call: null };
  }
  const binding = parseLightBinding(light.binding);
  const observation = parseLightObservation(source.observation);
  if (!binding || !sameLightBinding(binding, record.binding) || light.canSetPower !== true ||
      !observation || !sameLightBinding(observation.binding, binding) ||
      observation.entityId !== light.entityId || observation.availability !== "available" ||
      !isBridgeIdentifier(source.sessionId) || observation.sessionId !== source.sessionId ||
      !isBridgeTimestamp(source.requestId) || source.requestId === 0 ||
      observation.observedAt > now ||
      observation.receivedAt > now || observation.receivedAt < now - 30_000) {
    return { record: stop(checked, "unavailable"), call: null };
  }
  return {
    record: change(checked, {
      status: "dispatching", sessionId: source.sessionId, entityId: light.entityId,
      requestId: source.requestId, dispatchedAt: now,
      lastRevision: observation.revision, lastObservedAt: observation.observedAt, observation: null,
    }),
    call: Object.freeze({
      id: source.requestId, type: "call_service", domain: "light",
      service: record.command.on ? "turn_on" : "turn_off",
      target: Object.freeze({ entity_id: light.entityId }),
    }),
  };
}

/** Supporting evidence only: HA context is not a per-command physical acknowledgment. */
function applyObservedState(record: LightCommandRecord): LightCommandRecord {
  const observation = record.observation;
  if (record.status !== "service_completed" || !record.serviceContextId || !observation ||
      observation.contextId !== record.serviceContextId || observation.assumedState ||
      observation.availability !== "available" || observation.isOn !== record.command.on) return record;
  return change(record, { status: "state_observed" });
}

/** Match an authenticated session's service result without treating it as physical success. */
export function recordLightServiceResult(
  record: LightCommandRecord,
  input: unknown,
  sessionId: string,
  authorize: LightAuthorizer,
  now: number,
): LightCommandRecord {
  const checked = guard(record, authorize, now);
  if (checked.status !== "dispatching" || checked.sessionId !== sessionId || checked.requestId === null) return checked;
  const result = parseLightServiceResult(input, checked.requestId);
  if (!result) return checked;
  if (result.status === "rejected") return stop(checked, "refused");
  return applyObservedState(change(checked, { status: "service_completed", serviceContextId: result.contextId }));
}

/**
 * Retain only the newest same-session observation, including external changes.
 * Fresh matching state alone cannot finish a command; correlated, non-assumed
 * HA state plus service completion yields state_observed, never confirmed.
 */
export function recordLightObservation(
  record: LightCommandRecord,
  input: unknown,
  authorize: LightAuthorizer,
  now: number,
): LightCommandRecord {
  const checked = guard(record, authorize, now);
  if (!["dispatching", "service_completed"].includes(checked.status) || checked.dispatchedAt === null) return checked;
  const observation = parseLightObservation(input);
  if (!observation || !sameLightBinding(observation.binding, checked.binding) ||
      observation.entityId !== checked.entityId || observation.sessionId !== checked.sessionId ||
      observation.revision <= checked.lastRevision || observation.receivedAt > now ||
      observation.receivedAt < checked.dispatchedAt) return checked;
  // Even stale/mismatching state advances the watermark: an older matching
  // frame arriving afterwards must not replace the newer contradictory frame.
  const candidate = observation.observedAt >= checked.dispatchedAt && observation.observedAt <= now &&
    observation.observedAt >= checked.lastObservedAt ? observation : null;
  return applyObservedState(change(checked, {
    lastRevision: observation.revision,
    lastObservedAt: observation.observedAt <= now
      ? Math.max(checked.lastObservedAt, observation.observedAt) : checked.lastObservedAt,
    observation: candidate,
  }));
}

/** A scheduler must tick this explicitly; there are no hidden timers or retry loops. */
export function expireLightCommand(record: LightCommandRecord, authorize: LightAuthorizer, now: number): LightCommandRecord {
  return guard(record, authorize, now);
}

/** Disconnect/restart invalidates pending work; reconnect never dispatches it again. */
export function interruptLightCommand(record: LightCommandRecord): LightCommandRecord {
  return isActiveLightCommand(record) ? stop(record, "unavailable") : record;
}
