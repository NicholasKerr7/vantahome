import type { WeatherLocation } from './types';

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

/** Send validated coordinates with documented UTC epoch timestamps and metric units to the fixed provider. */
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

/** Compare the query-relevant fields without treating a label change as another location. */
export function sameWeatherLocation(left: WeatherLocation | null, right: WeatherLocation | null): boolean {
  return left === right || Boolean(left && right && left.latitude === right.latitude && left.longitude === right.longitude && left.timeZone === right.timeZone);
}
