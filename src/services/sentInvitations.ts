import { confirmProtectedAccess } from '../security/biometricConfirmation';
import { captureMembershipRead, isMembershipReadCurrent } from './membershipRevision';
import { isAccountScopeCurrent } from '../features/account/accountIdentity';
import { ACTION_PERMISSIONS, roleHasPermission, type HouseholdRole } from '../security/permissions';
import { selectActiveMember, useHomeStore, type HomeState } from '../store/useHomeStore';
import { supabase } from './supabaseClient';

export type SentInvitationRole = 'admin' | 'member' | 'guest' | 'tenant';
export type SentInvitationStatus = 'pending' | 'expired' | 'accepted' | 'declined' | 'cancelled';
export type SentHomeInvitation = {
  id: string;
  homeId: string;
  homeName: string;
  email: string;
  role: SentInvitationRole;
  roomIds: string[];
  createdAt: string;
  expiresAt: string;
  accessExpiresAt: string | null;
  revision: string;
  status: SentInvitationStatus;
  canCancel: boolean;
};
export type SentInvitationCancellation = Pick<SentHomeInvitation, 'id' | 'homeId' | 'status' | 'revision'>;

export const SENT_INVITATIONS_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES: Record<SentInvitationRole, HouseholdRole> = { admin: 'Admin', member: 'Member', guest: 'Guest', tenant: 'Tenant' };
const STATUSES: readonly SentInvitationStatus[] = ['pending', 'expired', 'accepted', 'declined', 'cancelled'];
const SCOPE_CHANGED = 'Your account or home access changed. Reopen sent invitations.';

/** Only the verified Owner or an Admin with effective invitation authority can open this home inbox. */
export function canManageSentInvitations(state: HomeState): boolean {
  const actor = selectActiveMember(state);
  return Boolean(state.membershipReady && state.authenticatedUserId && state.activeHomeId
    && state.accountUserId === state.authenticatedUserId && state.accountHomeId === state.activeHomeId
    && actor?.id === state.authenticatedUserId && actor.userId === state.authenticatedUserId
    && ['Owner', 'Admin'].includes(actor.role)
    && roleHasPermission(actor.role, 'member.invite', state.memberPermissionOverrides.filter(item => item.memberId === actor.id)));
}

/** Match the database's role delegation boundary when showing or cancelling a returned invitation. */
function canManageRole(state: HomeState, role: SentInvitationRole): boolean {
  if (!canManageSentInvitations(state)) return false;
  const actor = selectActiveMember(state)!;
  if (actor.role === 'Owner') return true;
  if (role === 'admin') return false;
  const overrides = state.memberPermissionOverrides.filter(item => item.memberId === actor.id);
  return ACTION_PERMISSIONS.every(permission => !roleHasPermission(ROLES[role], permission)
    || roleHasPermission(actor.role, permission, overrides));
}

/** Reject a delayed response after logout, home selection, role loss, or invitation-authority revocation. */
function requireCurrentScope(scope: HomeState, role?: SentInvitationRole): void {
  const current = useHomeStore.getState();
  if (!isAccountScopeCurrent(scope, current) || scope.activeMemberId !== current.activeMemberId
    || !canManageSentInvitations(current) || (role !== undefined && !canManageRole(current, role))) {
    throw new Error(SCOPE_CHANGED);
  }
}

/** Latch every policy/scope transition during awaits, even if a later update restores the old policy. */
function beginScopedRequest(scope: HomeState, role?: SentInvitationRole) {
  const read = captureMembershipRead();
  let superseded = false;
  const dispose = useHomeStore.subscribe(() => {
    const current = useHomeStore.getState();
    if (!isAccountScopeCurrent(scope, current) || scope.activeMemberId !== current.activeMemberId
      || !isMembershipReadCurrent(read)) superseded = true;
  });
  return {
    dispose,
    assertCurrent: () => {
      if (superseded || !isMembershipReadCurrent(read)) throw new Error(SCOPE_CHANGED);
      requireCurrentScope(scope, role);
    },
  };
}

/** Verify the server-backed account before making either scoped invitation request. */
async function verifyScope(scope: HomeState, assertCurrent: () => void): Promise<void> {
  if (!supabase) throw new Error('Connect your account to manage sent invitations.');
  assertCurrent();
  if (!scope.activeHomeId || !UUID.test(scope.activeHomeId)) throw new Error('Verify home access again.');
  const { data, error } = await supabase.auth.getUser();
  assertCurrent();
  if (error || data.user?.id !== scope.authenticatedUserId || !data.user.email_confirmed_at) {
    throw new Error('Verify your account email and sign in again to manage invitations.');
  }
}

/** Validate untrusted RPC objects without accepting arrays or nullable envelopes. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Keep the database generation opaque so large bigint revisions never lose precision. */
function isRevision(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
    && BigInt(value) <= 9223372036854775807n;
}

