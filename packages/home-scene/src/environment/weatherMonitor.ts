import { fetchWeather, WEATHER_FRESH_MS, WEATHER_POLL_MS } from './weatherClient';
import { getWeatherStorage, isWeatherWithinCacheAge, readWeatherCache, writeWeatherCache } from './weatherCache';
import type { WeatherStorage } from './weatherCache';
import type { WeatherLocation, WeatherSnapshot, WeatherState, WeatherStatus } from './types';

type VisibilitySource = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
type ConnectivitySource = Pick<Window, 'addEventListener' | 'removeEventListener'>;
type WeatherLoader = (location: WeatherLocation, signal: AbortSignal) => Promise<WeatherSnapshot>;
interface MonitorOptions {
  load?: WeatherLoader;
  now?: () => number;
  storage?: WeatherStorage;
  visibility?: VisibilitySource;
  connectivity?: ConnectivitySource;
  isOnline?: () => boolean;
}

/** "Live" requires a successful, recent model response, not merely a cached object. */
export function weatherStatus(weather: WeatherSnapshot | null, now: number, error: string | null): WeatherStatus {
  if (!weather) return 'unavailable';
  return error || !isWeatherWithinCacheAge(weather, now)
    || now - weather.observedAt > WEATHER_FRESH_MS || now - weather.fetchedAt > WEATHER_FRESH_MS
    ? 'stale' : 'live';
}

/** Age both model and download timestamps even while a request is pending or a tab resumes. */
export function weatherStateAtTime(state: WeatherState, now: number): WeatherState {
  if (state.weather && !isWeatherWithinCacheAge(state.weather, now)) {
    return { weather: null, status: 'unavailable', error: state.error };
  }
  const status = state.status === 'live' ? weatherStatus(state.weather, now, state.error) : state.status;
  return status === state.status ? state : { ...state, status };
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
  private readonly connectivity: ConnectivitySource | undefined;
  private readonly isOnline: () => boolean;

  /** Read a validated cache without starting network work during React rendering. */
  constructor(private readonly location: WeatherLocation, options: MonitorOptions = {}) {
    this.load = options.load ?? fetchWeather;
    this.now = options.now ?? Date.now;
    this.storage = options.storage ?? getWeatherStorage();
    // The optional native renderer also uses this monitor; native globals are not necessarily DOM targets.
    this.visibility = options.visibility ?? (typeof document !== 'undefined'
      && typeof document.addEventListener === 'function' && typeof document.removeEventListener === 'function' ? document : undefined);
    this.connectivity = options.connectivity ?? (typeof window !== 'undefined'
      && typeof window.addEventListener === 'function' && typeof window.removeEventListener === 'function' ? window : undefined);
    this.isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
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
      this.connectivity?.addEventListener('online', this.onConnectionChange);
      this.connectivity?.addEventListener('offline', this.onConnectionChange);
      this.interval = setInterval(this.refresh, WEATHER_POLL_MS);
      this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      clearInterval(this.interval);
      this.visibility?.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.connectivity?.removeEventListener('online', this.onConnectionChange);
      this.connectivity?.removeEventListener('offline', this.onConnectionChange);
      this.cancelRequest();
    };
  };

  /** Publish one coherent weather/status/error object to every subscriber. */
  private publish(state: WeatherState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  /** Invalidate expired conditions immediately instead of waiting for network completion. */
  private updateFreshness(): void {
    const state = weatherStateAtTime(this.state, this.now());
    if (state !== this.state) this.publish(state);
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
    this.updateFreshness();
    if (this.state.status !== 'live' || this.now() - this.lastAttemptAt >= WEATHER_POLL_MS) this.refresh();
  };

  /** A known disconnection stops current effects; reconnect must earn freshness through a response. */
  private onConnectionChange = (): void => {
    if (this.isOnline()) {
      this.refresh();
      return;
    }
    this.cancelRequest();
    const { weather } = weatherStateAtTime(this.state, this.now());
    this.publish({ weather, status: weather ? 'stale' : 'unavailable', error: 'Weather could not be refreshed. Check your connection.' });
  };

  /** Coalesce repeated refresh presses while preserving last-good data on failures. */
  refresh = (): void => {
    if (this.listeners.size === 0 || this.visibility?.hidden) return;
    this.updateFreshness();
    if (!this.isOnline()) {
      this.onConnectionChange();
      return;
    }
    if (this.controller) return;
    this.lastAttemptAt = this.now();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    if (!this.state.weather) this.publish({ weather: null, status: 'loading', error: null });
    this.load(this.location, controller.signal).then((weather) => {
      if (generation !== this.generation || controller.signal.aborted) return;
      writeWeatherCache(this.storage, this.location, weather);
      this.publish(weatherStateAtTime({ weather, status: weatherStatus(weather, this.now(), null), error: null }, this.now()));
    }).catch((error: unknown) => {
      if (generation !== this.generation || controller.signal.aborted) return;
      const cached = this.state.weather;
      const weather = cached && isWeatherWithinCacheAge(cached, this.now()) ? cached : null;
      this.publish({
        weather, status: weather ? 'stale' : 'unavailable',
        error: error instanceof Error ? error.message : 'Weather is temporarily unavailable.',
      });
    }).finally(() => {
      if (generation === this.generation) this.controller = undefined;
    });
  };
}
