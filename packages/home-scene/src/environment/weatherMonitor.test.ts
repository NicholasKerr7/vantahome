import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROPERTY_LOCATION, type WeatherSnapshot } from './types';
import { WEATHER_CACHE_MAX_AGE_MS, WEATHER_FRESH_MS } from './weatherClient';
import { WeatherMonitor } from './weatherMonitor';
import { currentWeather } from './weatherPresentation';

const NOW = Date.parse('2026-10-08T12:00:00Z');

/** Complete values let lifecycle tests focus on freshness rather than network parsing. */
function weatherFixture(time = NOW): WeatherSnapshot {
  return { tempC: 27, precipitationMm: 1, rainMm: 1, snowfallCm: 0, cloudCover: 90,
    windSpeedKmh: 20, windDirectionDeg: 45, weatherCode: 61, observedAt: time, fetchedAt: time,
    intervalSeconds: 900, timeZone: 'America/Jamaica', daylightDays: [] };
}

/** Isolate saved conditions so unrelated browser caches cannot influence lifecycle expectations. */
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

class TestVisibility extends EventTarget {
  hidden = false;
  /** Deliver the same lifecycle signal as a browser background/foreground transition. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

class TestConnection extends EventTarget {
  online = true;
  /** Expose explicit connectivity changes without relying on the execution machine's network. */
  setOnline(online: boolean): void {
    this.online = online;
    this.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('weather freshness during connectivity and lifecycle changes', () => {
  it('works in a native renderer with window/document globals that are not DOM event targets', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    vi.stubGlobal('window', {}); vi.stubGlobal('document', {});
    const load = vi.fn().mockResolvedValue(weatherFixture());
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, storage: memoryStorage() });
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().status).toBe('live');
    expect(unsubscribe).not.toThrow();
  });

  it('ages saved data immediately on foregrounding before a replacement request resolves', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const visibility = new TestVisibility();
    const load = vi.fn().mockResolvedValueOnce(weatherFixture()).mockImplementation(() => new Promise(() => {}));
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, visibility, storage: memoryStorage() });
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(WEATHER_FRESH_MS + 1);
    visibility.setHidden(false);
    expect(monitor.getSnapshot().status).toBe('stale');
    expect(currentWeather(monitor.getSnapshot(), Date.now())).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('drops six-hour-old display data on resume even when refreshing never completes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const visibility = new TestVisibility();
    const load = vi.fn().mockResolvedValueOnce(weatherFixture()).mockImplementation(() => new Promise(() => {}));
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, visibility, storage: memoryStorage() });
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(WEATHER_CACHE_MAX_AGE_MS + 1);
    visibility.setHidden(false);
    expect(monitor.getSnapshot()).toMatchObject({ weather: null, status: 'loading' });
    unsubscribe();
  });

  it('stops current effects immediately when offline and ignores a late cancelled response', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const connection = new TestConnection();
    let resolveOld: (weather: WeatherSnapshot) => void = () => {};
    const load = vi.fn().mockResolvedValueOnce(weatherFixture())
      .mockImplementationOnce(() => new Promise<WeatherSnapshot>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue(weatherFixture(NOW + 60_000));
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, {
      load, storage: memoryStorage(), connectivity: connection, isOnline: () => connection.online,
    });
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    monitor.refresh();
    const oldSignal: AbortSignal = load.mock.calls[1][1];
    connection.setOnline(false);
    expect(oldSignal.aborted).toBe(true);
    expect(monitor.getSnapshot()).toMatchObject({ status: 'stale', weather: { rainMm: 1 } });
    expect(currentWeather(monitor.getSnapshot(), Date.now())).toBeNull();
    resolveOld({ ...weatherFixture(), tempC: 99 });
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().weather?.tempC).toBe(27);
    connection.setOnline(true);
    expect(monitor.getSnapshot().status).toBe('stale');
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().status).toBe('live');
    unsubscribe();
    connection.setOnline(false); connection.setOnline(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('starts unavailable while offline without inventing conditions or sending a request', () => {
    const connection = new TestConnection();
    connection.online = false;
    const load = vi.fn();
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, {
      load, now: () => NOW, storage: memoryStorage(), connectivity: connection, isOnline: () => connection.online,
    });
    const unsubscribe = monitor.subscribe(() => {});
    expect(load).not.toHaveBeenCalled();
    expect(monitor.getSnapshot()).toMatchObject({ weather: null, status: 'unavailable' });
    unsubscribe();
  });
});
