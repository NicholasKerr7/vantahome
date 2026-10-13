import { Buffer } from 'buffer';
import { accountAuthVerifier, supabase } from '../../services/supabaseClient';
import { beginAuthFlow, cancelAuthFlow, isAuthFlowCurrent, sendPasswordRecoveryEmail, waitForAuthExchange, type AuthFlowIntent } from '../../services/authFlow';
import { useHomeStore } from '../../store/useHomeStore';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';

/** Safe recovery messages intended for display; provider errors never reach the UI. */
export class AccountRecoveryError extends Error {
  constructor(message: string) { super(message); this.name = 'AccountRecoveryError'; }
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingRequests = new Set<string>();
const recentRequests = new Map<string, number>();
const REQUEST_INTERVAL_MS = 60_000;

/** Check identity and the deliberate screen confirmation across every async boundary. */
function assertCurrent(scope: AccountScope, stillConfirmed: () => boolean): void {
  if (!supabase || !scope.authenticatedUserId || scope.accountUserId !== scope.authenticatedUserId
    || !isAccountScopeCurrent(scope, useHomeStore.getState())) throw new AccountRecoveryError('Your account changed. Reopen account security and try again.');
  if (!stillConfirmed()) throw new AccountRecoveryError('Password recovery was cancelled. Review your account before trying again.');
}

/** Decode only the session identifier for request binding; Auth still verifies the token. */
function sessionId(token: string): string {
  try {
    const part = token.split('.')[1];
    if (!part || part.length > 16_384) throw new Error();
    const claims: unknown = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!claims || typeof claims !== 'object' || !('session_id' in claims)
      || typeof claims.session_id !== 'string' || !SESSION_ID.test(claims.session_id)) throw new Error();
    return claims.session_id;
  } catch { throw new AccountRecoveryError('This sign-in could not be identified. Sign in again to recover your password.'); }
}

/** Capture a verified current session and authoritative confirmed email, never editable profile data. */
async function verifiedIdentity(scope: AccountScope, stillConfirmed: () => boolean) {
  assertCurrent(scope, stillConfirmed);
  const { data, error } = await supabase!.auth.getSession();
  assertCurrent(scope, stillConfirmed);
  const session = data.session;
  if (error || !session?.access_token || session.user.id !== scope.authenticatedUserId || !accountAuthVerifier) {
    throw new AccountRecoveryError('Your sign-in could not be verified. Refresh account security and try again.');
  }
  const id = sessionId(session.access_token);
  const verified = await accountAuthVerifier.auth.getUser(session.access_token);
  assertCurrent(scope, stillConfirmed);
  const user = verified.data.user;
  const email = user?.email?.trim().toLowerCase();
  if (verified.error || user?.id !== scope.authenticatedUserId || !user.email_confirmed_at
    || !email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountRecoveryError('A verified account email is required. Refresh account security or return to sign in.');
  }
  const latest = await supabase!.auth.getSession();
  assertCurrent(scope, stillConfirmed);
  if (latest.error || latest.data.session?.user.id !== scope.authenticatedUserId
    || sessionId(latest.data.session.access_token) !== id) throw new AccountRecoveryError('Your sign-in changed. Refresh account security and try again.');
  return { email, sessionId: id };
}

/** Read the recovery destination from Auth without requesting or sending an email. */
export async function loadAccountRecoveryIdentity(scope: AccountScope): Promise<{ email: string }> {
  try {
    const identity = await verifiedIdentity(scope, () => true);
    return { email: identity.email };
  } catch (error) {
    throw error instanceof AccountRecoveryError ? error : new AccountRecoveryError('Your account email could not be verified. Refresh and try again.');
  }
}

/** Request a reset only for the account/email the user reviewed; success is not delivery or a password change. */
export async function requestAccountPasswordRecovery(
  scope: AccountScope,
  expectedEmail: string,
  stillConfirmed: () => boolean,
): Promise<void> {
  assertCurrent(scope, stillConfirmed);
  const userId = scope.authenticatedUserId!;
  if (pendingRequests.has(userId)) throw new AccountRecoveryError('A recovery request is already in progress.');
  const lastRequest = recentRequests.get(userId);
  if (lastRequest !== undefined && Date.now() - lastRequest < REQUEST_INTERVAL_MS) {
    throw new AccountRecoveryError('Please wait one minute before requesting another email. Check your inbox first.');
  }
  pendingRequests.add(userId);
  let flow: AuthFlowIntent | undefined;
  let dispatched = false;
  // Latch even an away-and-back transition while a request awaits the network.
  let scopeChanged = false;
  const unsubscribe = useHomeStore.subscribe(state => { if (!isAccountScopeCurrent(scope, state)) scopeChanged = true; });
  const current = () => !scopeChanged && stillConfirmed();
  try {
    await waitForAuthExchange();
    assertCurrent(scope, current);
    const identity = await verifiedIdentity(scope, current);
    if (identity.email !== expectedEmail) throw new AccountRecoveryError('Your account email changed. Refresh and review the destination again.');
    flow = await beginAuthFlow('recovery', { email: identity.email });
    assertCurrent(scope, current);
    if (!isAuthFlowCurrent(flow)) throw new AccountRecoveryError('This recovery request was replaced. Please try again.');
    const latest = await supabase!.auth.getSession();
    assertCurrent(scope, current);
    if (!isAuthFlowCurrent(flow) || latest.error || latest.data.session?.user.id !== userId
      || sessionId(latest.data.session.access_token) !== identity.sessionId) {
      throw new AccountRecoveryError('Your sign-in changed. Refresh account security and try again.');
    }
    recentRequests.set(userId, Date.now());
    dispatched = true;
    await sendPasswordRecoveryEmail(flow, identity.email);
    assertCurrent(scope, current);
  } catch (error) {
    // Once the request leaves this process it may have sent a valid email. Keep
    // its callback intent during uncertain delivery or while opening the inbox.
    if (flow && !dispatched) await cancelAuthFlow(flow);
    throw error instanceof AccountRecoveryError ? error : new AccountRecoveryError('The recovery request could not be confirmed. Check your inbox before trying again.');
  } finally { unsubscribe(); pendingRequests.delete(userId); }
}
