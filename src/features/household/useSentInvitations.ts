import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { supabase } from '../../services/supabaseClient';
import { cancelSentInvitation, canManageSentInvitations, listSentInvitations, type SentHomeInvitation } from '../../services/sentInvitations';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import { isSentInvitationExpired, sentInvitationDeadline, sentInvitationOutcome } from './sentInvitationPresentation';

type Scope = { key: string; revision: number };
type Snapshot = {
  scope: Scope;
  invitations: SentHomeInvitation[];
  loaded: boolean;
  busy: 'load' | 'revoke' | null;
  error: string | null;
  outcome: string | null;
  review: SentHomeInvitation | null;
};

/** Exclude telemetry while capturing every local identity and household policy boundary. */
function scopeKey(state: HomeState): string {
  return JSON.stringify([homeEditorScope(state), state.membershipVerification,
    state.household.map(({ id, userId, role, accessExpiresAt, shareInteriorLayout }) =>
      ({ id, userId, role, accessExpiresAt, shareInteriorLayout })),
    state.roomMembers, state.memberPermissionOverrides]);
}

/** Start a new household view without retaining another account's invitation details. */
function emptySnapshot(scope: Scope): Snapshot {
  return { scope, invitations: [], loaded: false, busy: null, error: null, outcome: null, review: null };
}

