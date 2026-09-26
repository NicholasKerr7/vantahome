import { fetchWeather, WEATHER_CACHE_MAX_AGE_MS, WEATHER_FRESH_MS, WEATHER_POLL_MS } from './weatherClient';
import { getWeatherStorage, readWeatherCache, writeWeatherCache } from './weatherCache';
import type { WeatherStorage } from './weatherCache';
import type { WeatherLocation, WeatherSnapshot, WeatherState, WeatherStatus } from './types';

type VisibilitySource = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
type WeatherLoader = (location: WeatherLocation, signal: AbortSignal) => Promise<WeatherSnapshot>;
interface MonitorOptions {
  load?: WeatherLoader;
  now?: () => number;
  storage?: WeatherStorage;
  visibility?: VisibilitySource;
}

/** "Live" requires a successful, recent model response, not merely a cached object. */
export function weatherStatus(weather: WeatherSnapshot | null, now: number, error: string | null): WeatherStatus {
  if (!weather) return 'unavailable';
  return error || now - weather.observedAt > WEATHER_FRESH_MS || now - weather.fetchedAt > WEATHER_FRESH_MS
    || weather.observedAt > now + WEATHER_POLL_MS || weather.fetchedAt > now + WEATHER_POLL_MS ? 'stale' : 'live';
}

/** A single cancellable weather subscription with no polling while its tab is hidden. */
export class WeatherMonitor {
  private listeners = new Set<() => void>();
  private state: WeatherState;
  private interval: ReturnType<typeof setInterval> | undefined;
  private controller: AbortController | undefined;
  private generation = 0;
  private lastAttemptAt = -Infinity;
  private readonly load: WeatherLoader;
  private readonly now: () => number;
  private readonly storage: WeatherStorage | undefined;
  private readonly visibility: VisibilitySource | undefined;

  /** Read a validated cache without starting network work during React rendering. */
  constructor(private readonly location: WeatherLocation, options: MonitorOptions = {}) {
    this.load = options.load ?? fetchWeather;
    this.now = options.now ?? Date.now;
    this.storage = options.storage ?? getWeatherStorage();
    this.visibility = options.visibility ?? (typeof document === 'undefined' ? undefined : document);
    const weather = readWeatherCache(this.storage, location, this.now());
    this.state = { weather, status: weather ? 'stale' : 'loading', error: null };
  }

  /** Stable snapshots satisfy useSyncExternalStore and avoid needless scene renders. */
  getSnapshot = (): WeatherState => this.state;

  /** Start once for the first consumer and release every timer/request after the last. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.visibility?.addEventListener('visibilitychange', this.onVisibilityChange);
      this.interval = setInterval(this.refresh, WEATHER_POLL_MS);
      this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      clearInterval(this.interval);
      this.visibility?.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.cancelRequest();
    };
  };

  /** Publish one coherent weather/status/error object to every subscriber. */
  private publish(state: WeatherState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  /** Invalidate an old promise even if a custom fetch implementation ignores abort. */
  private cancelRequest(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
  }

  /** Pause in the background and refresh immediately when stale conditions resume. */
  private onVisibilityChange = (): void => {
    if (this.visibility?.hidden) {
      this.cancelRequest();
      return;
    }
    if (this.state.status !== 'live' || this.now() - this.lastAttemptAt >= WEATHER_POLL_MS) this.refresh();
  };

  /** Coalesce repeated refresh presses while preserving last-good data on failures. */
  refresh = (): void => {
    if (this.controller || this.visibility?.hidden || this.listeners.size === 0) return;
    this.lastAttemptAt = this.now();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    if (!this.state.weather) this.publish({ weather: null, status: 'loading', error: null });
    this.load(this.location, controller.signal).then((weather) => {
      if (generation !== this.generation || controller.signal.aborted) return;
      writeWeatherCache(this.storage, this.location, weather);
      this.publish({ weather, status: weatherStatus(weather, this.now(), null), error: null });
    }).catch((error: unknown) => {
      if (generation !== this.generation || controller.signal.aborted) return;
      const cached = this.state.weather;
      const weather = cached && this.now() - cached.observedAt <= WEATHER_CACHE_MAX_AGE_MS ? cached : null;
      this.publish({
        weather, status: weather ? 'stale' : 'unavailable',
        error: error instanceof Error ? error.message : 'Weather is temporarily unavailable.',
      });
    }).finally(() => {
      if (generation === this.generation) this.controller = undefined;
    });
  };
}
