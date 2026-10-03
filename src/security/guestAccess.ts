type MembershipAccess = { role: string; accessExpiresAt?: string | null };

/** Expired or malformed guest grants fail closed, including cached/offline state. */
export function hasCurrentMembershipAccess(member: MembershipAccess | undefined, now = Date.now()): boolean {
  if (!member) return false;
  if (member.role !== "Guest" || member.accessExpiresAt == null) return true;
  const expiresAt = Date.parse(member.accessExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
