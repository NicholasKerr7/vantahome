import type { HomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';

/** Change only the clock format; the scene remains authoritative for the property's time zone. */
export function homeHeaderTime(value: string | undefined, format: '12h' | '24h'): string {
  if (!value) return '—';
  const parts = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!parts) return value;
  const [, hour, minute, period] = parts;
  if (period && (Number(hour) < 1 || Number(hour) > 12)) return value;
  const hours = period ? Number(hour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0) : Number(hour);
  if (hours > 23 || Number(minute) > 59) return value;
  return format === '24h' ? `${String(hours).padStart(2, '0')}:${minute}` : `${hours % 12 || 12}:${minute} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** Keep missing weather empty and cached estimates explicitly distinct from current readings. */
export function homeHeaderWeather(scene: HomeChromeSnapshot | null, unit: 'C' | 'F') {
  const temperature = scene?.tempC == null ? '—' : `${Math.round(unit === 'F' ? scene.tempC * 9 / 5 + 32 : scene.tempC)}°${unit}`;
  const status = !scene || scene.weatherStatus === 'loading' ? 'Checking weather'
    : scene.weatherStatus === 'cached' ? 'Saved regional estimate'
      : scene.weatherStatus === 'live' ? 'Current regional estimate' : 'Weather unavailable';
  return { temperature, status };
}
