import { buildInvitationAccess } from './invitationAccess';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';

const now = Date.parse('2026-10-03T12:00:00Z');

test('room-limited invitations require an explicit current selection', () => {
  expect(() => buildInvitationAccess('Guest', [], ['bedroom'], 0, now)).toThrow('Choose at least');
  expect(() => buildInvitationAccess('Tenant', ['deleted'], ['bedroom'], 0, now)).toThrow('Choose at least');
  expect(buildInvitationAccess('Guest', ['bedroom', 'bedroom', 'kitchen'], ['bedroom', 'kitchen'], 24, now)).toEqual({
    roomIds: ['bedroom', 'kitchen'], accessExpiresAt: '2026-10-04T12:00:00.000Z',
  });
});

test('tenant and full-home roles stay permanent while temporary guest access has an exact boundary', () => {
  expect(buildInvitationAccess('Tenant', ['bedroom'], ['bedroom'], 24, now).accessExpiresAt).toBeNull();
  expect(buildInvitationAccess('Admin', [], [], 24, now)).toEqual({ roomIds: [], accessExpiresAt: null });
  const guest = { role: 'Guest', accessExpiresAt: '2026-10-03T12:00:00.000Z' };
  expect(hasCurrentMembershipAccess(guest, now - 1)).toBe(true);
  expect(hasCurrentMembershipAccess(guest, now)).toBe(false);
  expect(hasCurrentMembershipAccess(guest, now + 1)).toBe(false);
  expect(hasCurrentMembershipAccess({ role: 'Guest', accessExpiresAt: 'bad-date' }, now)).toBe(false);
  expect(hasCurrentMembershipAccess({ role: 'Guest', accessExpiresAt: null }, now)).toBe(true);
  expect(hasCurrentMembershipAccess(undefined, now)).toBe(false);
});
