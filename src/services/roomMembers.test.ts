const mockRpc = jest.fn();
jest.mock('./supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

import { setRoomMembershipRemote } from './roomMembers';

const homeId = '20000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000001';
const roomId = '30000000-0000-4000-8000-000000000001';

beforeEach(() => { mockRpc.mockReset().mockResolvedValue({ error: null }); });

test.each([{ roomIds: [roomId] }, { roomIds: [] }])('uses one explicit-home RPC for room assignment $roomIds', async ({ roomIds }) => {
  await setRoomMembershipRemote(homeId, userId, roomIds);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('set_home_room_memberships', {
    target_home_id: homeId, target_user_id: userId, target_room_ids: roomIds,
  });
});

test.each([
  ['local-home', userId, [roomId]],
  [homeId, 'local-user', [roomId]],
  [homeId, userId, ['local-room']],
  [homeId, userId, [roomId, roomId]],
  [homeId, userId, Array.from({ length: 501 }, () => roomId)],
])('rejects invalid registry scope before a write (%s)', async (home, user, rooms) => {
  await expect(setRoomMembershipRemote(home as string, user as string, rooms as string[])).rejects.toThrow('Choose valid rooms');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('surfaces transaction denial without a partial-write fallback', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'Household administration required' } });
  await expect(setRoomMembershipRemote(homeId, userId, [roomId])).rejects.toThrow('Household administration required');
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
