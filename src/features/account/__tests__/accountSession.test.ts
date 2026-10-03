import { signOutAccount } from '../accountSession';
import { useHomeStore } from '../../../store/useHomeStore';
import type { AccountScope } from '../accountIdentity';

const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockWait = jest.fn();
const mockCancel = jest.fn();
jest.mock('../../../services/supabaseClient', () => ({ supabase: { auth: { signOut: (...args: unknown[]) => mockSignOut(...args), getSession: () => mockGetSession() } } }));
jest.mock('../../../services/authFlow', () => ({ cancelAuthFlow: () => mockCancel(), waitForAuthExchange: () => mockWait() }));

const scope: AccountScope = { authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a', accountHomeId: 'home-a', sessionEpoch: 2, membershipReady: true };
const initial = useHomeStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState(scope);
  mockCancel.mockResolvedValue(undefined);
  mockWait.mockResolvedValue(undefined);
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'alice' } } }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
});
afterEach(() => useHomeStore.setState(initial, true));

test('settles authentication exchange and signs out only this device', async () => {
  expect(await signOutAccount(scope)).toBe(true);
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(mockWait).toHaveBeenCalledTimes(1);
  expect(mockGetSession).toHaveBeenCalledTimes(1);
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
});

test('does not sign out another account after an exchange or a stale sheet', async () => {
  mockWait.mockImplementationOnce(async () => { useHomeStore.setState({ authenticatedUserId: 'bob' }); });
  expect(await signOutAccount(scope)).toBe(false);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(await signOutAccount(scope)).toBe(false);
  expect(mockCancel).toHaveBeenCalledTimes(1);
});

test('does not sign out when the SDK session belongs to a different person', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'bob' } } }, error: null });
  expect(await signOutAccount(scope)).toBe(false);
  expect(mockSignOut).not.toHaveBeenCalled();
});

test('surfaces sign-out errors for the sheet to report', async () => {
  mockSignOut.mockResolvedValue({ error: new Error('offline') });
  await expect(signOutAccount(scope)).rejects.toThrow('offline');
});
