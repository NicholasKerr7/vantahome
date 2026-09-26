import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { deriveSolarClock } from './solarClock';
import { PROPERTY_LOCATION } from './types';
import type { LiveEnvironment, WeatherLocation } from './types';
import { WeatherMonitor, weatherStatus } from './weatherMonitor';

export { PROPERTY_LOCATION } from './types';
export type { LiveEnvironment, WeatherLocation, WeatherSnapshot } from './types';

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

/** Share real property time, verified town weather and explicit freshness with the UI and scene. */
export function useLiveEnvironment(location: WeatherLocation = PROPERTY_LOCATION): LiveEnvironment {
  const monitor = useMemo(() => new WeatherMonitor(location),
    [location.latitude, location.longitude, location.timeZone, location.name]);
  const state = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
  const [now, setNow] = useState(Date.now);
  useEffect(() => subscribeMinuteClock(setNow), []);
  const solar = useMemo(() => deriveSolarClock(now, location, state.weather), [now, location, state.weather]);
  return {
    ...state,
    ...solar,
    status: state.status === 'live' ? weatherStatus(state.weather, now, state.error) : state.status,
    now,
    location,
    refresh: monitor.refresh,
  };
}
