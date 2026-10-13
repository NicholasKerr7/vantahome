import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../../services/supabaseClient';
import { useHomeStore } from '../../store/useHomeStore';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';
import { AccountRecoveryError, loadAccountRecoveryIdentity, requestAccountPasswordRecovery } from './accountRecovery';

type RecoveryView = {
  key: string;
  email: string | null;
  error: string | null;
  message: string | null;
  loading: boolean;
};
type RecoveryReview = { key: string; email: string };

/** Keep email recovery bound to the reviewed account, foreground visit, and verified address. */
export function useAccountRecovery(scope: AccountScope) {
  const { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady } = scope;
  const key = JSON.stringify([authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady]);
  const eligible = Boolean(supabase && authenticatedUserId && authenticatedUserId === accountUserId);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<RecoveryView | null>(null);
  const [review, setReview] = useState<RecoveryReview | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const mounted = useRef(false);
  const foreground = useRef(AppState.currentState !== 'background');
  const generation = useRef(0);
  const reviewed = useRef<RecoveryReview | null>(null);
  const pending = useRef<symbol | null>(null);

  useEffect(() => {
    mounted.current = true;
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        foreground.current = false;
        generation.current += 1;
        reviewed.current = null;
        setReview(null);
        setView(null);
        setActive(false);
      } else if (state === 'active') {
        const returning = !foreground.current;
        foreground.current = true;
        setActive(true);
        // A fast background/foreground pair may batch into an unchanged active state.
        if (returning) setAttempt((value) => value + 1);
      }
      // Face ID briefly enters inactive; only actual backgrounding cancels the review.
    });
    const unsubscribe = useHomeStore.subscribe((current, previous) => {
      if (isAccountScopeCurrent(previous, current)) return;
      generation.current += 1;
      reviewed.current = null;
      setReview(null);
      setView(null);
      // Preserve invalidation even when an away-and-back scope change batches into one render.
      setAttempt((value) => value + 1);
    });
    return () => {
      mounted.current = false;
      reviewed.current = null;
      generation.current += 1;
      lifecycle.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const request = ++generation.current;
    const requestScope = { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady };
    reviewed.current = null;
    setReview(null);
    if (!eligible || !active) return;
    setView({ key, email: null, error: null, message: null, loading: true });
    /** Reject late identity reads after any account, mount, or foreground boundary. */
    const current = () => mounted.current && foreground.current && request === generation.current
      && isAccountScopeCurrent(requestScope, useHomeStore.getState());
    void loadAccountRecoveryIdentity(requestScope).then(({ email }) => {
      if (current()) setView({ key, email, error: null, message: null, loading: false });
    }).catch(() => {
      if (current()) setView({ key, email: null, error: 'Your recovery email could not be verified. Check your connection and refresh.', message: null, loading: false });
    });
    return () => { generation.current += 1; };
  }, [key, eligible, active, attempt, authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady]);

  const visible = active && view?.key === key ? view : null;
  const busy = busyKey === key;
  const confirming = active && review?.key === key && Boolean(visible?.email);

  /** Send once after an explicit review; never report a stale request as this account's success. */
  async function confirmRecovery() {
    if (!mounted.current || !foreground.current || !confirming || !review || reviewed.current !== review
      || pending.current || !isAccountScopeCurrent(scope, useHomeStore.getState())) return;
    const request = ++generation.current;
    const operation = Symbol('account-recovery');
    pending.current = operation;
    setBusyKey(key);
    const current = () => mounted.current && foreground.current && request === generation.current
      && reviewed.current === review && isAccountScopeCurrent(scope, useHomeStore.getState());
    try {
      await requestAccountPasswordRecovery(scope, review.email, current);
      if (current()) setView({ key, email: review.email, loading: false, error: null,
        message: 'Recovery email requested. Check your inbox and spam folder. Your password has not changed.' });
    } catch (error) {
      if (current()) setView({ key, email: null, loading: false, message: null,
        error: error instanceof AccountRecoveryError ? error.message
          : 'The recovery request could not be confirmed. Check your inbox before trying again, then refresh your email.' });
    } finally {
      if (pending.current === operation) pending.current = null;
      if (current()) { setBusyKey(null); reviewed.current = null; setReview(null); }
      else if (mounted.current) setBusyKey((previous) => previous === key ? null : previous);
    }
  }

  return {
    eligible, email: visible?.email ?? null, error: visible?.error ?? null, message: visible?.message ?? null,
    loading: eligible && active && (visible?.loading ?? true), busy, confirming,
    refresh: () => { if (mounted.current && foreground.current && !pending.current) setAttempt((value) => value + 1); },
    requestReview: () => {
      if (!mounted.current || !foreground.current || !visible?.email || busy || pending.current
        || !isAccountScopeCurrent(scope, useHomeStore.getState())) return;
      const next = { key, email: visible.email };
      reviewed.current = next;
      setReview(next);
    },
    cancel: () => { if (!busy) { reviewed.current = null; setReview(null); } },
    confirmRecovery,
  };
}
