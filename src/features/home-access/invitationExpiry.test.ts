import { isInvitationExpired } from './invitationExpiry';
import type { HomeInvite } from '../../services/cloudRegistry';

const now = Date.parse('2026-10-03T12:00:00Z');
const guest: HomeInvite = {
  id: 'invite', home_id: 'home', home_name: 'Home', email: 'guest@example.test',
  invited_user_id: 'guest', role: 'guest', room_ids: ['bedroom'], status: 'pending',
  created_at: '2026-10-03T11:00:00Z', expires_at: '2026-10-10T12:00:00Z',
};

test('an invitation cannot grant guest access at or beyond its separate access deadline', () => {
  const temporary = { ...guest, access_expires_at: '2026-10-03T12:00:00Z' };
  expect(isInvitationExpired(temporary, now - 1)).toBe(false);
  expect(isInvitationExpired(temporary, now)).toBe(true);
  expect(isInvitationExpired(temporary, now + 1)).toBe(true);
  expect(isInvitationExpired({ ...guest, access_expires_at: 'bad-date' }, now)).toBe(true);
  expect(isInvitationExpired(guest, now)).toBe(false);
});
