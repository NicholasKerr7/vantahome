import { RoutineMinuteLedger } from './routineMinuteLedger';
import { readRoutineClock } from './routineClock';

const scope = { authenticatedUserId: 'owner', accountUserId: 'owner', sessionEpoch: 1, activeHomeId: 'home', activeMemberId: 'owner' };

test('a multi-trigger routine cannot repeat either wall minute during the DST fallback hour', () => {
  const ledger = new RoutineMinuteLedger();
  const claim = (iso: string) => {
    const now = new Date(iso);
    return ledger.claim(scope, 'routine', readRoutineClock(now, 'America/New_York')!.minuteKey, now.getTime());
  };
  expect(claim('2026-11-01T05:15:00Z')).toBe(true);
  expect(claim('2026-11-01T05:30:00Z')).toBe(true);
  expect(claim('2026-11-01T06:15:00Z')).toBe(false);
  expect(claim('2026-11-01T06:30:00Z')).toBe(false);
  expect(claim('2026-11-02T06:15:00Z')).toBe(true);
});

test('markers survive home changes but never suppress another account or login session', () => {
  const ledger = new RoutineMinuteLedger();
  expect(ledger.claim(scope, 'routine', 'minute', 1)).toBe(true);
  expect(ledger.claim({ ...scope, activeHomeId: 'other' }, 'routine', 'minute', 2)).toBe(true);
  expect(ledger.claim(scope, 'routine', 'minute', 3)).toBe(false);
  expect(ledger.claim({ ...scope, authenticatedUserId: 'next', accountUserId: 'next' }, 'routine', 'minute', 4)).toBe(true);
  expect(ledger.claim({ ...scope, sessionEpoch: 2 }, 'routine', 'minute', 5)).toBe(true);
});

test('expires old markers and bounds unusual schedule volume without allowing duplicates', () => {
  const ledger = new RoutineMinuteLedger();
  for (let index = 0; index < 8192; index += 1) expect(ledger.claim(scope, `routine-${index}`, 'minute', 1)).toBe(true);
  expect(ledger.claim(scope, 'extra', 'minute', 2)).toBe(false);
  expect(ledger.claim(scope, 'routine-0', 'minute', 3)).toBe(false);
  expect(ledger.claim(scope, 'extra', 'minute', 27 * 60 * 60 * 1000)).toBe(true);
});
