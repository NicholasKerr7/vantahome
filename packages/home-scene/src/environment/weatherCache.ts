import { WEATHER_CACHE_MAX_AGE_MS, WEATHER_POLL_MS, isValidTimeZone, isWeatherCode } from './weatherClient';
import type { DaylightDay, WeatherLocation, WeatherSnapshot } from './types';

export type WeatherStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Scope cached weather to the town and zone so a location change cannot reuse it. */
export function weatherCacheKey(location: WeatherLocation): string {
  return `vantahome-weather-v1:${location.latitude}:${location.longitude}:${location.timeZone}`;
}

/** Safely access browser storage when private browsing or policy blocks it. */
export function getWeatherStorage(): WeatherStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

/** Guard nullable solar timestamps from a previous session. */
function isDaylightDay(value: unknown): value is DaylightDay {
  if (!value || typeof value !== 'object') return false;
  const day = value as Partial<DaylightDay>;
  return typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
    && (day.sunrise === null || (typeof day.sunrise === 'number' && Number.isFinite(day.sunrise) && day.sunrise > 0))
    && (day.sunset === null || (typeof day.sunset === 'number' && Number.isFinite(day.sunset) && day.sunset > 0));
}

/** Validate persisted data just as carefully as a network response. */
function isSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<WeatherSnapshot>;
  const ranges: [keyof WeatherSnapshot, number, number][] = [
    ['tempC', -100, 70], ['precipitationMm', 0, 1000], ['rainMm', 0, 2000], ['snowfallCm', 0, 500],
    ['cloudCover', 0, 100], ['windSpeedKmh', 0, 500], ['windDirectionDeg', 0, 360],
    ['weatherCode', 0, 99], ['observedAt', 1, 20_000_000_000_000], ['fetchedAt', 1, 20_000_000_000_000],
    ['intervalSeconds', 1, 3600],
  ];
  return ranges.every(([key, minimum, maximum]) => typeof snapshot[key] === 'number'
    && Number.isFinite(snapshot[key]) && snapshot[key] >= minimum && snapshot[key] <= maximum)
    && isWeatherCode(snapshot.weatherCode) && isValidTimeZone(snapshot.timeZone)
    && Array.isArray(snapshot.daylightDays) && snapshot.daylightDays.length <= 4 && snapshot.daylightDays.every(isDaylightDay);
}

/** Retain at most six hours of last-good data, always presented as cached/stale. */
export function readWeatherCache(storage: WeatherStorage | undefined, location: WeatherLocation, now: number): WeatherSnapshot | null {
  try {
    const cached: unknown = JSON.parse(storage?.getItem(weatherCacheKey(location)) ?? 'null');
    if (!isSnapshot(cached) || cached.timeZone !== location.timeZone
      || cached.fetchedAt > now + WEATHER_POLL_MS || cached.observedAt > now + WEATHER_POLL_MS
      || now - cached.observedAt > WEATHER_CACHE_MAX_AGE_MS || now - cached.fetchedAt > WEATHER_CACHE_MAX_AGE_MS) return null;
    return cached;
  } catch { return null; }
}

/** Cache is a convenience; storage failure must never interrupt live weather. */
export function writeWeatherCache(storage: WeatherStorage | undefined, location: WeatherLocation, weather: WeatherSnapshot): void {
  try { storage?.setItem(weatherCacheKey(location), JSON.stringify(weather)); }
  catch { /* The current response remains usable even when storage is unavailable. */ }
}
