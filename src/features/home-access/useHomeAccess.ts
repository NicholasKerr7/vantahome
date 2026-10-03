import { useCallback, useEffect, useRef, useState } from 'react';
import { bootstrapHome, listPendingInvites, respondHomeInvite, type HomeInvite } from '../../services/cloudRegistry';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from '../../services/membership';
import { cancelAuthFlow, waitForAuthExchange } from '../../services/authFlow';
import { supabase } from '../../services/supabaseClient';
import { useHomeStore } from '../../store/useHomeStore';
import { isInvitationExpired } from './invitationExpiry';

type Options = { userId: string; onComplete: () => void };

/** Keep onboarding responses bound to the login that started them, including same-user relogins. */
export function useHomeAccess({ userId, onComplete }: Options) {
  const [invites, setInvites] = useState<HomeInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const signingOut = useRef(false);
  const sessionEpoch = useRef(useHomeStore.getState().sessionEpoch);
  const operation = useRef(false);
  const pendingHomeId = useRef<string | null>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  /** Reject stale work before changing the UI or installing household data. */
  const isCurrent = useCallback(() => {
    const current = useHomeStore.getState();
    return mounted.current && !signingOut.current && current.authenticatedUserId === userId && current.sessionEpoch === sessionEpoch.current;
  }, [userId]);

  /** Confirm the email-backed identity immediately before a membership mutation. */
  const verifyIdentity = useCallback(async () => {
    if (!isCurrent() || !supabase) throw new Error('Your session changed. Sign in again.');
    const { data, error: identityError } = await supabase.auth.getUser();
    if (identityError || data.user?.id !== userId || !data.user.email_confirmed_at || !isCurrent()) {
      throw new Error('Verify your email and sign in again before joining a home.');
    }
  }, [isCurrent, userId]);

  /** Fetch policy for the exact chosen home before making its controls accessible. */
  const enterHome = useCallback(async (homeId: string) => {
    const snapshot = await syncMembershipFromSupabase(userId, homeId);
    if (!isCurrent()) return;
    if (!snapshot || snapshot.homeId !== homeId || !applyMembershipSnapshot(snapshot, sessionEpoch.current)) {
      throw new Error('Home access is not confirmed yet. Retry to check your membership.');
    }
    pendingHomeId.current = null;
    complete.current();
  }, [isCurrent, userId]);

  /** Refresh the inbox, or finish a successful invitation whose registry read was interrupted. */
  const reload = useCallback(async () => {
    if (!isCurrent() || operation.current) return;
    operation.current = true;
    setLoading(true);
    setError(null);
    try {
      if (pendingHomeId.current) {
        await enterHome(pendingHomeId.current);
      } else {
        const next = await listPendingInvites(userId);
        if (isCurrent()) setInvites(next.filter((invite) => invite.status === 'pending'));
      }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'Unable to load invitations. Please retry.');
    } finally {
      operation.current = false;
      if (isCurrent()) setLoading(false);
    }
  }, [enterHome, isCurrent, userId]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => { mounted.current = false; };
  }, [reload]);

  /** Accept or decline only a displayed invitation belonging to this verified session. */
  const respond = async (invite: HomeInvite, action: 'accept' | 'decline') => {
    if (!isCurrent() || operation.current || pendingHomeId.current || !invites.some((item) => item.id === invite.id)) return;
    if (action === 'accept' && isInvitationExpired(invite)) {
      setError('This invitation has expired. Ask your home owner for a new invitation.');
      return;
    }
    operation.current = true;
    setBusy(invite.id);
    setError(null);
    setNotice(null);
    try {
      await verifyIdentity();
      const response = await respondHomeInvite(invite.id, action, userId);
      if (!isCurrent()) return;
      if (!response || response.inviteId !== invite.id || response.status !== (action === 'accept' ? 'accepted' : 'declined')) {
        throw new Error('The invitation could not be updated. Refresh and try again.');
      }
      if (action === 'accept') {
        pendingHomeId.current = invite.home_id;
        await enterHome(invite.home_id);
      } else {
        setInvites((current) => current.filter((item) => item.id !== invite.id));
        setNotice('Invitation declined.');
      }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'Unable to update this invitation. Please retry.');
    } finally {
      operation.current = false;
      if (isCurrent()) setBusy(null);
    }
  };

  /** Create an owner household only after the person explicitly submits a home name. */
  const createHome = async (name: string) => {
    const homeName = name.trim();
    if (!isCurrent() || operation.current || pendingHomeId.current || !homeName || homeName.length > 80) return;
    operation.current = true;
    setBusy('create');
    setError(null);
    try {
      await verifyIdentity();
      const response = await bootstrapHome(homeName, userId);
      if (!isCurrent()) return;
      if (!response || typeof response.home?.id !== 'string' || !response.home.id.trim()) throw new Error('The home was not confirmed. Please retry.');
      pendingHomeId.current = response.home.id;
      await enterHome(response.home.id);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'Unable to set up your home. Please retry.');
    } finally {
      operation.current = false;
      if (isCurrent()) setBusy(null);
    }
  };

  /** Ignore in-flight onboarding callbacks as soon as local sign-out begins. */
  const signOut = async () => {
    if (!isCurrent() || busy === 'signout') return;
    signingOut.current = true;
    setBusy('signout');
    setError(null);
    try {
      await cancelAuthFlow();
      await waitForAuthExchange();
      const current = useHomeStore.getState();
      if (!mounted.current || current.authenticatedUserId !== userId || current.sessionEpoch !== sessionEpoch.current) return;
      const result = await supabase?.auth.signOut({ scope: 'local' });
      if (result?.error) throw result.error;
    } catch {
      signingOut.current = false;
      if (isCurrent()) setError('Unable to sign out. Please try again.');
    } finally {
      signingOut.current = false;
      if (isCurrent()) setBusy(null);
    }
  };

  return { invites, loading, busy, error, notice, finishingHome: Boolean(pendingHomeId.current), reload, respond, createHome, signOut };
}
