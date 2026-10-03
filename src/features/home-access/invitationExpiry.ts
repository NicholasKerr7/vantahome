import type { HomeInvite } from '../../services/cloudRegistry';

/** Reject elapsed or malformed expiry values; legacy invitations without a value remain server-checked. */
export function isInvitationExpired(invite: HomeInvite, now = Date.now()) {
  const deadlines = [invite.expires_at, invite.role === 'guest' ? invite.access_expires_at : null];
  return deadlines.some((value) => value != null && (!Number.isFinite(Date.parse(value)) || Date.parse(value) <= now));
}

/** Present the actual server expiry in the user’s local time without inventing a deadline. */
export function invitationExpiryLabel(invite: HomeInvite) {
  if (!invite.expires_at || !Number.isFinite(Date.parse(invite.expires_at))) return undefined;
  const date = new Date(invite.expires_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `${Date.parse(invite.expires_at) <= Date.now() ? 'Expired' : 'Expires'} ${date}`;
}
