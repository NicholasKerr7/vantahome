/** A reviewed deadline plus exactly one way to extend it; the server repeats every check. */
export type GuestAccessChange = {
  expectedExpiresAt: string;
  durationHours?: 1 | 24 | 168;
  expiresAt?: string;
};

export const GUEST_EXTENSION_DURATIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
] as const;

const HOUR_MS = 60 * 60 * 1000;
const MAX_EXTENSION_WINDOW_MS = 365 * 24 * HOUR_MS;

/** Distinguish finite active access from expired access without treating bad data as renewable. */
export function getGuestAccessExtensionMode(
  expiresAt: string | null | undefined,
  now = Date.now(),
): 'extend' | 'renew' | null {
  if (!expiresAt || !Number.isFinite(now)) return null;
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) return null;
  return deadline > now ? 'extend' : 'renew';
}

/** Preview the exact policy: add to active time, restart expired time, never shorten access. */
export function resolveGuestAccessDeadline(
  currentExpiry: string | null | undefined,
  change: GuestAccessChange,
  now = Date.now(),
): string {
  if (!getGuestAccessExtensionMode(currentExpiry, now)) {
    throw new Error('Choose a Guest with a valid access deadline.');
  }
  const current = Date.parse(currentExpiry!);
  if (Date.parse(change.expectedExpiresAt) !== current) {
    throw new Error('Guest access changed. Review the latest deadline.');
  }
  const hasDuration = change.durationHours !== undefined;
  const hasDate = change.expiresAt !== undefined;
  if (hasDuration === hasDate) throw new Error('Choose a duration or a custom end date.');
  if (hasDuration && !GUEST_EXTENSION_DURATIONS.some(({ hours }) => hours === change.durationHours)) {
    throw new Error('Choose 1 hour, 24 hours, or 7 days.');
  }
  const base = Math.max(current, now);
  const deadline = hasDuration ? base + change.durationHours! * HOUR_MS : Date.parse(change.expiresAt!);
  if (!Number.isFinite(deadline) || deadline <= base) {
    throw new Error('Choose an end date after now and the current access deadline.');
  }
  if (deadline > now + MAX_EXTENSION_WINDOW_MS) {
    throw new Error('Choose an end date within the next 365 days.');
  }
  return new Date(deadline).toISOString();
}

/** Parse explicit local fields and reject calendar rollover or a missing daylight-saving time. */
export function parseGuestAccessLocalDateTime(dateValue: string, timeValue: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) throw new Error('Use YYYY-MM-DD for the date and HH:mm for the time.');
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const local = new Date(year, month - 1, day, hour, minute);
  if (year < 2000 || local.getFullYear() !== year || local.getMonth() !== month - 1
    || local.getDate() !== day || local.getHours() !== hour || local.getMinutes() !== minute) {
    throw new Error('Choose a valid local date and time.');
  }
  return local.toISOString();
}

/** Include the year and local timezone so access confirmations cannot be mistaken for another day. */
export function formatGuestAccessDeadline(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return 'Deadline unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}
