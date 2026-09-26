import {
  isActiveLightCommand,
  parseLightBinding,
  parseLightPowerCommand,
  permitsLightPower,
  sameLightBinding,
  type LightAuthorizer,
  type LightCommandRecord,
  type LightPowerCommand,
  type LightPrincipal,
  type PilotLight,
} from "./lightContract";

export const LIGHT_JOURNAL_CAPACITY = 32;

export type LightAdmission =
  | { kind: "reserved" | "duplicate"; record: LightCommandRecord; journal: readonly LightCommandRecord[] }
  | { kind: "refused"; reason: "invalid_command" | "expired" | "permission_denied" | "unsupported" | "conflict" | "busy" | "capacity" };

/** Compare canonical allowlisted intent, not arbitrary JSON/key order. */
function sameIntent(left: LightPowerCommand, right: LightPowerCommand): boolean {
  return left.deviceId === right.deviceId && left.commandId === right.commandId &&
    left.nonce === right.nonce && left.idempotencyKey === right.idempotencyKey &&
    left.on === right.on && left.createdAt === right.createdAt && left.expiresAt === right.expiresAt;
}

/**
 * Plan a bounded reservation without IO. The journal argument is model-owned,
 * not deserialized client input. A real bridge must serialize admissions and
 * durably commit this plan before dispatch; this function is NOT that storage.
 */
export function planLightAdmission(
  journal: readonly LightCommandRecord[],
  input: unknown,
  principal: LightPrincipal,
  light: PilotLight,
  authorize: LightAuthorizer,
  now: number,
): LightAdmission {
  const parsed = parseLightPowerCommand(input, now);
  if (!parsed.ok) return { kind: "refused", reason: parsed.reason };
  const command = parsed.command;
  const binding = parseLightBinding(light.binding);
  if (!binding || binding.deviceId !== command.deviceId) return { kind: "refused", reason: "invalid_command" };
  const actor = Object.freeze({ actorId: principal.actorId, homeId: principal.homeId });
  if (!permitsLightPower(actor, binding, authorize)) return { kind: "refused", reason: "permission_denied" };
  if (light.canSetPower !== true) return { kind: "refused", reason: "unsupported" };
  const collisions = journal.filter((entry) =>
    entry.command.commandId === command.commandId || entry.command.nonce === command.nonce ||
    entry.command.idempotencyKey === command.idempotencyKey,
  );
  if (collisions.length > 0) {
    const previous = collisions[0];
    return collisions.length === 1 && sameIntent(previous.command, command) &&
      previous.principal.actorId === actor.actorId && previous.principal.homeId === actor.homeId &&
      sameLightBinding(previous.binding, binding)
      ? { kind: "duplicate", record: previous, journal }
      : { kind: "refused", reason: "conflict" };
  }
  // Serialize one light's effects: a second command cannot borrow the first
  // one's observation/context. No active or terminal replay records are evicted.
  if (journal.some((entry) => isActiveLightCommand(entry) && sameLightBinding(entry.binding, binding))) {
    return { kind: "refused", reason: "busy" };
  }
  if (journal.length >= LIGHT_JOURNAL_CAPACITY) return { kind: "refused", reason: "capacity" };
  const record: LightCommandRecord = Object.freeze({
    command, principal: actor, binding, status: "reserved",
    sessionId: null, entityId: null, requestId: null, dispatchedAt: null,
    lastRevision: 0, lastObservedAt: 0, serviceContextId: null, observation: null,
  });
  return { kind: "reserved", record, journal: Object.freeze([...journal, record]) };
}
