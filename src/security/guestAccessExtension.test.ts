import {
  formatGuestAccessDeadline, getGuestAccessExtensionMode, parseGuestAccessLocalDateTime,
  resolveGuestAccessDeadline, type GuestAccessChange,
} from './guestAccessExtension';

const now = Date.parse('2026-10-07T12:00:00.000Z');
const active = '2026-10-08T12:00:00.000Z';
const expired = '2026-10-05T12:00:00.000Z';

test('adds time to the active deadline instead of discarding the remaining time', () => {
  expect(resolveGuestAccessDeadline(active, { expectedExpiresAt: active, durationHours: 24 }, now))
    .toBe('2026-10-09T12:00:00.000Z');
});

test('renews expired access from now', () => {
  expect(resolveGuestAccessDeadline(expired, { expectedExpiresAt: expired, durationHours: 1 }, now))
    .toBe('2026-10-07T13:00:00.000Z');
});

test('treats the exact deadline as expired', () => {
  expect(getGuestAccessExtensionMode(new Date(now).toISOString(), now)).toBe('renew');
  expect(getGuestAccessExtensionMode(active, now)).toBe('extend');
});

test.each([null, undefined, '', 'invalid'])('does not offer renewal for missing or invalid expiry: %s', (expiry) => {
  expect(getGuestAccessExtensionMode(expiry, now)).toBeNull();
  expect(() => resolveGuestAccessDeadline(expiry, { expectedExpiresAt: active, durationHours: 1 }, now)).toThrow('valid access deadline');
});

test('rejects a stale review instead of extending a newer access grant twice', () => {
  expect(() => resolveGuestAccessDeadline(active, { expectedExpiresAt: expired, durationHours: 24 }, now)).toThrow('Guest access changed');
});

test.each<GuestAccessChange>([
  { expectedExpiresAt: active },
  { expectedExpiresAt: active, durationHours: 1, expiresAt: '2026-10-10T00:00:00Z' },
])('requires exactly one extension mode: %j', (change) => {
  expect(() => resolveGuestAccessDeadline(active, change, now)).toThrow('duration or a custom');
});

test('accepts an exact custom end date after the current deadline', () => {
  expect(resolveGuestAccessDeadline(active, { expectedExpiresAt: active, expiresAt: '2026-10-10T18:30:00-04:00' }, now))
    .toBe('2026-10-10T22:30:00.000Z');
});

test.each(['invalid', active, expired, '2026-10-07T13:00:00Z'])('rejects invalid or shortening custom deadline %s', (expiresAt) => {
  expect(() => resolveGuestAccessDeadline(active, { expectedExpiresAt: active, expiresAt }, now)).toThrow('after now');
});

test('caps both preset and custom results to the next 365 days', () => {
  const lastAllowed = new Date(now + 365 * 86400000).toISOString();
  expect(resolveGuestAccessDeadline(active, { expectedExpiresAt: active, expiresAt: lastAllowed }, now)).toBe(lastAllowed);
  expect(() => resolveGuestAccessDeadline(lastAllowed, { expectedExpiresAt: lastAllowed, durationHours: 1 }, now)).toThrow('365 days');
  expect(() => resolveGuestAccessDeadline(active, { expectedExpiresAt: active, expiresAt: '2028-01-01T00:00:00Z' }, now)).toThrow('365 days');
});

test('local date and time retain the intended wall-clock fields', () => {
  const date = new Date(parseGuestAccessLocalDateTime('2026-10-12', '18:30'));
  expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 9, 12, 18, 30]);
});

test.each([
  ['2026-02-30', '18:30'], ['2026-13-01', '18:30'], ['2026-10-12', '24:00'],
  ['2026-10-12', '18:60'], ['10/12/2026', '18:30'], ['2026-10-12', '6pm'],
])('rejects rolled-over or ambiguous fields %s %s', (date, time) => {
  expect(() => parseGuestAccessLocalDateTime(date, time)).toThrow();
});

test('deadline formatting is safe and includes the full year', () => {
  expect(formatGuestAccessDeadline(active)).toContain('2026');
  expect(formatGuestAccessDeadline('invalid')).toBe('Deadline unavailable');
});
