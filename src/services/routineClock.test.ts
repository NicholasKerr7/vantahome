import { readRoutineClock } from './routineClock';

test('uses property time and weekday rather than the phone timezone', () => {
  expect(readRoutineClock(new Date('2026-10-14T01:30:00Z'), 'America/Jamaica')).toEqual({
    hour: 20, minute: 30, day: 'Tue', minuteKey: '2026-10-13-20:30',
  });
});

test('normalizes property midnight to hour zero', () => {
  expect(readRoutineClock(new Date('2026-10-14T05:00:00Z'), 'America/Jamaica')).toMatchObject({ hour: 0, minute: 0, day: 'Wed' });
});

test('observes daylight saving offsets and gives a repeated wall minute the same identity', () => {
  expect(readRoutineClock(new Date('2026-11-01T05:30:00Z'), 'America/New_York'))
    .toEqual(readRoutineClock(new Date('2026-11-01T06:30:00Z'), 'America/New_York'));
  expect(readRoutineClock(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toMatchObject({ hour: 3, minute: 30 });
});

test.each([null, '', 'Invalid/Zone'])('never falls back to phone time for unavailable timezone %s', (zone) => {
  expect(readRoutineClock(new Date(), zone)).toBeNull();
});
