import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useHomeStore, selectActiveMember, type HomeState, type HouseholdMember } from '../../store/useHomeStore';
import { canAdministerMember, roleHasPermission, type ActionPermission } from '../../security/permissions';
import { confirmProtectedAccess } from '../../security/biometricConfirmation';
import { setMemberPermissionOverrideRemote } from '../../services/memberPermissions';
import { supabase } from '../../services/supabaseClient';
import { runtimePolicy } from '../../config/runtimeMode';
import { useAccountIdentity } from '../account/useAccountIdentity';
import { isAccountScopeCurrent, type AccountScope } from '../account/accountIdentity';

// Shared across reopened editors. Only one request for a remote permission may
// be in flight, so server ordering and local state cannot disagree after a race.
const pending = new Set<string>();
const listeners = new Set<() => void>();
let revision = 0;
/** Publish pending transitions without retaining completed requests or account data. */
function publish() { revision += 1; listeners.forEach(listener => listener()); }
/** Subscribe editors to the shared mutation lock. */
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Identify the remote row independently of the editor or actor who opened it. */
function requestKey(state: Pick<HomeState, 'activeHomeId'>, memberId: string, permission: ActionPermission) {
  return JSON.stringify([state.activeHomeId, memberId, permission]);
}

/** Resolve the target again: a stale rendered role must never authorize a change. */
export function canEditMemberPermission(member: HouseholdMember, permission: ActionPermission): boolean {
  const state = useHomeStore.getState();
  const target = state.household.find(candidate => candidate.id === member.id && candidate.userId === member.userId);
  const actor = selectActiveMember(state);
  return Boolean(target && canAdministerMember(actor, target) && actor
    && roleHasPermission(actor.role, permission, state.memberPermissionOverrides.filter(item => item.memberId === actor.id)));
}

/** Confirm and publish permission changes only after server acceptance, with visible retry feedback. */
export function useMemberPermissionUpdate() {
  useSyncExternalStore(subscribe, () => revision, () => revision);
  const [failure, setFailure] = useState<{ scope: AccountScope; message: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { scope: current } = useAccountIdentity();

  /** Reject repeated taps while verification or a server write for this exact row is pending. */
  async function updatePermissionOverride(member: HouseholdMember, permission: ActionPermission, allowed: boolean | null) {
    const scope = useHomeStore.getState();
    const key = requestKey(scope, member.id, permission);
    const scopeCurrent = () => isAccountScopeCurrent(scope, useHomeStore.getState())
      && scope.activeMemberId === useHomeStore.getState().activeMemberId;
    if (!mounted.current || pending.has(key) || !canEditMemberPermission(member, permission)) return;
    pending.add(key); publish(); setFailure(null);
    let accepted = false;
    try {
      await confirmProtectedAccess('Confirm household administration change');
      if (!scopeCurrent() || !canEditMemberPermission(member, permission)) return;
      if (supabase) {
        if (!scope.membershipReady || !scope.activeHomeId || !scope.authenticatedUserId || !member.userId) {
          throw new Error('Refresh your home before changing permissions.');
        }
        await setMemberPermissionOverrideRemote(scope.activeHomeId, member.userId, permission, allowed, scope.authenticatedUserId);
      } else if (!runtimePolicy.allowUnauthenticatedDemo) {
        throw new Error('Connect your account before changing permissions.');
      }
      // Never grant optimistically or roll back an unrelated, later confirmed choice.
      if (scopeCurrent() && canEditMemberPermission(member, permission)) {
        accepted = true;
        await useHomeStore.getState().setMemberPermissionOverride(member.id, permission, allowed);
      }
    } catch (error) {
      if (mounted.current && scopeCurrent()) setFailure({ scope,
        message: accepted ? 'Permission updated in this session, but could not be saved on this device. Refresh home access.'
          : `Permission not changed. ${error instanceof Error ? error.message : 'Please try again.'}` });
    } finally { pending.delete(key); publish(); }
  }

  return {
    updatePermissionOverride,
    permissionError: failure && isAccountScopeCurrent(failure.scope, current) ? failure.message : null,
    permissionPending: (memberId: string, permission: ActionPermission) => pending.has(requestKey(current, memberId, permission)),
  };
}