/** Keep invitation loading, review and authoritative revocation within one current policy scope. */
export function useSentInvitations() {
  const [scope, setScope] = useState<Scope>(() => ({ key: scopeKey(useHomeStore.getState()), revision: 0 }));
  const latestScope = useRef(scope);
  const mounted = useRef(false);
  const active = useRef(AppState.currentState !== 'background');
  const operation = useRef<object | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot(scope));
  const latestSnapshot = useRef(snapshot);
  const [, tick] = useState(0);

  /** Observe transitions synchronously so changing away and back still invalidates an old callback. */
  useLayoutEffect(() => {
    mounted.current = true;
    const reconcile = () => {
      const key = scopeKey(useHomeStore.getState());
      if (key === latestScope.current.key) return;
      const next = { key, revision: latestScope.current.revision + 1 };
      latestScope.current = next;
      operation.current = null;
      setScope(next);
    };
    const unsubscribe = useHomeStore.subscribe(reconcile);
    const lifecycle = AppState.addEventListener('change', state => {
      // iOS biometric prompts can temporarily be inactive without backgrounding.
      if (state === 'inactive') return;
      const foreground = state === 'active';
      if (active.current === foreground) return;
      active.current = foreground;
      // A new generation invalidates a biometric review even if the account did
      // not change while the app was hidden. Resume must verify a fresh list.
      const next = { key: scopeKey(useHomeStore.getState()), revision: latestScope.current.revision + 1 };
      latestScope.current = next;
      operation.current = null;
      setScope(next);
    });
    reconcile();
    return () => { mounted.current = false; operation.current = null; unsubscribe(); lifecycle.remove(); };
  }, []);

  /** Recheck current authority when a rendered callback or an awaited response returns. */
  const isCurrent = useCallback(() => mounted.current && active.current && latestScope.current === scope
    && scope.key === scopeKey(useHomeStore.getState())
    && Boolean(supabase) && canManageSentInvitations(useHomeStore.getState()), [scope]);

  /** Publish a snapshot and its synchronous counterpart before another tap can run. */
  const publish = useCallback((next: Snapshot) => {
    latestSnapshot.current = next;
    setSnapshot(next);
  }, []);

  /** Refresh only this household and ignore results superseded by a later scope or operation. */
  const refresh = useCallback(async () => {
    if (!isCurrent() || operation.current) return;
    const request = {};
    operation.current = request;
    const previous = latestSnapshot.current.scope === scope ? latestSnapshot.current : emptySnapshot(scope);
    publish({ ...previous, busy: 'load', error: null, outcome: null, review: null });
    try {
      const invitations = await listSentInvitations();
      if (isCurrent() && operation.current === request) {
        publish({ ...emptySnapshot(scope), invitations, loaded: true });
      }
    } catch {
      if (isCurrent() && operation.current === request) publish({ ...previous, busy: null, review: null,
        outcome: null, error: 'Could not refresh sent invitations. Check your connection and try again.' });
    } finally {
      if (operation.current === request) operation.current = null;
    }
  }, [isCurrent, publish, scope]);

  useEffect(() => { void refresh(); }, [refresh]);

  const current = snapshot.scope === scope && isCurrent();
  const view = current ? snapshot : emptySnapshot(scope);
  const now = Date.now();

  /** Update expiry labels exactly at the next deadline; resume already reloads a fresh scope. */
  useEffect(() => {
    const deadlines = view.invitations.map(sentInvitationDeadline).filter(value => Number.isFinite(value) && value > Date.now());
    const timer = deadlines.length ? setTimeout(() => tick(value => value + 1),
      Math.min(2_147_483_647, Math.max(1, Math.min(...deadlines) - Date.now()))) : undefined;
    return () => { if (timer) clearTimeout(timer); };
  }, [view.invitations, now]);

  /** Review only an exact row from the current snapshot, never a stale rendered invitation. */
  const reviewInvitation = (invitation: SentHomeInvitation) => {
    const latest = latestSnapshot.current;
    if (!isCurrent() || operation.current || latest.scope !== scope || latest.error
      || !latest.invitations.includes(invitation) || !invitation.canCancel
      || invitation.status !== 'pending' || isSentInvitationExpired(invitation)) return;
    publish({ ...latest, review: invitation, error: null, outcome: null });
  };

  /** Dismissal cannot clear a new scope's review or interrupt a confirmed request. */
  const closeReview = () => {
    if (!isCurrent() || operation.current || latestSnapshot.current.scope !== scope) return;
    publish({ ...latestSnapshot.current, review: null, error: null });
  };

  const reviewed = view.review;
  /** Use the reviewed revision; a terminal server receipt is the only source of success feedback. */
  const revoke = async () => {
    const latest = latestSnapshot.current;
    if (!isCurrent() || operation.current || !reviewed || latest.scope !== scope
      || latest.review !== reviewed || !latest.invitations.includes(reviewed)
      || !reviewed.canCancel || isSentInvitationExpired(reviewed)) return;
    const request = {};
    operation.current = request;
    publish({ ...latest, busy: 'revoke', error: null, outcome: null });
    try {
      const result = await cancelSentInvitation(reviewed, () => isCurrent() && operation.current === request
        && latestSnapshot.current.review === reviewed);
      if (!isCurrent() || operation.current !== request) return;
      const invitations = result.status === 'expired'
        ? latest.invitations.map(item => item === reviewed ? { ...item, status: result.status, canCancel: false, revision: result.revision } : item)
        : result.status === 'pending' ? latest.invitations : latest.invitations.filter(item => item !== reviewed);
      publish({ ...latest, invitations, busy: null, review: null, error: null, outcome: sentInvitationOutcome(result.status) });
    } catch {
      if (isCurrent() && operation.current === request) publish({ ...latest, busy: null, review: null,
        outcome: null, error: 'Revocation was not confirmed. Refresh to check the current invitation before trying again.' });
    } finally {
      if (operation.current === request) operation.current = null;
      else if (mounted.current && active.current && scope.key === latestScope.current.key) {
        // A dispatched request may settle after resume's earlier list. Re-read
        // once more instead of presenting that potentially pre-mutation list.
        const next = { key: latestScope.current.key, revision: latestScope.current.revision + 1 };
        latestScope.current = next;
        operation.current = null;
        setScope(next);
      }
    }
  };

  return { ...view, available: Boolean(supabase), authorized: Boolean(supabase) && canManageSentInvitations(useHomeStore.getState()),
    now, refresh, reviewInvitation, closeReview, revoke };
}
