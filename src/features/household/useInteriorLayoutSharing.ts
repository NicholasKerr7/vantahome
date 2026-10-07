import { useRef, useState } from "react";
import { canManageMemberInteriorLayout, saveMemberInteriorLayout } from "../../services/memberLayout";
import { supabase } from "../../services/supabaseClient";
import { useHomeStore } from "../../store/useHomeStore";

type HouseholdScope = Pick<ReturnType<typeof useHomeStore.getState>,
  "authenticatedUserId" | "activeHomeId" | "activeMemberId" | "accountUserId" | "accountHomeId" | "sessionEpoch"
>;
type SharingError = { memberId: string; message: string; scope: HouseholdScope };

/** Retain only the request's identity markers while displaying retry feedback. */
function captureScope(): HouseholdScope {
  const { authenticatedUserId, activeHomeId, activeMemberId, accountUserId, accountHomeId, sessionEpoch } = useHomeStore.getState();
  return { authenticatedUserId, activeHomeId, activeMemberId, accountUserId, accountHomeId, sessionEpoch };
}

/** Keep an old request's feedback out of a different account, home, or session. */
function isCurrentScope(previous: HouseholdScope) {
  const current = useHomeStore.getState();
  return current.authenticatedUserId === previous.authenticatedUserId
    && current.activeHomeId === previous.activeHomeId
    && current.activeMemberId === previous.activeMemberId
    && current.accountUserId === previous.accountUserId
    && current.accountHomeId === previous.accountHomeId
    && current.sessionEpoch === previous.sessionEpoch
    && current.membershipReady;
}

/** Limit the presentation and stale callbacks to the current, authenticated homeowner. */
function canEditInteriorLayout(memberId: string, shared?: boolean) {
  const state = useHomeStore.getState();
  const target = state.household.find((member) => member.id === memberId);
  return Boolean(supabase && canManageMemberInteriorLayout(state, memberId, shared ?? !target?.shareInteriorLayout));
}

/** Await the verified service snapshot; never grant interior visibility optimistically. */
export function useInteriorLayoutSharing() {
  const requestPending = useRef(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [error, setError] = useState<SharingError | null>(null);

  /** Save one person's consent with a synchronous latch against repeated taps. */
  const updateInteriorLayout = async (memberId: string, shared: boolean) => {
    if (requestPending.current || !canEditInteriorLayout(memberId, shared)) return;
    const scope = captureScope();
    requestPending.current = true;
    setPendingMemberId(memberId);
    setError(null);
    try {
      await saveMemberInteriorLayout(memberId, shared);
    } catch (failure) {
      if (isCurrentScope(scope)) {
        setError({
          memberId,
          scope,
          message: failure instanceof Error ? failure.message : "Unable to update interior layout sharing. Please try again.",
        });
      }
    } finally {
      requestPending.current = false;
      setPendingMemberId(null);
    }
  };

  /** Associate an error only with the person and household that initiated it. */
  const interiorLayoutError = (memberId: string) =>
    error?.memberId === memberId && isCurrentScope(error.scope) ? error.message : null;

  return { canEditInteriorLayout, pendingMemberId, updateInteriorLayout, interiorLayoutError };
}

export type InteriorLayoutSharingModel = ReturnType<typeof useInteriorLayoutSharing>;
