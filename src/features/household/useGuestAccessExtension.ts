import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { GuestAccessChange } from "../../security/guestAccessExtension";
import { canManageGuestAccessExtension, saveGuestAccessExtension } from "../../services/guestAccessExtension";
import { supabase } from "../../services/supabaseClient";
import { useHomeStore } from "../../store/useHomeStore";

type AccountScope = Pick<ReturnType<typeof useHomeStore.getState>,
  "authenticatedUserId" | "activeHomeId" | "activeMemberId" | "accountUserId" | "accountHomeId" | "sessionEpoch"
>;

/** Capture the authenticated household so an open editor cannot cross account boundaries. */
function accountScope(state: ReturnType<typeof useHomeStore.getState>): AccountScope {
  const { authenticatedUserId, activeHomeId, activeMemberId, accountUserId, accountHomeId, sessionEpoch } = state;
  return { authenticatedUserId, activeHomeId, activeMemberId, accountUserId, accountHomeId, sessionEpoch };
}

/** Compare identity markers without retaining the entire household snapshot. */
function matchesScope(previous: AccountScope, current: AccountScope): boolean {
  return previous.authenticatedUserId === current.authenticatedUserId
    && previous.activeHomeId === current.activeHomeId
    && previous.activeMemberId === current.activeMemberId
    && previous.accountUserId === current.accountUserId
    && previous.accountHomeId === current.accountHomeId
    && previous.sessionEpoch === current.sessionEpoch;
}

/** Save a reviewed deadline only once, exposing success only after server verification. */
export function useGuestAccessExtension(memberId: string) {
  const currentScope = useHomeStore(useShallow(accountScope));
  const membershipReady = useHomeStore((state) => state.membershipReady);
  const [openingScope] = useState(() => accountScope(useHomeStore.getState()));
  const pendingRequest = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDeadline, setSavedDeadline] = useState<string | null>(null);
  const scopeCurrent = membershipReady && matchesScope(openingScope, currentScope);
  const canEdit = Boolean(scopeCurrent && supabase && canManageGuestAccessExtension(useHomeStore.getState(), memberId));

  /** Check current scope at callback time, including requests settled after navigation. */
  const isCurrent = () => useHomeStore.getState().membershipReady
    && matchesScope(openingScope, accountScope(useHomeStore.getState()));

  /** Await the service's authoritative membership update instead of extending local access. */
  const save = async (change: GuestAccessChange) => {
    if (pendingRequest.current || !isCurrent()
      || !supabase || !canManageGuestAccessExtension(useHomeStore.getState(), memberId)) return;
    pendingRequest.current = true;
    setPending(true);
    setError(null);
    try {
      const deadline = await saveGuestAccessExtension(memberId, change);
      if (isCurrent()) setSavedDeadline(deadline);
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : "Unable to update guest access. Please try again.");
    } finally {
      pendingRequest.current = false;
      if (isCurrent()) setPending(false);
    }
  };

  return {
    canEdit,
    pending: scopeCurrent && pending,
    error: scopeCurrent ? error : null,
    savedDeadline: scopeCurrent ? savedDeadline : null,
    save,
    clearError: () => setError(null),
  };
}
