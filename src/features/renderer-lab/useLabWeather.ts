import { useEffect, useMemo, useState } from 'react';
import { PROPERTY_LOCATION, type WeatherState } from '../../../packages/home-scene/src/environment/types';
import { WEATHER_CACHE_MAX_AGE_MS, weatherDescription } from '../../../packages/home-scene/src/environment/weatherClient';
import { WeatherMonitor, weatherStatus } from '../../../packages/home-scene/src/environment/weatherMonitor';
import { classifyWeather, WEATHER_LABELS, WEATHER_PRESETS, type WeatherChoice, type WeatherSettings } from '../../../packages/home-scene/src/renderer-lab/weather';

export interface LabWeather {
  settings: WeatherSettings;
  status: 'preview' | WeatherState['status'];
  title: string;
  detail: string;
  refresh: () => void;
}

/** Resolve town weather only while Auto is visible; unsubscribe aborts requests and polling. */
export function useLabWeather(choice: WeatherChoice, active: boolean): LabWeather {
  const [monitor] = useState(() => new WeatherMonitor(PROPERTY_LOCATION));
  const [snapshot, setSnapshot] = useState<WeatherState>(() => monitor.getSnapshot());

  useEffect(() => {
    if (choice !== 'auto' || !active) return;
    /** Publish validated monitor snapshots without retaining a stale hook closure. */
    const update = () => setSnapshot(monitor.getSnapshot());
    const unsubscribe = monitor.subscribe(update);
    update();
    return unsubscribe;
  }, [choice, active, monitor]);

  return useMemo(() => {
    if (choice !== 'auto') return {
      settings: WEATHER_PRESETS[choice], status: 'preview', title: WEATHER_LABELS[choice],
      detail: 'Manual weather preview', refresh: monitor.refresh,
    };
    const now = Date.now();
    const cached = snapshot.weather;
    // A resumed request may still be pending; never render observations beyond the cache limit.
    const expired = cached !== null && (now - cached.observedAt > WEATHER_CACHE_MAX_AGE_MS
      || now - cached.fetchedAt > WEATHER_CACHE_MAX_AGE_MS);
    const weather = expired ? null : cached;
    // Recheck age when a foreground subscription resumes before its request completes.
    const status = expired ? 'unavailable'
      : snapshot.status === 'live' ? weatherStatus(weather, now, snapshot.error) : snapshot.status;
    const settings = weather ? classifyWeather(weather) : WEATHER_PRESETS.clear;
    const title = weather ? WEATHER_LABELS[settings.weather] : 'Auto weather';
    const detail = status === 'loading' ? 'Fetching Hopewell weather · Open-Meteo'
      : status === 'unavailable' || !weather ? 'Weather unavailable · Effects paused'
      : `${status === 'stale' ? 'Last known' : 'Live'} · Hopewell · ${weatherDescription(weather.weatherCode)} · Open-Meteo`;
    return { settings, status, title, detail, refresh: monitor.refresh };
  }, [choice, snapshot, active, monitor]);
}
