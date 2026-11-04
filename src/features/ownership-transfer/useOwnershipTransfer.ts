import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import {
  changeTransfer, readTransfer, refreshTransferMembership, transferScope, transferScopeKey,
  type TransferAction, type TransferSnapshot,
} from './ownershipTransferService';

/** Hide sensitive membership reviews when a native or web screen leaves the foreground. */
function foreground(): boolean {
  return (AppState.currentState === 'active' || AppState.currentState == null)
    && (typeof document === 'undefined' || !document.hidden);
}

/** Only subscribe while the ownership workspace is mounted. */
function subscribeForeground(update: () => void): () => void {
  const subscription = AppState.addEventListener('change', update);
  const page = typeof document === 'undefined' ? undefined : document;
  page?.addEventListener('visibilitychange', update);
  return () => { subscription.remove(); page?.removeEventListener('visibilitychange', update); };
}

const EMPTY: TransferSnapshot = { candidates: [], offer: null };
const MESSAGES = {
  offer: 'Offer sent. You remain the Owner until the recipient accepts.',
  cancel: 'Offer cancelled. You remain the Owner.',
  decline: 'Offer declined. Your role is unchanged.',
  accept: 'Transfer accepted. You are now the Owner.',
};

/** Discard selection if an eligible member is removed or their role or expiry changes. */
function rosterKey(household: HomeState['household']): string {
  return JSON.stringify(household.filter((person) => ['Owner', 'Admin', 'Member'].includes(person.role))
    .map((person) => [person.userId ?? person.id, person.role, person.accessExpiresAt ?? null]));
}

/** Keep private directory data, reviews and pending actions local to one visible household session. */
export function useOwnershipTransfer(focused: boolean) {
  const navigation = useContext(NavigationContext);
  const visible = useSyncExternalStore(subscribeForeground, foreground, () => false);
  const identity = useHomeStore((state) => transferScopeKey(transferScope(state)));
  const household = useHomeStore((state) => state.household);
  const roster = useMemo(() => rosterKey(household), [household]);
  const key = focused && visible && identity ? JSON.stringify([identity, roster]) : null;
  const role = key ? transferScope()?.role ?? null : null;
  // This object belongs to one activation only. Even returning to the same account cannot revive an old callback.
  const activation = useMemo(() => ({ live: false, request: 0, submitting: false }), [key]);
  const [view, setView] = useState<{
    owner: typeof activation; data: TransferSnapshot; error: string | null; loading: boolean; busy: boolean;
  } | null>(null);
  const [receipt, setReceipt] = useState<{ account: string; message: string } | null>(null);
  const reviewed = useRef<{ owner: typeof activation; data: TransferSnapshot } | null>(null);
  const scope = transferScope();
  const account = key && scope && JSON.stringify([scope.user, scope.home, scope.epoch]);
  const current = useCallback(() => Boolean(key && activation.live && foreground()
    && (navigation?.isFocused() ?? true) && identity === transferScopeKey(transferScope())
    && roster === rosterKey(useHomeStore.getState().household)), [activation, key, identity, roster, navigation]);

  /** A refresh fences earlier reads and disables any actions captured from the previous result. */
  const refresh = useCallback(async (verifyMembership = false) => {
    const source = transferScope();
    if (!current() || !source || activation.submitting) return;
    const request = ++activation.request;
    reviewed.current = null;
    setView({ owner: activation, data: EMPTY, loading: true, error: null, busy: false });
    try {
      // Another participant can finish the handoff on a different phone.
      if (verifyMembership) await refreshTransferMembership(source);
      if (!current() || request !== activation.request) return;
      const data = await readTransfer(source, () => current() && request === activation.request);
      if (!current() || request !== activation.request) return;
      reviewed.current = { owner: activation, data };
      setView({ owner: activation, data, loading: false, error: null, busy: false });
    } catch (failure) {
      if (current() && request === activation.request) setView({ owner: activation, data: EMPTY, loading: false, busy: false,
        error: failure instanceof Error ? failure.message : 'Ownership details could not be loaded. Refresh to try again.' });
    }
  }, [activation, current]);

  useEffect(() => {
    activation.live = true;
    if (!key) setReceipt(null);
    else void refresh();
    return () => { activation.live = false; activation.request++; reviewed.current = null; };
  }, [activation, key, refresh]);

  const shown = key && view?.owner === activation ? view : null;
  const offer = shown?.data.offer ?? null;
  useEffect(() => {
    if (!offer) return;
    const untilExpiry = Math.max(0, Date.parse(offer.expiresAt) - Date.now());
    const timer = setTimeout(() => { void refresh(); }, Math.min(untilExpiry + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [offer, refresh]);

  /** Send only a specific selection or offer from the last verified, still-visible response. */
  async function submit(action: 'offer' | TransferAction, id: string): Promise<void> {
    const source = transferScope();
    const last = reviewed.current;
    if (!source || !current() || activation.submitting || !account || !last
      || last.owner !== activation || shown?.data !== last.data) return;
    if (action === 'offer') {
      if (last.data.offer || !last.data.candidates.some((person) => person.id === id)) return;
    } else {
      const selected = last.data.offer;
      if (!selected || selected.id !== id || (action === 'cancel') !== (selected.direction === 'outgoing')) return;
      if (Date.parse(selected.expiresAt) <= Date.now()) { await refresh(); return; }
    }
    activation.submitting = true;
    const request = ++activation.request;
    setReceipt(null);
    setView({ owner: activation, data: last.data, loading: false, busy: true, error: null });
    try {
      const command = action === 'offer'
        ? { action, candidateId: id, requestId: randomUUID() } as const
        : { action, offerId: id };
      await changeTransfer(source, command, () => current() && request === activation.request);
      // Acceptance can replace Member with Owner while this call is returning.
      const now = transferScope();
      if (now && now.user === source.user && now.home === source.home && now.epoch === source.epoch
        && foreground() && (navigation?.isFocused() ?? true)) setReceipt({ account, message: MESSAGES[action] });
    } catch (failure) {
      if (current()) {
        reviewed.current = null;
        setView({ owner: activation, data: EMPTY, loading: false, busy: false,
          error: failure instanceof Error ? failure.message : 'The result is unconfirmed. Refresh before trying again.' });
      }
      return;
    } finally {
      activation.submitting = false;
    }
    if (current()) await refresh();
  }

  return {
    scopeKey: key, role, offer, candidates: shown?.data.candidates ?? EMPTY.candidates,
    loading: !!key && (!shown || shown.loading), busy: shown?.busy ?? false, error: shown?.error ?? null,
    notice: account && receipt?.account === account ? receipt.message : null, refresh: () => refresh(true),
    send: (id: string) => submit('offer', id),
    respond: (id: string, action: TransferAction) => submit(action, id),
  };
}
