import type { WeatherLocation } from '../../../packages/home-scene/src/environment/types';
import { isValidTimeZone } from '../../../packages/home-scene/src/environment/weatherLocation';

export type WeatherLocationDraft = { name: string; latitude: string; longitude: string; timeZone: string };
export type WeatherLocationField = keyof WeatherLocationDraft;
export type WeatherLocationErrors = Partial<Record<WeatherLocationField, string>>;

/** Preserve the confirmed coordinates as editable text without consulting the phone's location. */
export function weatherLocationDraft(location: WeatherLocation): WeatherLocationDraft {
  return { name: location.name, latitude: String(location.latitude), longitude: String(location.longitude), timeZone: location.timeZone };
}

/** Reject blank, non-decimal, and out-of-range coordinate input before numeric conversion. */
function parseCoordinate(value: string, maximum: number): number | null {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const coordinate = Number(text);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= maximum ? coordinate : null;
}

/** Return field-specific guidance and a normalized location only when every field is valid. */
export function validateWeatherLocationDraft(draft: WeatherLocationDraft): {
  errors: WeatherLocationErrors;
  location: WeatherLocation | null;
} {
  const errors: WeatherLocationErrors = {};
  const name = draft.name.trim();
  const latitude = parseCoordinate(draft.latitude, 90);
  const longitude = parseCoordinate(draft.longitude, 180);
  const timeZone = draft.timeZone.trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) errors.name = 'Enter a name from 1 to 120 characters.';
  if (latitude === null) errors.latitude = 'Use a number from −90 to 90.';
  if (longitude === null) errors.longitude = 'Use a number from −180 to 180.';
  if (!isValidTimeZone(timeZone)) errors.timeZone = 'Use a time zone such as America/Jamaica.';
  return {
    errors,
    location: Object.keys(errors).length || latitude === null || longitude === null
      ? null : { name, latitude, longitude, timeZone },
  };
}
