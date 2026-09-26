import { Clock3, CloudSun, Moon, RefreshCw, Sun } from 'lucide-react';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { weatherDescription } from './environment/weatherClient';
import { useHomeStore } from './state';
import './environment-panel.css';

/** Show the live source and clock controls without taking space away from the model. */
export function EnvironmentPanel({ environment }: { environment: LiveEnvironment }) {
  const mode = useHomeStore((state) => state.lightingMode);
  const setMode = useHomeStore((state) => state.setLightingMode);
  const { weather, status, localTime } = environment;
  const statusLabel = status === 'live' ? 'Live weather' : status === 'stale' ? 'Saved weather · waiting to reconnect' : status === 'loading' ? 'Checking the sky…' : 'Weather unavailable';
  return <section className="environment-panel" aria-label="Property time and weather">
    <div className="environment-location"><CloudSun size={32} aria-hidden="true" /><div><h3>Hopewell, Jamaica</h3><p>{localTime} · America/Jamaica</p></div><strong>{weather ? `${Math.round(weather.tempC)}°` : '—'}</strong></div>
    <p className="environment-status" role="status">{statusLabel}{weather ? ` · ${weatherDescription(weather.weatherCode)}` : ''}</p>
    {weather ? <dl className="environment-measurements"><div><dt>Wind</dt><dd>{Math.round(weather.windSpeedKmh)} <small>km/h</small></dd></div><div><dt>Precipitation</dt><dd>{weather.precipitationMm.toFixed(1)} <small>mm</small></dd></div><div><dt>Cloud cover</dt><dd>{Math.round(weather.cloudCover)}<small>%</small></dd></div></dl> : null}
    <fieldset className="environment-modes"><legend>Scene lighting</legend><div>{([{ id: 'auto', label: 'Local time', icon: Clock3 }, { id: 'day', label: 'Day preview', icon: Sun }, { id: 'night', label: 'Night preview', icon: Moon }] as const).map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>)}</div></fieldset>
    <p className="environment-explanation">{mode === 'auto' ? 'Daylight follows the property’s sunrise and sunset. The four solar streetlights switch on at sunset and off at sunrise.' : 'You’re previewing the lighting. Choose Local time to resume sunrise and sunset automation.'} Individual light overrides last until the next day/night change or lighting selection.</p>
    <p className="environment-explanation">Plants follow the wind. Rain and snow appear outdoors when reported. Irrigation follows its device control. All motion respects your motion preference.</p>
    <footer className="environment-footer"><p>Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · model-based conditions, refreshed every 15 minutes.{weather ? ` Updated ${new Intl.DateTimeFormat('en', { timeZone: environment.timeZone, hour: 'numeric', minute: '2-digit' }).format(weather.observedAt)}.` : ''}{status !== 'live' ? ' The local daylight clock keeps working offline.' : ''}</p><button className="dashboard-icon-button" aria-label="Refresh live weather" disabled={status === 'loading'} onClick={environment.refresh}><RefreshCw size={18} /></button></footer>
  </section>;
}
