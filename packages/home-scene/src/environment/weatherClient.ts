import { localDateKey } from './solarClock';
import { hasNativeWeatherTransport, requestNativeWeather } from './nativeWeatherTransport';
import { PROPERTY_LOCATION } from './types';
import type { DaylightDay, WeatherLocation, WeatherSnapshot } from './types';

export const WEATHER_POLL_MS = 15 * 60_000;
export const WEATHER_FRESH_MS = 45 * 60_000;
export const WEATHER_CACHE_MAX_AGE_MS = 6 * 60 * 60_000;
export const WEATHER_REQUEST_TIMEOUT_MS = 12_000;
export const WEATHER_CREDIT_URL = 'https://open-meteo.com/';

const WEATHER_CODES = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

/** Restrict API and cached conditions to the documented WMO interpretation codes. */
export function isWeatherCode(value: unknown): value is number {
  return typeof value === 'number' && WEATHER_CODES.has(value);
}

/** Keep external objects unknown until their fields have been validated. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Weather data has an invalid format.');
  return value as Record<string, unknown>;
}

/** Reject missing, non-finite or implausible values instead of inventing conditions. */
function bounded(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error('Weather data is incomplete.');
  }
  return value;
}

/** Validate an IANA time zone before it reaches Intl formatters. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Guard configuration read from settings or any future location picker. */
export function isWeatherLocation(value: unknown): value is WeatherLocation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WeatherLocation>;
  return typeof candidate.name === 'string' && candidate.name.trim().length > 0 && candidate.name.length <= 120
    && typeof candidate.latitude === 'number' && Number.isFinite(candidate.latitude) && Math.abs(candidate.latitude) <= 90
    && typeof candidate.longitude === 'number' && Number.isFinite(candidate.longitude) && Math.abs(candidate.longitude) <= 180
    && isValidTimeZone(candidate.timeZone);
}

/** Use documented UTC epoch timestamps, metric units and town coordinates only. */
export function buildWeatherUrl(location: WeatherLocation): string {
  if (!isWeatherLocation(location)) throw new Error('Choose a valid weather location.');
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude),
    current: 'temperature_2m,precipitation,rain,showers,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code',
    daily: 'sunrise,sunset', timezone: location.timeZone, timeformat: 'unixtime', forecast_days: '3',
    wind_speed_unit: 'kmh', precipitation_unit: 'mm', temperature_unit: 'celsius',
  }).toString();
  return url.toString();
}

/** Reject a unit mismatch so imperial values cannot drive metric scene effects. */
function validateUnits(value: unknown): void {
  const units = record(value);
  const expected = { time: 'unixtime', temperature_2m: '°C', precipitation: 'mm', rain: 'mm',
    showers: 'mm', snowfall: 'cm', cloud_cover: '%', wind_speed_10m: 'km/h', wind_direction_10m: '°' };
  for (const [key, unit] of Object.entries(expected)) {
    if (units[key] !== unit) throw new Error('Weather data has unexpected units.');
  }
}

/** Normalize valid sunrise data; a missing polar sunrise is handled by solar math. */
function parseDaylightDays(value: unknown, timeZone: string): DaylightDay[] {
  const daily = record(value);
  if (!Array.isArray(daily.time) || !Array.isArray(daily.sunrise) || !Array.isArray(daily.sunset)
    || daily.time.length !== daily.sunrise.length || daily.time.length !== daily.sunset.length) {
    throw new Error('Sunrise data is incomplete.');
  }
  const sunrise = daily.sunrise;
  const sunset = daily.sunset;
  return daily.time.map((time, index) => ({
    date: localDateKey(bounded(time, 1, 20_000_000_000) * 1000, timeZone),
    sunrise: sunrise[index] == null ? null : bounded(sunrise[index], 1, 20_000_000_000) * 1000,
    sunset: sunset[index] == null ? null : bounded(sunset[index], 1, 20_000_000_000) * 1000,
  }));
}

/** Validate the public API boundary before any value reaches the scene. */
export function parseWeatherResponse(value: unknown, fetchedAt: number): WeatherSnapshot {
  const data = record(value);
  const current = record(data.current);
  validateUnits(data.current_units);
  if (!isValidTimeZone(data.timezone)) throw new Error('Weather time zone is invalid.');
  const weatherCode = bounded(current.weather_code, 0, 99);
  if (!isWeatherCode(weatherCode)) throw new Error('Weather condition is unrecognized.');
  const observedAt = bounded(current.time, 1, 20_000_000_000) * 1000;
  if (observedAt > fetchedAt + WEATHER_POLL_MS || fetchedAt - observedAt > WEATHER_CACHE_MAX_AGE_MS) {
    throw new Error('Weather data is out of date.');
  }
  return {
    tempC: bounded(current.temperature_2m, -100, 70),
    precipitationMm: bounded(current.precipitation, 0, 1000),
    rainMm: bounded(current.rain, 0, 1000) + bounded(current.showers, 0, 1000),
    snowfallCm: bounded(current.snowfall, 0, 500),
    cloudCover: bounded(current.cloud_cover, 0, 100),
    windSpeedKmh: bounded(current.wind_speed_10m, 0, 500),
    windDirectionDeg: bounded(current.wind_direction_10m, 0, 360) % 360,
    weatherCode,
    observedAt,
    fetchedAt,
    intervalSeconds: bounded(current.interval, 1, 3600),
    timeZone: data.timezone,
    daylightDays: parseDaylightDays(data.daily, data.timezone),
  };
}

/** Fetch model conditions with bounded latency and cancellation on unmount or location change. */
export async function fetchWeather(
  location: WeatherLocation,
  signal: AbortSignal,
  fetcher?: typeof fetch,
  now: () => number = Date.now,
): Promise<WeatherSnapshot> {
  const controller = new AbortController();
  let timedOut = false;
  /** Forward caller cancellation without requiring newer AbortSignal.any support. */
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, WEATHER_REQUEST_TIMEOUT_MS);
  try {
    const url = buildWeatherUrl(location);
    let data: unknown;
    if (!fetcher && hasNativeWeatherTransport()) {
      if (location.latitude !== PROPERTY_LOCATION.latitude || location.longitude !== PROPERTY_LOCATION.longitude
        || location.timeZone !== PROPERTY_LOCATION.timeZone) throw new Error('Weather location does not match the property.');
      data = await requestNativeWeather(controller.signal);
    } else {
      const response = await (fetcher ?? fetch)(url, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit',
      });
      if (!response.ok) throw new Error('Weather service is temporarily unavailable.');
      data = await response.json();
    }
    const weather = parseWeatherResponse(data, now());
    if (weather.timeZone !== location.timeZone) throw new Error('Weather location does not match the property.');
    return weather;
  } catch (error) {
    if (timedOut) throw new Error('Weather request timed out.');
    if (signal.aborted) throw new DOMException('Weather request cancelled.', 'AbortError');
    if (error instanceof Error && error.message.startsWith('Weather')) throw error;
    throw new Error('Weather could not be refreshed. Check your connection.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

/** Give the UI a short, accessible WMO condition description. */
export function weatherDescription(code: number): string {
  if (!isWeatherCode(code)) return 'Conditions unavailable';
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Conditions unavailable';
}
