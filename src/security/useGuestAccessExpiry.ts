import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useHomeStore } from '../store/useHomeStore';

/** Refresh permission selectors at the exact guest deadline and whenever the app resumes. */
export function useGuestAccessExpiry(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let notified = '';
    /** Recheck current identity before invalidating an expired cached presentation. */
    function reconcile(): void {
      if (timer) clearTimeout(timer);
      const state = useHomeStore.getState();
      const member = state.household.find((entry) => entry.id === state.activeMemberId);
      if (member?.role !== 'Guest' || !member.accessExpiresAt) return;
      const deadline = Date.parse(member.accessExpiresAt);
      const key = JSON.stringify([state.sessionEpoch, state.activeHomeId, member.id, member.accessExpiresAt]);
      if (!Number.isFinite(deadline) || deadline <= Date.now()) {
        if (notified === key) return;
        notified = key;
        // A new collection reference prompts every access selector to re-evaluate its clock.
        useHomeStore.setState({ household: [...state.household] });
        return;
      }
      timer = setTimeout(reconcile, Math.min(deadline - Date.now() + 1, 2_147_000_000));
    }
    const unsubscribe = useHomeStore.subscribe((state, previous) => {
      if (state.household !== previous.household || state.activeMemberId !== previous.activeMemberId
        || state.activeHomeId !== previous.activeHomeId || state.sessionEpoch !== previous.sessionEpoch) reconcile();
    });
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') reconcile(); });
    reconcile();
    return () => { unsubscribe(); subscription.remove(); if (timer) clearTimeout(timer); };
  }, []);
}
