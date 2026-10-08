import { useState, useSyncExternalStore } from 'react';
import { Clock3, CloudSun, Moon, RefreshCw, Sun } from 'lucide-react';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { precipitationRatePerHour } from './environment/precipitation';
import { getPropertyWeatherConfiguration, subscribePropertyWeatherConfiguration } from './environment/propertyWeatherConfiguration';
import { weatherDescription } from './environment/weatherClient';
import { weatherPresentation } from './environment/weatherPresentation';
import { isEmbeddedScene } from './embeddedHost';
import { useHomeStore } from './state';
import './environment-panel.css';

/** Separate regional estimates from scene previews in a compact, touch-friendly weather panel. */
export function EnvironmentPanel({ environment }: { environment: LiveEnvironment }) {
  const [page, setPage] = useState<'weather' | 'lighting'>('weather');
  const mode = useHomeStore((state) => state.lightingMode);
  const setMode = useHomeStore((state) => state.setLightingMode);
  const configuration = useSyncExternalStore(subscribePropertyWeatherConfiguration, getPropertyWeatherConfiguration, getPropertyWeatherConfiguration);
  const embedded = isEmbeddedScene();
  const locationReady = !embedded || configuration.status === 'ready';
  const presentation = weatherPresentation(environment, environment.now);
  const { weather } = presentation;
  return <section className="environment-panel" aria-label="Property time and weather">
    <div className="environment-location">
      <CloudSun size={28} aria-hidden="true" />
      <div><h3>{locationReady ? environment.location.name : 'Property weather'}</h3><p>{locationReady ? `${environment.localTime} · ${environment.timeZone}` : 'Verifying the home’s weather location'}</p></div>
      <strong>{weather ? `${Math.round(weather.tempC)}°` : '—'}</strong>
    </div>
    <nav className="environment-pages" aria-label="Environment options">
      <button aria-pressed={page === 'weather'} onClick={() => setPage('weather')}>Weather</button>
      <button aria-pressed={page === 'lighting'} onClick={() => setPage('lighting')}>Scene lighting</button>
    </nav>
    {page === 'weather' ? <>
      <div className="environment-source"><span>{presentation.sourceLabel}</span><span>{locationReady ? configuration.configured ? 'Property location' : 'Town fallback' : 'Location unverified'}</span></div>
      <p className="environment-status" role="status">{presentation.statusLabel}{weather ? ` · ${weatherDescription(weather.weatherCode)}` : ''}</p>
      {weather ? <>
        <dl className="environment-measurements">
          <div><dt>Wind</dt><dd>{Math.round(weather.windSpeedKmh)} <small>km/h</small></dd></div>
          <div><dt>Rain rate</dt><dd>{precipitationRatePerHour(weather.rainMm, weather.intervalSeconds).toFixed(1)} <small>mm/h</small></dd></div>
          <div><dt>Cloud cover</dt><dd>{Math.round(weather.cloudCover)}<small>%</small></dd></div>
        </dl>
        <div className="environment-age"><p>{presentation.modelAgeLabel}</p><p>{presentation.fetchedAgeLabel}</p></div>
      </> : null}
      <p className="environment-explanation">{presentation.effectsActive ? 'Rain, wind and cloud effects follow this estimate.' : 'Weather effects paused until a current estimate is available.'} {configuration.canManage ? 'Set your property location in Settings → Weather.' : locationReady && !configuration.configured ? 'The Owner can set the property location in Settings → Weather.' : ''}</p>
      <footer className="environment-footer">
        <p>Model data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · checked every 15 min. Conditions may differ at the property.</p>
        <button className="dashboard-icon-button" aria-label="Refresh weather estimate" disabled={!locationReady || presentation.status === 'loading'} onClick={environment.refresh}><RefreshCw size={18} aria-hidden="true" /></button>
      </footer>
    </> : <>
      <fieldset className="environment-modes"><legend>Scene lighting</legend><div>{([{ id: 'auto', label: 'Local time', icon: Clock3 }, { id: 'day', label: 'Day preview', icon: Sun }, { id: 'night', label: 'Night preview', icon: Moon }] as const).map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>)}</div></fieldset>
      <p className="environment-explanation">{mode === 'auto' ? 'Daylight follows the property’s sunrise and sunset. The four solar streetlights switch on at sunset and off at sunrise.' : 'You’re previewing the lighting. Choose Local time to resume sunrise and sunset automation.'}</p>
      <p className="environment-explanation">Individual light overrides last until the next day/night change or lighting selection. The local daylight clock keeps working offline.</p>
      <p className="environment-explanation">Irrigation follows its device control. All motion respects your motion preference.</p>
    </>}
  </section>;
}
