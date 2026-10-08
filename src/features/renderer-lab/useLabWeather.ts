import { useEffect, useMemo, useState } from 'react';
import { PROPERTY_LOCATION, type WeatherState } from '../../../packages/home-scene/src/environment/types';
import { weatherDescription } from '../../../packages/home-scene/src/environment/weatherClient';
import { WeatherMonitor } from '../../../packages/home-scene/src/environment/weatherMonitor';
import { currentWeather, weatherPresentation } from '../../../packages/home-scene/src/environment/weatherPresentation';
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
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (choice !== 'auto' || !active) return;
    /** Publish validated monitor snapshots without retaining a stale hook closure. */
    const update = () => {
      setSnapshot(monitor.getSnapshot());
      setNow(Date.now());
    };
    const unsubscribe = monitor.subscribe(update);
    // A stalled refresh cannot hold rain/wind active beyond the freshness window.
    const ageTimer = setInterval(() => setNow(Date.now()), 60_000);
    update();
    return () => { clearInterval(ageTimer); unsubscribe(); };
  }, [choice, active, monitor]);

  return useMemo(() => {
    if (choice !== 'auto') return {
      settings: WEATHER_PRESETS[choice], status: 'preview', title: WEATHER_LABELS[choice],
      detail: 'Manual weather preview', refresh: monitor.refresh,
    };
    // Read the real clock on resume as well as each active minute; saved data is display-only.
    const currentTime = Date.now();
    const presentation = weatherPresentation(snapshot, currentTime);
    const { weather, status } = presentation;
    const current = active ? currentWeather(snapshot, currentTime) : null;
    const settings = current ? classifyWeather(current) : WEATHER_PRESETS.clear;
    const title = current ? WEATHER_LABELS[settings.weather] : 'Auto weather';
    const detail = status === 'loading' ? 'Checking Hopewell town weather · Open-Meteo · Effects paused'
      : status === 'unavailable' || !weather ? 'Hopewell town weather unavailable · Effects paused'
      : `${status === 'stale' ? 'Saved estimate' : 'Regional estimate'} · Hopewell town · ${weatherDescription(weather.weatherCode)} · Open-Meteo · ${presentation.modelAgeLabel}${current ? '' : ' · Effects paused'}`;
    return { settings, status, title, detail, refresh: monitor.refresh };
  }, [choice, snapshot, active, monitor, now]);
}
