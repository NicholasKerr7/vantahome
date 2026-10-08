import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { deriveSolarClock } from './solarClock';
import { PROPERTY_LOCATION } from './types';
import type { LiveEnvironment, WeatherLocation, WeatherState } from './types';
import { WeatherMonitor, weatherStateAtTime } from './weatherMonitor';

export { PROPERTY_LOCATION } from './types';
export type { LiveEnvironment, WeatherLocation, WeatherSnapshot } from './types';

const WAITING_WEATHER: WeatherState = { weather: null, status: 'loading', error: null };

/** Waiting for trusted host configuration must not subscribe to a previous property's monitor. */
function subscribeWaitingWeather(): () => void {
  return () => {};
}

/** A stable empty snapshot satisfies React without exposing cached readings before configuration. */
function waitingWeatherSnapshot(): WeatherState {
  return WAITING_WEATHER;
}

/** Align light changes to the next real minute and immediately catch up after backgrounding. */
export function subscribeMinuteClock(onMinute: (now: number) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Schedule only while visible; the callback always reads the real clock. */
  function update(): void {
    clearTimeout(timer);
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = Date.now();
    onMinute(now);
    timer = setTimeout(update, 60_000 - now % 60_000);
  }
  update();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', update);
  return () => {
    clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', update);
  };
}

/** Share property time and explicitly aged regional estimates without granting saved data live status. */
export function useLiveEnvironment(location: WeatherLocation = PROPERTY_LOCATION, enabled = true): LiveEnvironment {
  const monitor = useMemo(() => new WeatherMonitor(location),
    [location.latitude, location.longitude, location.timeZone, location.name]);
  const snapshot = enabled ? monitor.getSnapshot : waitingWeatherSnapshot;
  const state = useSyncExternalStore(enabled ? monitor.subscribe : subscribeWaitingWeather, snapshot, snapshot);
  const [minuteTick, setMinuteTick] = useState(Date.now);
  useEffect(() => subscribeMinuteClock(setMinuteTick), []);
  const solar = useMemo(() => deriveSolarClock(Date.now(), location, state.weather), [minuteTick, location, state.weather]);
  // Responses arrive between minute ticks; freshness and age labels must use this render's real clock.
  const now = Date.now();
  return {
    ...weatherStateAtTime(state, now),
    ...solar,
    now,
    location,
    refresh: monitor.refresh,
  };
}
