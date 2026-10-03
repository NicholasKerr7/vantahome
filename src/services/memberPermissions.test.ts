const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
let mockWriteError: { message: string } | null = null;
jest.mock('./supabaseClient', () => ({ supabase: {
  auth: { getUser: () => mockGetUser() }, from: (...args: unknown[]) => mockFrom(...args),
} }));

import { setMemberPermissionOverrideRemote } from './memberPermissions';

const homeId = '20000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000002';
const actorId = '10000000-0000-4000-8000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  mockWriteError = null;
  mockGetUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  const query = {
    delete: mockDelete.mockImplementation(() => query),
    eq: mockEq.mockImplementation(() => query),
    upsert: mockUpsert.mockImplementation(() => query),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ error: mockWriteError }).then(resolve),
  };
  mockFrom.mockReturnValue(query);
});

test.each([true, false])('writes %s only to the reviewed active home without guessing a membership', async (allowed) => {
  await setMemberPermissionOverrideRemote(homeId, userId, 'light.control', allowed, actorId);
  expect(mockFrom).toHaveBeenCalledTimes(1);
  expect(mockFrom).toHaveBeenCalledWith('member_permission_overrides');
  expect(mockUpsert).toHaveBeenCalledWith({ home_id: homeId, user_id: userId, permission: 'light.control', allowed, updated_by: actorId },
    { onConflict: 'home_id,user_id,permission' });
});

test('removes only the selected home, person and action override', async () => {
  await setMemberPermissionOverrideRemote(homeId, userId, 'light.control', null, actorId);
  expect(mockEq.mock.calls).toEqual([['home_id', homeId], ['user_id', userId], ['permission', 'light.control']]);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockUpsert).not.toHaveBeenCalled();
});

test('rejects a changed actor before sending a household write', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  await expect(setMemberPermissionOverrideRemote(homeId, userId, 'light.control', true, actorId)).rejects.toThrow('Your account changed');
  expect(mockFrom).not.toHaveBeenCalled();
});

test('surfaces database authorization failure', async () => {
  mockWriteError = { message: 'Permission denied' };
  await expect(setMemberPermissionOverrideRemote(homeId, userId, 'light.control', true, actorId)).rejects.toThrow('Permission denied');
});

test('rejects a local home identifier without looking up another household', async () => {
  await expect(setMemberPermissionOverrideRemote('local-home', userId, 'light.control', true, actorId)).rejects.toThrow('Home is invalid');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockFrom).not.toHaveBeenCalled();
});
