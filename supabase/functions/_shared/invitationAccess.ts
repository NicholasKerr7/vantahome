import { isUuid, RequestValidationError } from "./validation.ts";

const MAX_GUEST_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;

/** Validate explicit room scope and a bounded guest deadline using the server clock. */
export function validateInvitationAccess(role: string, roomIdsInput: unknown, expiryInput: unknown, now = Date.now()) {
  if (roomIdsInput !== undefined && (!Array.isArray(roomIdsInput) || roomIdsInput.length > 100 || !roomIdsInput.every(isUuid))) {
    throw new RequestValidationError("roomIds must contain valid room identifiers.");
  }
  const roomIds = [...new Set((roomIdsInput ?? []) as string[])];
  if (["guest", "tenant"].includes(role) && roomIds.length === 0) {
    throw new RequestValidationError("Guests and tenants need room access.");
  }
  if (expiryInput == null) return { roomIds, accessExpiresAt: null };
  const expiry = typeof expiryInput === "string" ? Date.parse(expiryInput) : NaN;
  if (role !== "guest" || !Number.isFinite(expiry) || expiry <= now || expiry > now + MAX_GUEST_ACCESS_MS) {
    throw new RequestValidationError("Guest access must end in the next 30 days, or have no expiry.");
  }
  return { roomIds, accessExpiresAt: new Date(expiry).toISOString() };
}