/** Return only finite server timestamps suitable for bounded lifecycle presentation. */
function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

/** Fail the complete list on malformed or cross-home data instead of silently hiding invitations. */
function parseInvitation(value: unknown, homeId: string): SentHomeInvitation {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id)
    || value.home_id !== homeId || typeof value.home_name !== 'string'
    || !value.home_name.trim() || value.home_name.length > 120 || typeof value.email !== 'string' || value.email.length > 320
    || !/^\S+@\S+\.\S+$/.test(value.email) || value.email !== value.email.trim().toLowerCase()
    || typeof value.role !== 'string' || !Object.prototype.hasOwnProperty.call(ROLES, value.role)
    || !Array.isArray(value.room_ids) || value.room_ids.length > 500
    || !value.room_ids.every(id => typeof id === 'string' && UUID.test(id))
    || new Set(value.room_ids).size !== value.room_ids.length
    || !isTimestamp(value.created_at) || !isTimestamp(value.expires_at)
    || !(value.access_expires_at === null || isTimestamp(value.access_expires_at))
    || !isRevision(value.revision) || !['pending', 'expired'].includes(String(value.status))
    || typeof value.can_cancel !== 'boolean' || value.can_cancel !== (value.status === 'pending')
    || (value.access_expires_at !== null && value.role !== 'guest')) {
    throw new Error('Sent invitations could not be verified. Refresh to try again.');
  }
  return {
    id: value.id, homeId, homeName: value.home_name, email: value.email, role: value.role as SentInvitationRole,
    roomIds: value.room_ids as string[], createdAt: value.created_at, expiresAt: value.expires_at,
    accessExpiresAt: value.access_expires_at, revision: value.revision,
    status: value.status as SentInvitationStatus, canCancel: value.can_cancel,
  };
}

/** List the latest pending/expired invitations for the currently verified household only. */
export async function listSentInvitations(): Promise<SentHomeInvitation[]> {
  const scope = useHomeStore.getState();
  const request = beginScopedRequest(scope);
  try {
    await verifyScope(scope, request.assertCurrent);
    const { data, error } = await supabase!.rpc('list_sent_home_invitations', { target_home_id: scope.activeHomeId });
    request.assertCurrent();
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length > SENT_INVITATIONS_LIMIT) throw new Error('Sent invitations could not be verified. Refresh to try again.');
    const invitations = data.map(row => parseInvitation(row, scope.activeHomeId!));
    if (new Set(invitations.map(invitation => invitation.id)).size !== invitations.length) {
      throw new Error('Sent invitations could not be verified. Refresh to try again.');
    }
    invitations.forEach(invitation => requireCurrentScope(scope, invitation.role));
    return invitations;
  } finally { request.dispose(); }
}

/** Cancel the reviewed generation only; acceptance/expiry races return their actual lifecycle status. */
export async function cancelSentInvitation(
  invitation: SentHomeInvitation,
  stillConfirmed: () => boolean = () => true,
): Promise<SentInvitationCancellation> {
  const scope = useHomeStore.getState();
  if (!UUID.test(invitation.id) || invitation.homeId !== scope.activeHomeId || !isRevision(invitation.revision)
    || !Object.prototype.hasOwnProperty.call(ROLES, invitation.role) || invitation.status !== 'pending' || !invitation.canCancel) {
    throw new Error('Choose a current pending invitation and refresh before trying again.');
  }
  const request = beginScopedRequest(scope, invitation.role);
  /** A hidden or dismissed UI review must not dispatch after local authentication returns. */
  const assertConfirmed = () => {
    request.assertCurrent();
    if (!stillConfirmed()) throw new Error('Invitation cancellation was dismissed. Review the invitation again.');
  };
  try {
    assertConfirmed();
    await confirmProtectedAccess('Confirm invitation cancellation');
    await verifyScope(scope, assertConfirmed);
    assertConfirmed();
    const { data, error } = await supabase!.rpc('cancel_sent_home_invitation', {
      target_home_id: invitation.homeId, target_invite_id: invitation.id, expected_revision: invitation.revision,
    });
    assertConfirmed();
    if (error) throw new Error(error.message);
    if (!isRecord(data) || data.id !== invitation.id || data.home_id !== invitation.homeId
      || !isRevision(data.revision) || BigInt(data.revision) < BigInt(invitation.revision)
      || !STATUSES.includes(data.status as SentInvitationStatus) || data.status === 'pending') {
      throw new Error('The invitation outcome was not confirmed. Refresh sent invitations before trying again.');
    }
    return { id: invitation.id, homeId: invitation.homeId, revision: data.revision, status: data.status as SentInvitationStatus };
  } finally { request.dispose(); }
}
