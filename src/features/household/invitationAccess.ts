export const GUEST_ACCESS_DURATIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 0, label: "No expiry" },
] as const;

export type GuestAccessHours = (typeof GUEST_ACCESS_DURATIONS)[number]["hours"];

/** Use only deliberately selected current rooms; room-limited invitations never guess a room. */
export function buildInvitationAccess(
  role: string,
  selectedRoomIds: readonly string[],
  availableRoomIds: readonly string[],
  guestAccessHours: GuestAccessHours,
  now = Date.now(),
) {
  const limited = role === "Guest" || role === "Tenant";
  const roomIds = limited ? [...new Set(selectedRoomIds)] : [];
  if (limited && (!roomIds.length || roomIds.some((id) => !availableRoomIds.includes(id)))) {
    throw new Error("Choose at least one available room for this person.");
  }
  if (!GUEST_ACCESS_DURATIONS.some((duration) => duration.hours === guestAccessHours)) {
    throw new Error("Choose a valid guest access duration.");
  }
  return {
    roomIds,
    accessExpiresAt: role === "Guest" && guestAccessHours > 0
      ? new Date(now + guestAccessHours * 60 * 60 * 1000).toISOString()
      : null,
  };
}

/** Present a fixed access deadline in the device's locale without implying an automatic renewal. */
export function formatGuestAccessExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "No automatic expiry";
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return "Access unavailable";
  return `Access ends ${new Date(timestamp).toLocaleString()}`;
}
