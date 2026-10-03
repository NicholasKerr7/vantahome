import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useHomeStore } from '../../store/useHomeStore';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';

type Details = { scopeKey: string; loading: boolean; email: string | null; emailConfirmed: boolean; homeName: string | null; error: string | null };

/** Read account email and home name from their authorities only while the account sheet is open. */
export function useAccountDetails(scope: AccountScope, homeId: string | null) {
  const { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady } = scope;
  const scopeKey = JSON.stringify([authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady, homeId]);
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState<Details | null>(null);
  const eligible = Boolean(supabase && authenticatedUserId && accountUserId === authenticatedUserId);
  useEffect(() => {
    if (!eligible || !supabase) return;
    const client = supabase;
    let cancelled = false;
    const requestScope = { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady };
    /** Check both unmount and account changes before publishing private account data. */
    const current = () => !cancelled && isAccountScopeCurrent(requestScope, useHomeStore.getState());
    setDetails({ scopeKey, loading: true, email: null, emailConfirmed: false, homeName: null, error: null });
    /** Resolve identity first; an unexpected user must never trigger a household read. */
    async function load() {
      try {
        const { data, error } = await client.auth.getUser();
        if (!current()) return;
        if (error || data.user?.id !== authenticatedUserId) throw new Error('Account verification failed');
        const email = typeof data.user.email === 'string' ? data.user.email : null;
        const emailConfirmed = Boolean(data.user.email_confirmed_at);
        setDetails({ scopeKey, loading: Boolean(homeId), email, emailConfirmed, homeName: null, error: null });
        if (!homeId) return;
        const home = await client.from('homes').select('name').eq('id', homeId).maybeSingle();
        if (!current()) return;
        const homeName = typeof home.data?.name === 'string' ? home.data.name.trim() : null;
        setDetails({ scopeKey, loading: false, email, emailConfirmed, homeName: homeName || null,
          error: home.error || !homeName ? 'The home name could not be refreshed.' : null });
      } catch {
        if (current()) setDetails({ scopeKey, loading: false, email: null, emailConfirmed: false, homeName: null,
          error: 'Account details could not be verified. Check your connection and try again.' });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [eligible, authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady, homeId, scopeKey, attempt]);
  const visible = details?.scopeKey === scopeKey ? details : null;
  return {
    loading: eligible && (visible?.loading ?? true), email: visible?.email ?? null,
    emailConfirmed: visible?.emailConfirmed ?? false, homeName: visible?.homeName ?? null,
    error: visible?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  };
}
