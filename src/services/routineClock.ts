import type { Weekday } from '../store/useHomeStore';

export type RoutineClock = { hour: number; minute: number; day: Weekday; minuteKey: string };
let formatter: Intl.DateTimeFormat | undefined;
let formatterZone: string | undefined;

/** Use property wall time for triggers and conditions; invalid or unknown settings pause time-based work. */
export function readRoutineClock(now: Date, timeZone: string | null): RoutineClock | null {
  if (!timeZone) return null;
  try {
    if (formatterZone !== timeZone || !formatter) {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      formatterZone = timeZone;
    }
    const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
    return { hour: Number(parts.hour), minute: Number(parts.minute), day: parts.weekday as Weekday,
      minuteKey: `${parts.year}-${parts.month}-${parts.day}-${parts.hour}:${parts.minute}` };
  } catch { return null; }
}
