/**
 * Pure one-light bridge contract. Nothing here connects to a home, authenticates
 * a caller, persists a journal, or enables a mobile/production transport.
 */
import type { ExplicitPowerCommand } from "../src/domain/commandEnvelope";

/** Replay-safe subset of the existing mobile envelope: implicit toggle is excluded. */
export type LightPowerCommand = ExplicitPowerCommand;

/** Trusted registry binding, not identity supplied by a mobile command. */
export type LightBinding = Readonly<{
  homeId: string;
  bridgeId: string;
  integrationId: string;
  deviceId: string;
  registryEntryId: string;
}>;

/** The mutable integration address is separate from the stable registry binding. */
export type PilotLight = Readonly<{
  binding: LightBinding;
  entityId: string;
  canSetPower: boolean;
}>;

/** Authenticated adapter-session observations, never inferred from command intent. */
export type LightObservation = Readonly<{
  binding: LightBinding;
  entityId: string;
  sessionId: string;
  revision: number;
  observedAt: number;
  receivedAt: number;
  availability: "available" | "unknown" | "unavailable";
  isOn: boolean | null;
  assumedState: boolean;
  contextId: string | null;
}>;

export type CommandParseResult =
  | { ok: true; command: LightPowerCommand }
  | { ok: false; reason: "invalid_command" | "expired" };

/** Supplied by the future authenticated bridge boundary, never by the envelope. */
export type LightPrincipal = Readonly<{ actorId: string; homeId: string }>;

/** The production implementation must read current action-level authorization. */
export type LightAuthorizer = (principal: LightPrincipal, binding: LightBinding) => boolean;

/** Reference-model outcomes deliberately stop short of physical confirmation. */
export type LightCommandStatus =
  | "reserved" | "dispatching" | "service_completed" | "state_observed"
  | "expired" | "refused" | "unavailable" | "outcome_unknown";

/** Canonical lifecycle record; storage must validate it and keep credentials out. */
export type LightCommandRecord = Readonly<{
  command: LightPowerCommand;
  principal: LightPrincipal;
  binding: LightBinding;
  status: LightCommandStatus;
  sessionId: string | null;
  entityId: string | null;
  requestId: number | null;
  dispatchedAt: number | null;
  lastRevision: number;
  lastObservedAt: number;
  serviceContextId: string | null;
  observation: LightObservation | null;
}>;

const COMMAND_KEYS = [
  "deviceId", "op", "on", "commandId", "nonce", "createdAt", "expiresAt",
  "idempotencyKey",
] as const;
const BINDING_KEYS = [
  "homeId", "bridgeId", "integrationId", "deviceId", "registryEntryId",
] as const;

/** Accept plain data properties only; accessors/prototype payloads are not JSON. */
export function isDataRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && "value" in descriptor);
  });
}

/** Identifiers are bounded opaque tokens; labels, URLs, and secrets are not IDs. */
export function isBridgeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

/** Bridge-local clocks and revisions must be explicit, finite, nonnegative integers. */
export function isBridgeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Validate the trusted registry's shape without interpreting it as authentication. */
export function parseLightBinding(value: unknown): LightBinding | null {
  if (!isDataRecord(value) || Object.keys(value).length !== BINDING_KEYS.length ||
      !BINDING_KEYS.every((key) => isBridgeIdentifier(value[key]))) return null;
  return Object.freeze({
    homeId: value.homeId as string,
    bridgeId: value.bridgeId as string,
    integrationId: value.integrationId as string,
    deviceId: value.deviceId as string,
    registryEntryId: value.registryEntryId as string,
  });
}

/** Compare every scope component so reused device/entity IDs cannot cross a home. */
export function sameLightBinding(left: LightBinding, right: LightBinding): boolean {
  return BINDING_KEYS.every((key) => left[key] === right[key]);
}

/** Validate a normalized adapter observation again at the lifecycle boundary. */
export function parseLightObservation(value: unknown): LightObservation | null {
  if (!isDataRecord(value)) return null;
  const binding = parseLightBinding(value.binding);
  const available = value.availability === "available";
  if (!binding || typeof value.entityId !== "string" ||
      !/^light\.[a-z0-9_]{1,249}$/.test(value.entityId) ||
      !isBridgeIdentifier(value.sessionId) || !isBridgeTimestamp(value.revision) || value.revision === 0 ||
      !isBridgeTimestamp(value.observedAt) || !isBridgeTimestamp(value.receivedAt) ||
      value.observedAt > value.receivedAt + 5_000 ||
      !(value.availability === "available" || value.availability === "unknown" || value.availability === "unavailable") ||
      (available ? typeof value.isOn !== "boolean" : value.isOn !== null) ||
      typeof value.assumedState !== "boolean" ||
      !(value.contextId === null || isBridgeIdentifier(value.contextId))) return null;
  return Object.freeze({
    binding,
    entityId: value.entityId,
    sessionId: value.sessionId,
    revision: value.revision,
    observedAt: value.observedAt,
    receivedAt: value.receivedAt,
    availability: value.availability as LightObservation["availability"],
    isOn: value.isOn as boolean | null,
    assumedState: value.assumedState,
    contextId: value.contextId,
  });
}

/** Only these phases can advance; terminal evidence is immutable. */
export function isActiveLightCommand(record: LightCommandRecord): boolean {
  return ["reserved", "dispatching", "service_completed"].includes(record.status);
}

/** Fail closed if the future trusted policy boundary throws or returns a non-boolean. */
export function permitsLightPower(
  principal: LightPrincipal,
  binding: LightBinding,
  authorize: LightAuthorizer,
): boolean {
  if (!isBridgeIdentifier(principal.actorId) || principal.homeId !== binding.homeId) return false;
  try { return authorize(principal, binding) === true; } catch { return false; }
}

/** Decode the allowlisted envelope without defaults, coercion, or caller authority. */
export function parseLightPowerCommand(value: unknown, now: number): CommandParseResult {
  if (!isBridgeTimestamp(now) || !isDataRecord(value) ||
      Object.keys(value).length !== COMMAND_KEYS.length ||
      !COMMAND_KEYS.every((key) => Object.hasOwn(value, key)) ||
      value.op !== "toggle" || typeof value.on !== "boolean" ||
      ![value.deviceId, value.commandId, value.nonce, value.idempotencyKey].every(isBridgeIdentifier) ||
      !isBridgeTimestamp(value.createdAt) || !isBridgeTimestamp(value.expiresAt) ||
      value.createdAt < now - 30_000 || value.createdAt > now + 5_000 ||
      value.expiresAt <= value.createdAt || value.expiresAt > value.createdAt + 60_000) {
    return { ok: false, reason: "invalid_command" };
  }
  if (value.expiresAt <= now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    command: Object.freeze({
      deviceId: value.deviceId as string,
      op: "toggle",
      on: value.on,
      commandId: value.commandId as string,
      nonce: value.nonce as string,
      idempotencyKey: value.idempotencyKey as string,
      createdAt: value.createdAt,
      expiresAt: value.expiresAt,
    }),
  };
}
