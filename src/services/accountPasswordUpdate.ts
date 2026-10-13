import { accountAuthVerifier, supabase } from './supabaseClient';
import { useHomeStore } from '../store/useHomeStore';

type PasswordAccountScope = { authenticatedUserId: string | null; sessionEpoch: number };
const pendingAccounts = new Set<string>();
const REQUEST_TIMEOUT_MS = 15_000;

/** Resolve only the configured public Auth endpoint; no credential comes from screen input. */
function passwordEndpoint(): { url: string; key: string } {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const configured = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!key || !configured) throw new Error('Password updates are unavailable.');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !['', '/'].includes(url.pathname)) throw new Error('Password updates are unavailable.');
  return { url: `${url.origin}/auth/v1/user`, key };
}

/** Update the captured Auth account, never whichever session a delayed SDK lock later selects. */
export async function updateAccountPassword(
  scope: PasswordAccountScope,
  password: string,
  stillCurrent: () => boolean,
): Promise<void> {
  const client = supabase;
  const verifier = accountAuthVerifier;
  const userId = scope.authenticatedUserId;
  if (!client || !verifier || !userId || password.length < 8 || password.length > 1024) {
    throw new Error('Password setup could not be verified.');
  }
  let abandoned = false;
  /** Latch identity changes so leaving and returning cannot revive an old password submission. */
  const accountMatches = () => {
    const state = useHomeStore.getState();
    return state.authenticatedUserId === userId && state.accountUserId === userId
      && state.sessionEpoch === scope.sessionEpoch;
  };
  const unsubscribe = useHomeStore.subscribe(() => { if (!accountMatches()) abandoned = true; });
  /** Recheck immediately before dispatch; dispatched requests can still finish after backgrounding. */
  const assertCurrent = () => {
    if (abandoned || !accountMatches() || !stillCurrent()) throw new Error('Your account changed. Reopen password setup.');
  };
  let ownsPending = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    assertCurrent();
    if (pendingAccounts.has(userId)) throw new Error('A password update is already in progress.');
    pendingAccounts.add(userId);
    ownsPending = true;
    const endpoint = passwordEndpoint();
    const captured = await client.auth.getSession();
    assertCurrent();
    const token = captured.data.session?.access_token;
    if (captured.error || !token || captured.data.session?.user.id !== userId) throw new Error('Your sign-in could not be verified.');
    const verified = await verifier.auth.getUser(token);
    assertCurrent();
    if (verified.error || verified.data.user?.id !== userId || !verified.data.user.email_confirmed_at) {
      throw new Error('Your sign-in could not be verified.');
    }
    const latest = await client.auth.getSession();
    assertCurrent();
    if (latest.error || latest.data.session?.user.id !== userId || latest.data.session.access_token !== token) {
      throw new Error('Your sign-in changed. Retry password setup.');
    }
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // Auth validates this exact user's JWT. The public client key grants no admin
    // privileges, and this request cannot substitute a later login's credentials.
    const response = await fetch(endpoint.url, {
      method: 'PUT', redirect: 'error', signal: controller.signal,
      headers: { apikey: endpoint.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw new Error('Password update was not confirmed.');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('id' in result) || result.id !== userId) {
      throw new Error('Password update was not confirmed.');
    }
    // Acknowledgement belongs only to the captured account. The screen separately
    // checks its lifecycle before clearing intent or allowing home admission.
  } finally {
    if (timeout) clearTimeout(timeout);
    if (ownsPending) pendingAccounts.delete(userId);
    unsubscribe();
  }
}
