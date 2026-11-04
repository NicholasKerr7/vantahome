import { supabase } from '../../services/supabaseClient';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from '../../services/membership';
import { withMembershipMutation } from '../../services/membershipRevision';
import { invalidateHomeMembership, useHomeStore } from '../../store/useHomeStore';
import { selectOwnershipTransferActor } from '../household/ownershipTransferAccess';

export type TransferRole = 'Owner' | 'Admin' | 'Member';
export type TransferAction = 'accept' | 'decline' | 'cancel';
export type TransferCandidate = { id: string; name: string; homeName: string; role: 'Admin' | 'Member' };
export type TransferOffer = {
  id: string;
  fromName: string;
  toName: string;
  expiresAt: string;
  homeName: string;
  direction: 'incoming' | 'outgoing';
};
export type TransferSnapshot = { candidates: TransferCandidate[]; offer: TransferOffer | null };
export type TransferScope = { user: string; home: string; epoch: number; role: TransferRole };
type TransferCommand = { action: 'offer'; candidateId: string; requestId: string }
  | { action: TransferAction; offerId: string };

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const BAD_RESPONSE = 'Ownership details could not be verified. Refresh to check the current offer.';
const SCOPE_CHANGED = 'Your account or household access changed. Reopen Home ownership.';

/** Require the same verified membership as the navigation entry and a configured account server. */
export function transferScope(state = useHomeStore.getState()): TransferScope | null {
  const actor = selectOwnershipTransferActor(state);
  if (!supabase || !actor || actor.role === 'Guest' || actor.role === 'Tenant' || !state.activeHomeId) return null;
  return { user: actor.userId ?? actor.id, home: state.activeHomeId, epoch: state.sessionEpoch, role: actor.role };
}

/** A role change invalidates pending reviews, even for the same signed-in person. */
export function transferScopeKey(scope: TransferScope | null): string | null {
  return scope && JSON.stringify([scope.user, scope.home, scope.epoch, scope.role]);
}

/** Reject work that crossed an account, role, household or foreground review boundary. */
function requireScope(scope: TransferScope, current: () => boolean): void {
  if (!current() || transferScopeKey(scope) !== transferScopeKey(transferScope())) throw new Error(SCOPE_CHANGED);
}

/** Pin the RPC to the reviewed account's JWT; a concurrent login cannot substitute credentials. */
async function sessionToken(scope: TransferScope, current: () => boolean): Promise<string> {
  requireScope(scope, current);
  const { data, error } = await supabase!.auth.getSession();
  requireScope(scope, current);
  if (error || data.session?.user.id !== scope.user || !data.session.access_token) throw new Error(SCOPE_CHANGED);
  return data.session.access_token;
}

/** Keep database and connection diagnostics private while giving an actionable recovery step. */
function handleRpcError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '42501' && /recent password sign-in required/i.test(error.message)) {
    throw new Error('Sign out and sign back in with your password. Return here within five minutes and review the transfer again.');
  }
  if (error.code === '42501' && /second factor|multi.factor|aal2/i.test(error.message)) {
    throw new Error('Complete two-factor verification for your account, then return here to review the transfer.');
  }
  if (error.code === '42501') throw new Error('Your current session or household role does not permit this action. Refresh your access.');
  throw new Error('The server could not confirm the current offer. Refresh before trying again.');
}

/** Use verified account addresses from the restricted endpoint rather than a generic household display name. */
function accountLabel(value: unknown): string {
  if (typeof value !== 'string' || value.length > 320 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+$/u.test(value)) {
    throw new Error(BAD_RESPONSE);
  }
  return value;
}

/** Validate actor, household, parties and expiry before publishing an offer to this screen. */
function parseOffer(data: unknown, scope: TransferScope): TransferOffer | null {
  if (!Array.isArray(data) || data.length > 1) throw new Error(BAD_RESPONSE);
  if (!data.length) return null;
  const row = data[0];
  if (!row || row.home_id !== scope.home || typeof row.id !== 'string' || !UUID.test(row.id)
    || !UUID.test(row.from_user_id ?? '') || !UUID.test(row.to_user_id ?? '') || row.from_user_id === row.to_user_id
    || typeof row.home_name !== 'string' || !row.home_name.trim()
    || typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at))) throw new Error(BAD_RESPONSE);
  const outgoing = scope.user === row.from_user_id && scope.role === 'Owner';
  const incoming = scope.user === row.to_user_id && scope.role !== 'Owner';
  if (!outgoing && !incoming) throw new Error(BAD_RESPONSE);
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  return { id: row.id, direction: outgoing ? 'outgoing' : 'incoming', homeName: row.home_name,
    fromName: outgoing ? 'You' : 'The current Owner', toName: accountLabel(row.to_email), expiresAt: row.expires_at };
}

