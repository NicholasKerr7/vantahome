import type { SentHomeInvitation } from '../../services/sentInvitations';

/** A pending invitation cannot be used beyond its link or finite Guest deadline. */
export function sentInvitationDeadline(invitation: SentHomeInvitation): number {
  return Math.min(Date.parse(invitation.expiresAt),
    invitation.role === 'guest' && invitation.accessExpiresAt ? Date.parse(invitation.accessExpiresAt) : Infinity);
}

/** Fail closed if a stored deadline is invalid or elapsed while the page remains open. */
export function isSentInvitationExpired(invitation: SentHomeInvitation, now = Date.now()): boolean {
  const deadline = sentInvitationDeadline(invitation);
  return invitation.status === 'expired' || !Number.isFinite(deadline) || deadline <= now;
}

/** Display the actual server date in the device's local time, including the year. */
export function sentInvitationDate(value: string): string {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) : 'Unavailable';
}

/** Describe the exact terminal receipt without implying a member was removed. */
export function sentInvitationOutcome(status: SentHomeInvitation['status']): string {
  switch (status) {
    case 'cancelled': return 'Invitation revoked. Existing household members and their access are unchanged.';
    case 'accepted': return 'This invitation was already accepted. No member was removed. Review Members to manage their access.';
    case 'declined': return 'This invitation was already declined. No household access was changed.';
    case 'expired': return 'This invitation has expired. No household access was changed.';
    default: return 'Revocation was not confirmed. Refresh to check the current invitation.';
  }
}
