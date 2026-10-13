import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../../services/supabaseClient';
import { useHomeStore } from '../../store/useHomeStore';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';
import { listAccountSessions, signOutOtherAccountSessions, type AccountSessionsSnapshot } from './accountSessions';

type SessionView = { key: string; snapshot: AccountSessionsSnapshot | null; error: string | null; message: string | null; loading: boolean };

/** Keep session inventory and confirmations private to the current foreground account scope. */
export function useAccountSessions(scope: AccountScope) {
  const { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady } = scope;
  const key = JSON.stringify([authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady]);
  const eligible = Boolean(supabase && authenticatedUserId && authenticatedUserId === accountUserId);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<SessionView | null>(null);
  const [confirmation, setConfirmation] = useState<{ key: string; sessionId: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef<string | null>(null);
  const mounted = useRef(false);
  const confirmedAction = useRef<{ key: string; sessionId: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        generation.current += 1;
        confirmedAction.current = null;
        setConfirmation(null);
        setView(null);
        setActive(false);
      }
      // iOS also enters inactive while Face ID is on screen. Preserve that
      // deliberate confirmation; actual backgrounding still invalidates it.
      if (state === 'active') setActive(true);
    });
    return () => { mounted.current = false; confirmedAction.current = null; listener.remove(); };
  }, []);

  useEffect(() => {
    const request = ++generation.current;
    const requestScope = { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady };
    confirmedAction.current = null;
    setConfirmation(null);
    if (!eligible || !active) return;
    setView({ key, snapshot: null, error: null, message: null, loading: true });
    /** Ignore superseded refreshes and any account or foreground transition. */
    const current = () => request === generation.current && isAccountScopeCurrent(requestScope, useHomeStore.getState());
    void listAccountSessions(requestScope).then((snapshot) => {
      if (current()) setView({ key, snapshot, error: null, message: null, loading: false });
    }).catch(() => {
      if (current()) setView({ key, snapshot: null, error: 'Sessions could not be verified. Check your connection and refresh.', message: null, loading: false });
    });
    return () => { generation.current += 1; };
  }, [key, eligible, active, attempt, authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady]);

  const visible = active && view?.key === key ? view : null;
  const busy = busyKey === key;
  const confirming = active && confirmation?.key === key && Boolean(visible?.snapshot);

  /** Confirm only the displayed login; ambiguous outcomes require an explicit fresh inventory. */
  async function confirmOtherSignOut() {
    if (!mounted.current || !confirming || !confirmation || confirmedAction.current !== confirmation
      || pending.current === key || !isAccountScopeCurrent(scope, useHomeStore.getState())) return;
    const request = ++generation.current;
    pending.current = key;
    setBusyKey(key);
    const current = () => mounted.current && confirmedAction.current === confirmation
      && request === generation.current && isAccountScopeCurrent(scope, useHomeStore.getState());
    try {
      const snapshot = await signOutOtherAccountSessions(scope, confirmation.sessionId, current);
      if (current()) setView({ key, snapshot, error: null, loading: false,
        message: 'Other sign-ins have ended. Existing access may continue until its current token expires. This session stays signed in.' });
    } catch {
      if (current()) setView({ key, snapshot: null, loading: false, message: null,
        error: 'Other-session sign-out could not be fully verified. Refresh to check the result before trying again.' });
    } finally {
      if (pending.current === key) pending.current = null;
      if (current()) { setBusyKey(null); setConfirmation(null); confirmedAction.current = null; }
      else if (mounted.current) {
        setBusyKey((previous) => previous === key ? null : previous);
        // A foreground refresh may have raced the logout response. Re-read after
        // it settles, without ever refreshing a replacement account's inventory.
        if (isAccountScopeCurrent(scope, useHomeStore.getState())) setAttempt((value) => value + 1);
      }
    }
  }

  return {
    eligible, snapshot: visible?.snapshot ?? null, error: visible?.error ?? null, message: visible?.message ?? null,
    loading: eligible && active && (visible?.loading ?? true), busy, confirming,
    refresh: () => { if (pending.current !== key) setAttempt((value) => value + 1); },
    requestOtherSignOut: () => {
      if (visible?.snapshot && !busy && isAccountScopeCurrent(scope, useHomeStore.getState())) {
        const next = { key, sessionId: visible.snapshot.currentSessionId };
        confirmedAction.current = next;
        setConfirmation(next);
      }
    },
    cancel: () => { if (!busy) { confirmedAction.current = null; setConfirmation(null); } },
    confirmOtherSignOut,
  };
}
