import type { WeatherSnapshot } from '../environment/types';

/** Renderer-independent precipitation modes, never a command to a physical device. */
export type WeatherKind = 'clear' | 'light' | 'heavy' | 'storm';
export type WeatherChoice = WeatherKind | 'auto';

/** A bounded visual snapshot shared by native Filament and the offline Three.js scene. */
export interface WeatherSettings {
  weather: WeatherKind;
  windSpeed: number;
  windDirection: number;
}

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'Clear', light: 'Light rain', heavy: 'Heavy rain', storm: 'Thunderstorm',
};

/** Manual previews remain deterministic across renderers and independent of the network. */
export const WEATHER_PRESETS: Record<WeatherKind, Readonly<WeatherSettings>> = {
  clear: { weather: 'clear', windSpeed: 0, windDirection: 0 },
  light: { weather: 'light', windSpeed: 8, windDirection: 55 },
  heavy: { weather: 'heavy', windSpeed: 24, windDirection: 55 },
  storm: { weather: 'storm', windSpeed: 48, windDirection: 55 },
};

/** Reject malformed visual inputs before they reach native transforms or lighting. */
export function isWeatherSettings(value: unknown): value is WeatherSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Partial<WeatherSettings>;
  return (input.weather === 'clear' || input.weather === 'light' || input.weather === 'heavy' || input.weather === 'storm')
    && typeof input.windSpeed === 'number' && Number.isFinite(input.windSpeed) && input.windSpeed >= 0 && input.windSpeed <= 180
    && typeof input.windDirection === 'number' && Number.isFinite(input.windDirection) && input.windDirection >= 0 && input.windDirection < 360;
}

type ObservedWeather = Pick<WeatherSnapshot, 'weatherCode' | 'rainMm' | 'intervalSeconds' | 'windSpeedKmh' | 'windDirectionDeg'>;

/** WMO storm codes alone enable lightning; rainfall intensity never invents a thunderstorm. */
export function classifyWeather(snapshot: ObservedWeather): WeatherSettings {
  const code = snapshot.weatherCode;
  const rainPerHour = snapshot.rainMm * 3600 / Math.max(1, snapshot.intervalSeconds);
  const raining = snapshot.rainMm > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
  const heavy = [63, 65, 67, 81, 82].includes(code) || rainPerHour >= 2.5;
  const weather = [95, 96, 99].includes(code) ? 'storm' : raining ? heavy ? 'heavy' : 'light' : 'clear';
  return {
    weather,
    windSpeed: Math.max(0, Math.min(180, snapshot.windSpeedKmh)),
    windDirection: ((snapshot.windDirectionDeg % 360) + 360) % 360,
  };
}
