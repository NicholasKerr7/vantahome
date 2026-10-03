import type { HomeInvite } from '../../services/cloudRegistry';

/** Reject elapsed or malformed expiry values; legacy invitations without a value remain server-checked. */
export function isInvitationExpired(invite: HomeInvite, now = Date.now()) {
  if (invite.expires_at === undefined) return false;
  const expiry = Date.parse(invite.expires_at);
  return !Number.isFinite(expiry) || expiry <= now;
}

/** Present the actual server expiry in the user’s local time without inventing a deadline. */
export function invitationExpiryLabel(invite: HomeInvite) {
  if (!invite.expires_at || !Number.isFinite(Date.parse(invite.expires_at))) return undefined;
  const date = new Date(invite.expires_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `${isInvitationExpired(invite) ? 'Expired' : 'Expires'} ${date}`;
}
