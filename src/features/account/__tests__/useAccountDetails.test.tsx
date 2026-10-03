import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import { useAccountDetails } from '../useAccountDetails';
import type { AccountScope } from '../accountIdentity';

const mockGetUser = jest.fn();
const mockHome = jest.fn();
const mockFrom = jest.fn();
const mockEq = jest.fn();
jest.mock('../../../services/supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() },
  from: (...args: unknown[]) => mockFrom(...args),
} }));

const scope: AccountScope = { authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a', accountHomeId: 'home-a', sessionEpoch: 2, membershipReady: true };
const initial = useHomeStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState({ ...scope, profile: { name: 'Alice', email: 'forged@example.com', homeName: 'Forged home' } });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.com', email_confirmed_at: '2026-10-03' } }, error: null });
  mockHome.mockResolvedValue({ data: { name: 'Hopewell' }, error: null });
  mockEq.mockImplementation(() => ({ maybeSingle: () => mockHome() }));
  mockFrom.mockImplementation(() => ({ select: () => ({ eq: (...args: unknown[]) => mockEq(...args) }) }));
});
afterEach(() => useHomeStore.setState(initial, true));

test('reads verified identity and scoped home name rather than editable profile labels', async () => {
  const screen = renderHook(() => useAccountDetails(scope, 'home-a'));
  await waitFor(() => expect(screen.result.current.loading).toBe(false));
  expect(screen.result.current).toMatchObject({ email: 'alice@example.com', emailConfirmed: true, homeName: 'Hopewell', error: null });
  expect(mockEq).toHaveBeenCalledWith('id', 'home-a');
  screen.rerender({});
  expect(mockGetUser).toHaveBeenCalledTimes(1);
});

test('does not fetch household details when auth returns another person', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'bob', email: 'private@example.com' } }, error: null });
  const screen = renderHook(() => useAccountDetails(scope, 'home-a'));
  await waitFor(() => expect(screen.result.current.error).toBeTruthy());
  expect(screen.result.current.email).toBeNull();
  expect(mockFrom).not.toHaveBeenCalled();
});

test('ignores late private data after the account scope changes', async () => {
  let finish: (result: unknown) => void = () => undefined;
  mockGetUser.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const screen = renderHook(() => useAccountDetails(scope, 'home-a'));
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', sessionEpoch: 3 }); });
  await act(async () => finish({ data: { user: { id: 'alice', email: 'private@example.com' } }, error: null }));
  expect(screen.result.current.email).toBeNull();
  expect(mockFrom).not.toHaveBeenCalled();
});

test('clears a previous email immediately when the sheet changes to another account', async () => {
  const screen = renderHook<ReturnType<typeof useAccountDetails>, { request: AccountScope }>(
    ({ request }) => useAccountDetails(request, 'home-a'), { initialProps: { request: scope } },
  );
  await waitFor(() => expect(screen.result.current.email).toBe('alice@example.com'));
  const nextScope = { ...scope, authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 3 };
  mockGetUser.mockReturnValueOnce(new Promise(() => undefined));
  act(() => { useHomeStore.setState(nextScope); screen.rerender({ request: nextScope }); });
  expect(screen.result.current.email).toBeNull();
  expect(screen.result.current.homeName).toBeNull();
});

test('preserves verified email when the home read fails and supports retry', async () => {
  mockHome.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  const screen = renderHook(() => useAccountDetails(scope, 'home-a'));
  await waitFor(() => expect(screen.result.current.error).toBe('The home name could not be refreshed.'));
  expect(screen.result.current.email).toBe('alice@example.com');
  act(() => screen.result.current.retry());
  await waitFor(() => expect(screen.result.current.homeName).toBe('Hopewell'));
  expect(screen.result.current.error).toBeNull();
});

test('makes no identity network request for a local demo', () => {
  const demoScope = { ...scope, authenticatedUserId: null, accountUserId: null };
  const screen = renderHook(() => useAccountDetails(demoScope, null));
  expect(screen.result.current.loading).toBe(false);
  expect(mockGetUser).not.toHaveBeenCalled();
});
