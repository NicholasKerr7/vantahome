import { useHomeStore, type HomeState } from '../store/useHomeStore';
import { confirmProtectedAccess } from '../security/biometricConfirmation';
import { ACTION_PERMISSIONS, canAdministerMember, roleHasPermission } from '../security/permissions';
import { getGuestAccessExtensionMode, resolveGuestAccessDeadline, type GuestAccessChange } from '../security/guestAccessExtension';
import { supabase } from './supabaseClient';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from './membership';

const REFRESH_REQUIRED = 'Guest access was saved. Reopen your home to refresh the confirmed deadline.';

/** Only a verified Owner or authorized Admin can extend another finite Guest grant. */
function validateGuestAccessAuthority(scope: HomeState, memberId: string): void {
  const actor = scope.household.find((member) => member.id === scope.activeMemberId);
  if (!scope.membershipReady || !scope.authenticatedUserId || !scope.activeHomeId
    || scope.accountUserId !== scope.authenticatedUserId || scope.accountHomeId !== scope.activeHomeId
    || actor?.id !== scope.authenticatedUserId || !['Owner', 'Admin'].includes(actor.role)) {
    throw new Error('Sign in as an authorized household administrator to change Guest access.');
  }
  const target = scope.household.find((member) => member.id === memberId);
  const actorOverrides = scope.memberPermissionOverrides.filter((item) => item.memberId === actor.id);
  if (!target || actor.id === target.id || !canAdministerMember(actor, target)
    || !roleHasPermission(actor.role, 'member.invite', actorOverrides)) {
    throw new Error('Household invitation authority is required to change Guest access.');
  }
  if (target.role !== 'Guest' || !getGuestAccessExtensionMode(target.accessExpiresAt)) {
    throw new Error('Choose a Guest with a valid access deadline.');
  }
  const targetOverrides = scope.memberPermissionOverrides.filter((item) => item.memberId === target.id);
  if (actor.role === 'Admin' && ACTION_PERMISSIONS.some((permission) =>
    roleHasPermission(target.role, permission, targetOverrides)
    && !roleHasPermission(actor.role, permission, actorOverrides))) {
    throw new Error("Ask the home owner to renew this Guest's protected permissions.");
  }
}

/** Match presentation eligibility to the protected write's current membership checks. */
export function canManageGuestAccessExtension(scope: HomeState, memberId: string): boolean {
  try {
    validateGuestAccessAuthority(scope, memberId);
    return true;
  } catch {
    return false;
  }
}

/** Delayed network results must never modify a different account, home, or session. */
function requireUnchangedSession(expected: HomeState): HomeState {
  const current = useHomeStore.getState();
  if (!current.membershipReady || current.sessionEpoch !== expected.sessionEpoch
    || current.activeHomeId !== expected.activeHomeId || current.accountHomeId !== expected.accountHomeId
    || current.accountUserId !== expected.accountUserId || current.activeMemberId !== expected.activeMemberId
    || current.authenticatedUserId !== expected.authenticatedUserId) {
    throw new Error('Your home changed. Reopen Guest access.');
  }
  return current;
}

/** Recheck authority and the exact reviewed deadline after every pre-write await. */
function requireUnchangedGrant(expected: HomeState, memberId: string, change: GuestAccessChange): void {
  const current = requireUnchangedSession(expected);
  validateGuestAccessAuthority(current, memberId);
  resolveGuestAccessDeadline(current.household.find((member) => member.id === memberId)?.accessExpiresAt, change);
}

/** Save a server-checked deadline and apply a fresh snapshot without optimistic access grants. */
export async function saveGuestAccessExtension(memberId: string, change: GuestAccessChange): Promise<string> {
  const scope = useHomeStore.getState();
  if (!supabase || !scope.authenticatedUserId || !scope.activeHomeId) {
    throw new Error('Sign in as an authorized household administrator to change Guest access.');
  }
  validateGuestAccessAuthority(scope, memberId);
  resolveGuestAccessDeadline(scope.household.find((member) => member.id === memberId)?.accessExpiresAt, change);
  await confirmProtectedAccess('Confirm Guest access extension');
  requireUnchangedGrant(scope, memberId, change);
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError) throw new Error(identityError.message);
  if (identity.user?.id !== scope.authenticatedUserId) throw new Error('Your account changed. Sign in again.');
  requireUnchangedGrant(scope, memberId, change);
  const { data: deadline, error } = await supabase.rpc('extend_guest_access', {
    target_home_id: scope.activeHomeId,
    target_user_id: memberId,
    expected_expires_at: change.expectedExpiresAt,
    duration_hours: change.durationHours ?? null,
    new_expires_at: change.expiresAt ?? null,
  });
  if (error) throw new Error(error.message);

  // Once the RPC succeeds, every later failure must distinguish a saved grant
  // from a rejected write. Do not tempt the user to blindly add the time again.
  try {
    requireUnchangedSession(scope);
    if (typeof deadline !== 'string' || !Number.isFinite(Date.parse(deadline))) throw new Error(REFRESH_REQUIRED);
    const result = await syncMembershipFromSupabase(scope.authenticatedUserId, scope.activeHomeId);
    requireUnchangedSession(scope);
    if (!result || result.homeId !== scope.activeHomeId || result.activeMemberId !== scope.authenticatedUserId
      || !applyMembershipSnapshot(result, scope.sessionEpoch)) throw new Error(REFRESH_REQUIRED);
    const confirmedMember = result.household.find((member) => member.id === memberId);
    if (confirmedMember?.role !== 'Guest' || Date.parse(confirmedMember.accessExpiresAt ?? '') !== Date.parse(deadline)) {
      throw new Error('Guest access was saved, then changed. Review the refreshed member access.');
    }
    return new Date(deadline).toISOString();
  } catch (refreshError) {
    if (refreshError instanceof Error && refreshError.message.startsWith('Guest access was saved, then changed.')) {
      throw refreshError;
    }
    throw new Error(REFRESH_REQUIRED);
  }
}
