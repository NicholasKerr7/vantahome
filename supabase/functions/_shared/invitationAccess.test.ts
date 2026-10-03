import { validateInvitationAccess } from './invitationAccess';

const now = Date.parse('2026-10-03T12:00:00Z');
const room = '30000000-0000-4000-8000-000000000001';

test('rejects absent, malformed and oversized explicit room scope', () => {
  expect(() => validateInvitationAccess('guest', [], null, now)).toThrow('room access');
  expect(() => validateInvitationAccess('tenant', ['bad'], null, now)).toThrow('valid room');
  expect(() => validateInvitationAccess('guest', Array(101).fill(room), null, now)).toThrow('valid room');
  expect(validateInvitationAccess('guest', [room, room], null, now)).toEqual({ roomIds: [room], accessExpiresAt: null });
});

test('validates a guest deadline with server time and a 30-day ceiling', () => {
  for (const value of ['bad', new Date(now - 1).toISOString(), new Date(now).toISOString(), new Date(now + 30 * 86400000 + 1).toISOString()]) {
    expect(() => validateInvitationAccess('guest', [room], value, now)).toThrow('next 30 days');
  }
  const expiry = new Date(now + 30 * 86400000).toISOString();
  expect(validateInvitationAccess('guest', [room], expiry, now).accessExpiresAt).toBe(expiry);
  expect(() => validateInvitationAccess('tenant', [room], expiry, now)).toThrow('Guest access');
  expect(validateInvitationAccess('tenant', [room], undefined, now).accessExpiresAt).toBeNull();
});
