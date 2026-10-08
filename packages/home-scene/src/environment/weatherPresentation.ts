import { weatherStateAtTime, weatherStatus } from './weatherMonitor';
import type { WeatherSnapshot, WeatherState, WeatherStatus } from './types';

export interface WeatherPresentation {
  weather: WeatherSnapshot | null;
  status: WeatherStatus;
  sourceLabel: string;
  statusLabel: string;
  modelAgeLabel: string | null;
  fetchedAgeLabel: string | null;
  effectsActive: boolean;
}

/** Only a recent successful model response may drive current precipitation, wind or cloud effects. */
export function currentWeather(state: WeatherState, now: number): WeatherSnapshot | null {
  return state.status === 'live' && weatherStatus(state.weather, now, state.error) === 'live' ? state.weather : null;
}

/** Describe elapsed model/download time separately, including clock skew instead of hiding it. */
function relativeAge(timestamp: number, now: number): string {
  const difference = now - timestamp;
  const minutes = Math.floor(Math.abs(difference) / 60_000);
  const duration = minutes === 0 ? '<1 min' : minutes < 60 ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return `${duration} ${difference < 0 ? 'ahead' : 'ago'}`;
}

/** Keep historical readings useful while clearly separating model age from retrieval age. */
export function weatherPresentation(state: WeatherState, now: number): WeatherPresentation {
  const aged = weatherStateAtTime(state, now);
  const statusLabel: Record<WeatherStatus, string> = {
    live: 'Current estimate', stale: 'Saved estimate', loading: 'Checking weather…', unavailable: 'Weather unavailable',
  };
  return {
    weather: aged.weather,
    status: aged.status,
    sourceLabel: 'Regional estimate',
    statusLabel: statusLabel[aged.status],
    modelAgeLabel: aged.weather ? `Model time: ${relativeAge(aged.weather.observedAt, now)}` : null,
    fetchedAgeLabel: aged.weather ? `Retrieved: ${relativeAge(aged.weather.fetchedAt, now)}` : null,
    effectsActive: currentWeather(aged, now) !== null,
  };
}
