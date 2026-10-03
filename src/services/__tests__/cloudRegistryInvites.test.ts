import type { HomeInvite } from '../cloudRegistry';

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockReadProfile = jest.fn(() => ({ profile: { email: 'someone-else@example.com' } }));
jest.mock('../supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() }, rpc: (...args: unknown[]) => mockRpc(...args),
} }));
jest.mock('../../store/useHomeStore', () => ({ useHomeStore: { getState: () => mockReadProfile() } }));

const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
let listPendingInvites: typeof import('../cloudRegistry')['listPendingInvites'];
let mockRows: unknown;
let mockQueryError: { message: string } | null;
const invite: HomeInvite = {
  id: '11111111-1111-4111-8111-111111111111',
  home_id: '22222222-2222-4222-8222-222222222222',
  home_name: 'Hopewell',
  email: 'alice@example.com', invited_user_id: 'alice', role: 'guest',
  room_ids: ['33333333-3333-4333-8333-333333333333'], status: 'pending',
  created_at: '2026-10-03T12:00:00Z', expires_at: '2026-10-10T12:00:00Z',
};

beforeAll(() => {
  // Configuration is captured on import; this reserved host and public placeholder never make requests.
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://supabase.example.invalid';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-public-placeholder';
  ({ listPendingInvites } = require('../cloudRegistry'));
});
afterAll(() => {
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});
beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [invite];
  mockQueryError = null;
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: 'alice@example.com', email_confirmed_at: '2026-10-03T10:00:00Z' } }, error: null });
  mockRpc.mockImplementation(() => Promise.resolve({ data: mockRows, error: mockQueryError }));
});

test('rejects a changed authenticated user before querying invitations', async () => {
  await expect(listPendingInvites('bob')).rejects.toThrow('The account changed');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('filters by the server-verified email rather than editable profile information', async () => {
  await expect(listPendingInvites('alice')).resolves.toEqual([invite]);
  expect(mockGetUser).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('list_my_home_invitations');
  expect(mockReadProfile).not.toHaveBeenCalled();
});

test('normalizes the authenticated email before querying and validating recipients', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'alice', email: ' Alice@Example.Com ', email_confirmed_at: '2026-10-03T10:00:00Z' } }, error: null });
  await expect(listPendingInvites('alice')).resolves.toEqual([invite]);
  expect(mockRpc).toHaveBeenCalledWith('list_my_home_invitations');
});

test('rejects rows addressed to another account ID or email while retaining a matching unbound invitation', async () => {
  const unbound = { ...invite, id: '44444444-4444-4444-8444-444444444444', invited_user_id: null };
  mockRows = [invite, unbound, { ...invite, invited_user_id: 'bob' }, { ...invite, email: 'bob@example.com' }];
  await expect(listPendingInvites('alice')).resolves.toEqual([invite, unbound]);
});

test('surfaces database query failures instead of presenting an empty inbox', async () => {
  mockQueryError = { message: 'Invitation lookup unavailable' };
  await expect(listPendingInvites('alice')).rejects.toThrow('Invitation lookup unavailable');
});

test.each([
  { data: { user: null }, error: null },
  { data: { user: { id: 'alice', email: 'alice@example.com' } }, error: new Error('Expired session') },
  { data: { user: { id: 'alice', email: ' ' } }, error: null },
  { data: { user: { id: 'alice', email: 'alice@example.com', email_confirmed_at: null } }, error: null },
])('requires a valid authenticated email before listing invitations: %p', async (response) => {
  mockGetUser.mockResolvedValue(response);
  await expect(listPendingInvites('alice')).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each([null, {}, 'unexpected'])('treats a malformed query payload as an empty inbox: %p', async (payload) => {
  mockRows = payload;
  await expect(listPendingInvites('alice')).resolves.toEqual([]);
});

test.each([
  null,
  'not an invitation',
  {},
  { ...invite, id: 42 },
  { ...invite, id: '' },
  { ...invite, home_id: null },
  { ...invite, home_id: '' },
  { ...invite, home_name: undefined },
  { ...invite, home_name: '' },
  { ...invite, home_name: 42 },
  { ...invite, invited_user_id: undefined },
  { ...invite, status: 'accepted' },
  { ...invite, role: 'owner' },
  { ...invite, role: ['guest'] },
  { ...invite, room_ids: 'room' },
  { ...invite, room_ids: [42] },
  { ...invite, created_at: undefined },
  { ...invite, created_at: 'not a timestamp' },
  { ...invite, expires_at: 'not a timestamp' },
])('excludes malformed invitation rows: %p', async (row) => {
  mockRows = [row, invite];
  await expect(listPendingInvites('alice')).resolves.toEqual([invite]);
});
