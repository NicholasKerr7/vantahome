const mockGetUser = jest.fn();
const mockRpc = jest.fn();
jest.mock('./supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() }, rpc: (...args: unknown[]) => mockRpc(...args),
} }));

import { setMemberPermissionOverrideRemote } from './memberPermissions';
const homeId = '20000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000002';
const actorId = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  mockRpc.mockImplementation((_name, args) => Promise.resolve({ data: args.requested_allowed, error: null }));
});

test.each([true, false, null])('publishes only checked authoritative permission %s', async allowed => {
  await setMemberPermissionOverrideRemote(homeId, userId, 'light.control', allowed, actorId);
  expect(mockRpc).toHaveBeenCalledWith('set_member_permission_override', {
    target_home_id: homeId, target_user_id: userId, requested_permission: 'light.control', requested_allowed: allowed,
  });
});
test('distinguishes a denied reset from an already-absent override', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Permission change forbidden' } });
  await expect(setMemberPermissionOverrideRemote(homeId, userId, 'light.control', null, actorId)).rejects.toThrow('Permission change forbidden');
  await expect(setMemberPermissionOverrideRemote(homeId, userId, 'light.control', null, actorId)).resolves.toBeUndefined();
});
test.each([undefined, false, true])('rejects unconfirmed reset result %s', async data => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(setMemberPermissionOverrideRemote(homeId, userId, 'light.control', null, actorId)).rejects.toThrow('did not confirm');
});
test('rejects a changed actor before sending a household write', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  await expect(setMemberPermissionOverrideRemote(homeId, userId, 'light.control', true, actorId)).rejects.toThrow('Your account changed');
  expect(mockRpc).not.toHaveBeenCalled();
});
test('rejects a local home identifier without looking up another household', async () => {
  await expect(setMemberPermissionOverrideRemote('local-home', userId, 'light.control', true, actorId)).rejects.toThrow('Home is invalid');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});
