/** Public town coordinates; no owner's name or private street address is sent. */
export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

/** Hopewell, Hanover, Jamaica; Open-Meteo / GeoNames town ID 3490014. */
export const PROPERTY_LOCATION: WeatherLocation = {
  name: 'Hopewell, Jamaica',
  latitude: 18.4538,
  longitude: -78.01534,
  timeZone: 'America/Jamaica',
};

export interface DaylightDay {
  date: string;
  sunrise: number | null;
  sunset: number | null;
}

/** Normalized Open-Meteo model conditions, with timestamps in milliseconds. */
export interface WeatherSnapshot {
  tempC: number;
  precipitationMm: number;
  rainMm: number;
  snowfallCm: number;
  cloudCover: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  weatherCode: number;
  observedAt: number;
  fetchedAt: number;
  intervalSeconds: number;
  timeZone: string;
  daylightDays: DaylightDay[];
}

export type WeatherStatus = 'loading' | 'live' | 'stale' | 'unavailable';

export interface WeatherState {
  weather: WeatherSnapshot | null;
  status: WeatherStatus;
  error: string | null;
}

export interface SolarClock {
  isNight: boolean;
  daylight: number;
  sunAltitudeDeg: number;
  localTime: string;
  localDate: string;
  timeZone: string;
  clockSource: 'sunrise-sunset' | 'solar-calculation';
}

export interface LiveEnvironment extends WeatherState, SolarClock {
  now: number;
  location: WeatherLocation;
  refresh: () => void;
}
