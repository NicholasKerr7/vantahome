import { useShallow } from 'zustand/react/shallow';
import { runtimePolicy } from '../../config/runtimeMode';
import { supabase } from '../../services/supabaseClient';
import { useHomeStore } from '../../store/useHomeStore';
import { resolveAccountIdentity } from './accountIdentity';

/** Subscribe only to identity fields, so device telemetry does not redraw the header. */
export function useAccountIdentity() {
  const state = useHomeStore(useShallow((store) => ({
    authenticatedUserId: store.authenticatedUserId, accountUserId: store.accountUserId,
    activeHomeId: store.activeHomeId, accountHomeId: store.accountHomeId,
    sessionEpoch: store.sessionEpoch, membershipReady: store.membershipReady,
    profile: store.profile, household: store.household,
  })));
  return { identity: resolveAccountIdentity(state, runtimePolicy.allowUnauthenticatedDemo && !supabase), scope: state };
}
