import { homeHeaderTime, homeHeaderWeather } from './homeHeaderPresentation';
import type { HomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';

const snapshot: HomeChromeSnapshot = {
  locationName: 'Property', localTime: '12:05 PM', tempC: 25, weatherCode: 0, weatherStatus: 'live',
  isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: true, preferenceError: false,
};

test('formats property midnight, noon and afternoon without changing its time zone', () => {
  expect(homeHeaderTime('12:05 AM', '24h')).toBe('00:05');
  expect(homeHeaderTime('12:05 PM', '24h')).toBe('12:05');
  expect(homeHeaderTime('2:35 PM', '24h')).toBe('14:35');
  expect(homeHeaderTime('00:05', '12h')).toBe('12:05 AM');
  expect(homeHeaderTime('14:35', '12h')).toBe('2:35 PM');
});

test('does not invent a clock when loading or reinterpret malformed input', () => {
  expect(homeHeaderTime(undefined, '12h')).toBe('—');
  expect(homeHeaderTime('unavailable', '24h')).toBe('unavailable');
  expect(homeHeaderTime('25:60', '24h')).toBe('25:60');
  expect(homeHeaderTime('25:12 PM', '12h')).toBe('25:12 PM');
});

test('converts display units while preserving cached and missing weather status', () => {
  expect(homeHeaderWeather(snapshot, 'F')).toEqual({ temperature: '77°F', status: 'Current regional estimate' });
  expect(homeHeaderWeather({ ...snapshot, weatherStatus: 'cached' }, 'C')).toEqual({ temperature: '25°C', status: 'Saved regional estimate' });
  expect(homeHeaderWeather(null, 'C')).toEqual({ temperature: '—', status: 'Checking weather' });
  expect(homeHeaderWeather({ ...snapshot, tempC: null, weatherCode: null, weatherStatus: 'unavailable' }, 'F')).toEqual({ temperature: '—', status: 'Weather unavailable' });
});
