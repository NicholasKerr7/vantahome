import { DEVICES, ROOMS } from '../../packages/home-scene/src/data';
import { useHomeStore, type HomeState } from '../store/useHomeStore';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from './membership';
import { supabase } from './supabaseClient';

type SetupResult = {
  homeId: string;
  status: 'created' | 'existing';
  catalogVersion: 1;
  roomCount: number;
  deviceCount: number;
};

/** Offer model setup only to the verified owner of an empty account household. */
export function canPrepareModelSimulation(state: HomeState): boolean {
  const actor = state.household.find((member) => member.id === state.activeMemberId);
  return state.membershipReady && Boolean(state.authenticatedUserId) && Boolean(state.activeHomeId)
    && state.accountUserId === state.authenticatedUserId && state.accountHomeId === state.activeHomeId
    && actor?.id === state.authenticatedUserId && actor?.role === 'Owner'
    && state.rooms.length === 0 && state.devices.length === 0;
}

/** Never install a response into another account, home, or same-user login session. */
function isCurrentOwner(scope: HomeState): boolean {
  const current = useHomeStore.getState();
  const actor = current.household.find((member) => member.id === current.activeMemberId);
  return current.membershipReady && current.sessionEpoch === scope.sessionEpoch
    && current.authenticatedUserId === scope.authenticatedUserId
    && current.accountUserId === scope.authenticatedUserId
    && current.activeHomeId === scope.activeHomeId && current.accountHomeId === scope.activeHomeId
    && actor?.id === scope.authenticatedUserId && actor?.role === 'Owner';
}

/** Validate the bounded server receipt rather than assuming any successful RPC created a model. */
function isSetupResult(value: unknown, homeId: string): value is SetupResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.homeId === homeId && ['created', 'existing'].includes(String(result.status))
    && result.catalogVersion === 1 && result.roomCount === ROOMS.length && result.deviceCount === DEVICES.length;
}

/** Create only this owner's empty model registry; the RPC serializes retries and creates no observations or commands. */
export async function prepareModelSimulation(): Promise<void> {
  const scope = useHomeStore.getState();
  if (!supabase || !canPrepareModelSimulation(scope) || !scope.authenticatedUserId || !scope.activeHomeId) {
    throw new Error('Sign in as the owner of an empty home to prepare its 3D model.');
  }
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || identity.user?.id !== scope.authenticatedUserId || !identity.user.email_confirmed_at) {
    throw new Error('Verify your email and sign in again before preparing your home.');
  }
  if (!isCurrentOwner(scope) || !canPrepareModelSimulation(useHomeStore.getState())) {
    throw new Error('Your home changed. Reopen it before preparing the model.');
  }
  const { data, error } = await supabase.rpc('create_model_simulation', { target_home_id: scope.activeHomeId });
  if (error) throw new Error(error.message);
  if (!isCurrentOwner(scope)) throw new Error('Your home changed. Reopen it to see its model.');
  if (!isSetupResult(data, scope.activeHomeId)) throw new Error('Model setup was not confirmed. Retry to check its status.');
  const refreshed = await syncMembershipFromSupabase(scope.authenticatedUserId, scope.activeHomeId);
  if (!isCurrentOwner(scope) || !refreshed || refreshed.homeId !== scope.activeHomeId
    || !applyMembershipSnapshot(refreshed, scope.sessionEpoch)) {
    throw new Error('The model was prepared. Reopen your home to refresh its rooms.');
  }
}
