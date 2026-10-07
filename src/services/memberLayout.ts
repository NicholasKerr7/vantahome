import { useHomeStore, type HomeState } from '../store/useHomeStore';
import { confirmProtectedAccess } from '../security/biometricConfirmation';
import { supabase } from './supabaseClient';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from './membership';

/** Reject stale identities, whole-home targets, and grants to expired guests. */
function validateLayoutSharing(scope: HomeState, memberId: string, shared: boolean): void {
  const actor = scope.household.find((member) => member.id === scope.activeMemberId);
  if (!scope.membershipReady || !scope.authenticatedUserId || !scope.activeHomeId
    || scope.accountUserId !== scope.authenticatedUserId || scope.accountHomeId !== scope.activeHomeId
    || actor?.id !== scope.authenticatedUserId || actor.role !== 'Owner') {
    throw new Error('Sign in as the home owner to share the interior layout.');
  }
  const target = scope.household.find((member) => member.id === memberId);
  if (!target || !['Guest', 'Tenant'].includes(target.role) || typeof shared !== 'boolean') {
    throw new Error('Choose a Guest or Tenant in this home.');
  }
  if (shared && target.accessExpiresAt != null) {
    const deadline = Date.parse(target.accessExpiresAt);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('Guest access has expired.');
  }
}

/** Use the same account, owner, target, and expiry checks for presentation and writes. */
export function canManageMemberInteriorLayout(scope: HomeState, memberId: string, shared: boolean): boolean {
  try {
    validateLayoutSharing(scope, memberId, shared);
    return true;
  } catch {
    return false;
  }
}

/** Async work may install results only into the exact account, home, and session that started it. */
function requireUnchangedScope(expected: HomeState, memberId: string, shared: boolean): void {
  const current = useHomeStore.getState();
  if (current.sessionEpoch !== expected.sessionEpoch || current.activeHomeId !== expected.activeHomeId
    || current.accountHomeId !== expected.accountHomeId || current.accountUserId !== expected.accountUserId
    || current.authenticatedUserId !== expected.authenticatedUserId) {
    throw new Error('Your home changed. Reopen member access.');
  }
  validateLayoutSharing(current, memberId, shared);
}

/** Save owner-only layout consent, then atomically install a verified server membership snapshot. */
export async function saveMemberInteriorLayout(memberId: string, shareInteriorLayout: boolean): Promise<void> {
  const scope = useHomeStore.getState();
  if (!supabase || !scope.authenticatedUserId || !scope.activeHomeId) {
    throw new Error('Sign in as the home owner to share the interior layout.');
  }
  validateLayoutSharing(scope, memberId, shareInteriorLayout);
  await confirmProtectedAccess('Confirm interior layout sharing');
  requireUnchangedScope(scope, memberId, shareInteriorLayout);
  const { data, error: identityError } = await supabase.auth.getUser();
  if (identityError) throw new Error(identityError.message);
  if (data.user?.id !== scope.authenticatedUserId) throw new Error('Your account changed. Sign in again.');
  requireUnchangedScope(scope, memberId, shareInteriorLayout);
  const { error } = await supabase.rpc('set_member_interior_layout', {
    target_home_id: scope.activeHomeId,
    target_user_id: memberId,
    share_layout: shareInteriorLayout,
  });
  if (error) throw new Error(error.message);
  requireUnchangedScope(scope, memberId, shareInteriorLayout);
  const result = await syncMembershipFromSupabase(scope.authenticatedUserId, scope.activeHomeId);
  requireUnchangedScope(scope, memberId, shareInteriorLayout);
  if (!result || result.homeId !== scope.activeHomeId || result.activeMemberId !== scope.authenticatedUserId
    || !applyMembershipSnapshot(result, scope.sessionEpoch)) {
    throw new Error('Layout sharing was saved. Reopen your home to refresh member access.');
  }
  const confirmedMember = result.household.find((member) => member.id === memberId);
  if (!confirmedMember || confirmedMember.shareInteriorLayout !== shareInteriorLayout) {
    throw new Error('Member access changed. Review the refreshed layout setting.');
  }
}
