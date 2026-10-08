import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot, WeatherState } from './types';
import { WEATHER_CACHE_MAX_AGE_MS, WEATHER_FRESH_MS, WEATHER_POLL_MS } from './weatherClient';
import { currentWeather, weatherPresentation } from './weatherPresentation';
import { weatherStateAtTime } from './weatherMonitor';

const NOW = Date.parse('2026-10-08T12:00:00Z');

/** Model and download timestamps deliberately differ so presentation cannot conflate them. */
function stateFixture(overrides: Partial<WeatherState> = {}): WeatherState {
  const weather: WeatherSnapshot = {
    tempC: 27, precipitationMm: 1, rainMm: 1, snowfallCm: 0, cloudCover: 90,
    windSpeedKmh: 20, windDirectionDeg: 45, weatherCode: 61,
    observedAt: NOW - 12 * 60_000, fetchedAt: NOW - 2 * 60_000,
    intervalSeconds: 900, timeZone: 'America/Jamaica', daylightDays: [],
  };
  return { weather, status: 'live', error: null, ...overrides };
}

describe('truthful weather presentation', () => {
  it('distinguishes model time from retrieval time and labels the source as a regional estimate', () => {
    const state = stateFixture();
    expect(weatherPresentation(state, NOW)).toMatchObject({
      weather: state.weather, sourceLabel: 'Regional estimate', statusLabel: 'Current estimate',
      modelAgeLabel: 'Model time: 12 min ago', fetchedAgeLabel: 'Retrieved: 2 min ago', effectsActive: true,
    });
    expect(currentWeather(state, NOW)).toBe(state.weather);
  });

  it.each(['observedAt', 'fetchedAt'] as const)('fresh retrieval cannot hide an old %s timestamp', (key) => {
    const state = stateFixture();
    state.weather![key] = NOW - WEATHER_FRESH_MS - 1;
    expect(currentWeather(state, NOW)).toBeNull();
    expect(weatherPresentation(state, NOW)).toMatchObject({ status: 'stale', statusLabel: 'Saved estimate', effectsActive: false });
    expect(weatherPresentation(state, NOW).weather).toBe(state.weather);
  });

  it.each(['stale', 'loading', 'unavailable'] as const)('never animates a %s snapshot even with recent timestamps', (status) => {
    expect(currentWeather(stateFixture({ status }), NOW)).toBeNull();
  });

  it('stops effects on failed refresh while retaining explicitly historical readings', () => {
    const state = stateFixture({ error: 'Offline' });
    expect(currentWeather(state, NOW)).toBeNull();
    expect(weatherPresentation(state, NOW)).toMatchObject({ weather: state.weather, status: 'stale', effectsActive: false });
  });

  it.each(['observedAt', 'fetchedAt'] as const)('expires the display after the six-hour %s limit', (key) => {
    const state = stateFixture({ status: 'stale' });
    state.weather![key] = NOW - WEATHER_CACHE_MAX_AGE_MS - 1;
    expect(weatherPresentation(state, NOW)).toMatchObject({
      weather: null, status: 'unavailable', modelAgeLabel: null, fetchedAgeLabel: null, effectsActive: false,
    });
  });

  it.each([NaN, Infinity, 0, NOW + WEATHER_POLL_MS + 1])('rejects invalid or unreasonably future timestamp %s', (timestamp) => {
    const state = stateFixture();
    state.weather!.observedAt = timestamp;
    expect(currentWeather(state, NOW)).toBeNull();
    expect(weatherPresentation(state, NOW).weather).toBeNull();
  });

  it('makes tolerated future clock skew visible instead of calling it just refreshed', () => {
    const state = stateFixture();
    state.weather!.observedAt = NOW + 2 * 60_000;
    expect(weatherPresentation(state, NOW).modelAgeLabel).toBe('Model time: 2 min ahead');
  });

  it('never manufactures readings or age labels when weather is unavailable', () => {
    expect(weatherPresentation(stateFixture({ weather: null, status: 'unavailable' }), NOW)).toMatchObject({
      weather: null, statusLabel: 'Weather unavailable', modelAgeLabel: null, fetchedAgeLabel: null, effectsActive: false,
    });
  });

  it('preserves snapshot identity when aging does not change presentation status', () => {
    const state = stateFixture();
    expect(weatherStateAtTime(state, NOW)).toBe(state);
  });
});
