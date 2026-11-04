import { useHomeStore, type HouseholdMember } from '../../../store/useHomeStore';
import { readTransfer, changeTransfer, transferScope } from '../ownershipTransferService';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from '../../../services/membership';

jest.mock('../../../services/supabaseClient', () => ({ supabase: {
  auth: { getSession: () => mockSession() }, rpc: (name: string, params: unknown) => mockRpc(name, params),
} }));
jest.mock('../../../services/membership', () => ({ applyMembershipSnapshot: jest.fn(), syncMembershipFromSupabase: jest.fn() }));

const owner = '00000000-0000-4000-8000-000000000001';
const recipient = '00000000-0000-4000-8000-000000000002';
const home = '00000000-0000-4000-8000-000000000010';
const offer = '00000000-0000-4000-8000-000000000020';
const active = () => true;
const mockSession = jest.fn();
const mockRpc = jest.fn();
const initial = useHomeStore.getState();
const mockHeader = jest.fn();

/** Pick one synthetic current account and scope without storing any real identity or credential. */
function login(role: HouseholdMember['role'] = 'Owner') {
  const id = role === 'Owner' ? owner : recipient;
  useHomeStore.setState({ authenticatedUserId: id, accountUserId: id, activeMemberId: id,
    accountHomeId: home, activeHomeId: home, sessionEpoch: 9, membershipReady: true, authTaskBlockingHome: false,
    household: [{ id, userId: id, role, name: 'Test member', status: 'away' }] });
  mockSession.mockResolvedValue({ data: { session: { user: { id }, access_token: 'synthetic-test-only' } }, error: null });
}

/** Queue one PostgREST response and retain the bound header to detect replacement-session races. */
function reply(data: unknown, error: { code: string; message: string } | null = null) {
  mockHeader.mockResolvedValueOnce({ data, error });
}

/** Return the same shape as the server's restricted, pending-offer endpoint. */
function row() {
  return { id: offer, home_id: home, from_user_id: owner, to_user_id: recipient, home_name: 'Test house',
    to_email: 'person@example.invalid', expires_at: new Date(Date.now() + 3600_000).toISOString() };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockRpc.mockImplementation(() => ({ setHeader: mockHeader }));
  login();
});
afterEach(() => { useHomeStore.setState(initial, true); });

test('Owner directory uses verified account emails and every request uses the captured credential', async () => {
  reply([]); reply([{ user_id: recipient, email: 'person@example.invalid', home_name: 'Test house', role: 'member' }]);
  await expect(readTransfer(transferScope()!, active)).resolves.toEqual({
    offer: null, candidates: [{ id: recipient, name: 'person@example.invalid', homeName: 'Test house', role: 'Member' }],
  });
  expect(mockRpc.mock.calls.map(([fn]) => fn)).toEqual(['get_home_ownership_offer', 'list_home_ownership_candidates']);
  expect(mockHeader.mock.calls).toEqual(Array(2).fill(['Authorization', 'Bearer synthetic-test-only']));
});

test('recipient reads only their own offer, never the private Owner directory', async () => {
  login('Member'); reply([row()]);
  const result = await readTransfer(transferScope()!, active);
  expect(result.offer).toMatchObject({ id: offer, homeName: 'Test house', direction: 'incoming' });
  expect(result.candidates).toEqual([]);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test.each([{ home_id: recipient }, { to_user_id: home }, { to_email: 'a\n@b.com' }, { expires_at: 'bad' }])(
  'wrong scope or malformed private result is rejected (%j)', async (patch) => {
    login('Admin'); reply([{ ...row(), ...patch }]);
    await expect(readTransfer(transferScope()!, active)).rejects.toThrow('could not be verified');
  });

test('stale session or closed review before dispatch sends nothing', async () => {
  const scope = transferScope()!;
  mockSession.mockImplementationOnce(async () => {
    useHomeStore.setState({ sessionEpoch: 10 });
    return { data: { session: { user: { id: owner }, access_token: 'synthetic' } } };
  });
  await expect(changeTransfer(scope, { action: 'offer', candidateId: recipient, requestId: offer }, active)).rejects.toThrow('changed');
  expect(mockRpc).not.toHaveBeenCalled();
  await expect(readTransfer(transferScope()!, () => false)).rejects.toThrow('changed');
});

test('role downgrade while private directory is in flight discards the entire result', async () => {
  reply([]); mockHeader.mockImplementationOnce(async () => {
    login('Guest'); return { data: [{ user_id: recipient, role: 'member', email: 'person@example.invalid' }] };
  });
  await expect(readTransfer(transferScope()!, active)).rejects.toThrow('changed');
  expect(transferScope()).toBeNull();
});

test('stale password gives actionable recovery and cannot create an offer receipt', async () => {
  reply(null, { code: '42501', message: 'Recent password sign-in required' });
  await expect(changeTransfer(transferScope()!, { action: 'offer', candidateId: recipient, requestId: offer }, active)).rejects.toThrow('five minutes');
  expect(applyMembershipSnapshot).not.toHaveBeenCalled();
});

test('an offer must return its reviewed request ID and sending does not change either role', async () => {
  reply(recipient);
  const command = { action: 'offer', candidateId: recipient, requestId: offer } as const;
  await expect(changeTransfer(transferScope()!, command, active)).rejects.toThrow('could not be verified');
  reply(offer); await changeTransfer(transferScope()!, command, active);
  expect(mockRpc).toHaveBeenLastCalledWith('offer_home_ownership', { target_home_id: home, target_user_id: recipient, request_id: offer });
  expect(syncMembershipFromSupabase).not.toHaveBeenCalled();
});

test.each([['accept','Owner'], ['cancel','Member'], ['decline','Owner']] as const)('cannot %s with a %s review', async (action, role) => {
  login(role);
  await expect(changeTransfer(transferScope()!, { action, offerId: offer }, active)).rejects.toThrow('changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('a missing response to acceptance still reconciles the exact household instead of retrying the write', async () => {
  login('Member');
  mockHeader.mockRejectedValueOnce(new Error('Connection lost'));
  jest.mocked(syncMembershipFromSupabase).mockResolvedValue(null);
  await expect(changeTransfer(transferScope()!, { action: 'accept', offerId: offer }, active)).rejects.toThrow('Connection lost');
  expect(syncMembershipFromSupabase).toHaveBeenCalledWith(recipient, home);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().membershipReady).toBe(false);
});

test('an old response cannot invalidate a replacement login', async () => {
  login('Member');
  mockHeader.mockImplementationOnce(async () => { login(); return { data: 'accepted', error: null }; });
  await changeTransfer(transferScope()!, { action: 'accept', offerId: offer }, active);
  expect(syncMembershipFromSupabase).not.toHaveBeenCalled();
  expect(useHomeStore.getState()).toMatchObject({ authenticatedUserId: owner, membershipReady: true });
});
