import { Buffer } from 'buffer';
import { accountAuthVerifier, supabase } from '../../services/supabaseClient';
import { confirmProtectedAccess } from '../../security/biometricConfirmation';
import { useHomeStore } from '../../store/useHomeStore';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';

export type AccountSession = {
  id: string;
  createdAt: string | null;
  refreshedAt: string | null;
  expiresAt: string | null;
  deviceLabel: 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';
  isCurrent: boolean;
};
export type AccountSessionsSnapshot = { sessions: AccountSession[]; checkedAt: number; currentSessionId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_LABELS = new Set(['ios', 'android', 'macos', 'windows', 'linux', 'unknown']);
const pendingSignOuts = new Set<string>();

/** Fail before or after asynchronous work if it belongs to an account the user has left. */
function assertScope(scope: AccountScope) {
  if (!supabase || !scope.authenticatedUserId || scope.accountUserId !== scope.authenticatedUserId
    || !isAccountScopeCurrent(scope, useHomeStore.getState())) throw new Error('Your account changed. Reopen Security and try again.');
}

/** Read only the session identifier; this decode is never used as authorization. */
function sessionIdFromToken(token: string): string {
  try {
    const part = token.split('.')[1];
    if (!part || part.length > 16384) throw new Error();
    // The React Native buffer polyfill supports base64, not Node's base64url name.
    const claims: unknown = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!claims || typeof claims !== 'object' || !('session_id' in claims)
      || typeof claims.session_id !== 'string' || !UUID.test(claims.session_id)) throw new Error();
    return claims.session_id;
  } catch { throw new Error('This sign-in could not be identified. Sign in again to manage sessions.'); }
}

/** Verify the captured token with Auth so an in-flight action never targets a replacement login. */
async function verifiedSession(scope: AccountScope) {
  assertScope(scope);
  const client = supabase!;
  const { data, error } = await client.auth.getSession();
  assertScope(scope);
  const session = data.session;
  if (error || !session?.access_token || session.user.id !== scope.authenticatedUserId) {
    throw new Error('Your sign-in could not be verified. Refresh or sign in again.');
  }
  const id = sessionIdFromToken(session.access_token);
  if (!accountAuthVerifier) throw new Error('Account verification is unavailable.');
  const user = await accountAuthVerifier.auth.getUser(session.access_token);
  assertScope(scope);
  if (user.error || user.data.user?.id !== scope.authenticatedUserId) throw new Error('Your sign-in could not be verified. Refresh or sign in again.');
  return { id, token: session.access_token };
}

/** Preserve unknown legacy timestamps; reject malformed remote values instead of inventing activity. */
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Session details could not be verified. Refresh and try again.');
  return value;
}

/** Validate the restricted inventory response before any private session information reaches the UI. */
function parseSessions(data: unknown, currentSessionId: string): AccountSession[] {
  if (!Array.isArray(data) || data.length === 0 || data.length > 50) throw new Error('Session details could not be verified. Refresh and try again.');
  const ids = new Set<string>();
  const sessions = data.map((value: unknown): AccountSession => {
    if (!value || typeof value !== 'object') throw new Error('Invalid session response.');
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !UUID.test(row.id) || ids.has(row.id)
      || typeof row.device_label !== 'string' || !DEVICE_LABELS.has(row.device_label)
      || typeof row.is_current !== 'boolean' || row.is_current !== (row.id === currentSessionId)) {
      throw new Error('Session details could not be verified. Refresh and try again.');
    }
    ids.add(row.id);
    return { id: row.id, createdAt: timestamp(row.created_at), refreshedAt: timestamp(row.refreshed_at),
      expiresAt: timestamp(row.expires_at), deviceLabel: row.device_label as AccountSession['deviceLabel'], isCurrent: row.is_current };
  });
  if (sessions.filter((session) => session.isCurrent).length !== 1) throw new Error('Your current sign-in changed. Refresh and try again.');
  return sessions;
}

/** Fetch only this account's server-backed sign-ins; no session inventory is cached on disk. */
export async function listAccountSessions(scope: AccountScope): Promise<AccountSessionsSnapshot> {
  const current = await verifiedSession(scope);
  const { data, error } = await supabase!.rpc('list_my_account_sessions');
  assertScope(scope);
  if (error) throw new Error('Sessions could not be loaded. Check your connection and try again.');
  return { sessions: parseSessions(data, current.id), checkedAt: Date.now(), currentSessionId: current.id };
}

/** End other sign-ins with the reviewed token and retain strict server errors the generic SDK suppresses. */
export async function signOutOtherAccountSessions(
  scope: AccountScope,
  expectedSessionId: string,
  stillConfirmed: () => boolean = () => true,
): Promise<AccountSessionsSnapshot> {
  assertScope(scope);
  if (!stillConfirmed()) throw new Error('Session sign-out was cancelled.');
  const key = JSON.stringify([scope.authenticatedUserId, scope.sessionEpoch]);
  if (pendingSignOuts.has(key)) throw new Error('A session sign-out is already in progress.');
  pendingSignOuts.add(key);
  try {
    await confirmProtectedAccess('Confirm signing out other sessions');
    assertScope(scope);
    if (!stillConfirmed()) throw new Error('Session sign-out was cancelled.');
    const current = await verifiedSession(scope);
    if (current.id !== expectedSessionId) throw new Error('Your current sign-in changed. Refresh before signing out other sessions.');
    const latest = await supabase!.auth.getSession();
    assertScope(scope);
    if (!stillConfirmed()) throw new Error('Session sign-out was cancelled.');
    if (latest.error || latest.data.session?.user.id !== scope.authenticatedUserId
      || sessionIdFromToken(latest.data.session.access_token) !== expectedSessionId) {
      throw new Error('Your current sign-in changed. Refresh before signing out other sessions.');
    }
    // This public Auth endpoint uses only the captured user's JWT. No service key
    // or admin privilege is involved, and a later login is never substituted.
    const { error } = await supabase!.auth.admin.signOut(current.token, 'others');
    assertScope(scope);
    if (error) throw new Error('Other-session sign-out could not be confirmed. Refresh to check its result before trying again.');
    const refreshed = await listAccountSessions(scope);
    if (refreshed.currentSessionId !== expectedSessionId || refreshed.sessions.some((session) => !session.isCurrent)) {
      throw new Error('Sign-out was sent, but another session is still listed. Refresh and review your sessions.');
    }
    return refreshed;
  } finally { pendingSignOuts.delete(key); }
}