/** Only accepted, eligible members returned by the Owner-only RPC can enter the picker. */
function parseCandidates(data: unknown, scope: TransferScope): TransferCandidate[] {
  if (!Array.isArray(data)) throw new Error(BAD_RESPONSE);
  const ids = new Set<string>();
  return data.map((row) => {
    if (!row || typeof row.user_id !== 'string' || !UUID.test(row.user_id) || row.user_id === scope.user
      || typeof row.home_name !== 'string' || !row.home_name.trim()
      || ids.has(row.user_id) || (row.role !== 'admin' && row.role !== 'member')) throw new Error(BAD_RESPONSE);
    ids.add(row.user_id);
    return { id: row.user_id, name: accountLabel(row.email), homeName: row.home_name, role: row.role === 'admin' ? 'Admin' : 'Member' };
  });
}

/** Load private, server-filtered rows on demand. A pending offer needs no separate directory read. */
export async function readTransfer(scope: TransferScope, current: () => boolean): Promise<TransferSnapshot> {
  const token = await sessionToken(scope, current);
  const result = await supabase!.rpc('get_home_ownership_offer', { target_home_id: scope.home })
    .setHeader('Authorization', 'Bearer ' + token);
  requireScope(scope, current);
  handleRpcError(result.error);
  const offer = parseOffer(result.data, scope);
  if (offer || scope.role !== 'Owner') return { offer, candidates: [] };
  const directory = await supabase!.rpc('list_home_ownership_candidates', { target_home_id: scope.home })
    .setHeader('Authorization', 'Bearer ' + token);
  requireScope(scope, current);
  handleRpcError(directory.error);
  return { offer: null, candidates: parseCandidates(directory.data, scope) };
}

/** Reconcile an explicit refresh or acceptance against the captured login, including after the page closes. */
export async function refreshTransferMembership(scope: TransferScope): Promise<void> {
  const sameLogin = () => {
    const state = useHomeStore.getState();
    return state.sessionEpoch === scope.epoch && state.authenticatedUserId === scope.user
      && state.activeHomeId === scope.home && state.accountHomeId === scope.home;
  };
  if (!sameLogin()) return;
  try {
    const snapshot = await syncMembershipFromSupabase(scope.user, scope.home);
    if (!sameLogin()) return;
    if (snapshot?.activeMemberId === scope.user && snapshot.homeId === scope.home && applyMembershipSnapshot(snapshot, scope.epoch)) return;
  } catch { /* A lost reply also needs full account verification before reusing cached authority. */ }
  if (sameLogin()) invalidateHomeMembership('failed');
}

/** Submit exactly the reviewed intent; ambiguous acceptance also reconciles roles before controls resume. */
export async function changeTransfer(scope: TransferScope, command: TransferCommand, current: () => boolean): Promise<void> {
  const offering = command.action === 'offer';
  if ((offering || command.action === 'cancel') !== (scope.role === 'Owner')) throw new Error(SCOPE_CHANGED);
  if (offering ? !UUID.test(command.candidateId) || !UUID.test(command.requestId) || command.candidateId === scope.user
    : !UUID.test(command.offerId)) throw new Error(BAD_RESPONSE);
  const token = await sessionToken(scope, current);
  try {
    const result = await withMembershipMutation(async () => {
      requireScope(scope, current);
      const rpc = offering
        ? supabase!.rpc('offer_home_ownership', { target_home_id: scope.home, target_user_id: command.candidateId, request_id: command.requestId })
        : supabase!.rpc('respond_home_ownership', { target_home_id: scope.home, target_offer_id: command.offerId, requested_action: command.action });
      return rpc.setHeader('Authorization', 'Bearer ' + token);
    });
    handleRpcError(result.error);
    const expected = offering ? command.requestId : { accept: 'accepted', decline: 'declined', cancel: 'cancelled' }[command.action];
    if (result.data !== expected) throw new Error(BAD_RESPONSE);
  } finally {
    if (command.action === 'accept') await refreshTransferMembership(scope);
  }
}
