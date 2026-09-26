import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveSolarClock, localDateKey, solarAltitude } from './solarClock';
import { PROPERTY_LOCATION } from './types';
import type { WeatherSnapshot } from './types';
import { buildWeatherUrl, fetchWeather, parseWeatherResponse, WEATHER_POLL_MS, WEATHER_REQUEST_TIMEOUT_MS, weatherDescription } from './weatherClient';
import { readWeatherCache, weatherCacheKey, writeWeatherCache } from './weatherCache';
import { WeatherMonitor, weatherStatus } from './weatherMonitor';
import { subscribeMinuteClock } from './useLiveEnvironment';

const NOW = Date.parse('2026-09-26T17:00:00Z');

/** Representative API data uses UTC seconds and the property's local daily midnight. */
function responseFixture() {
  return {
    timezone: 'America/Jamaica',
    current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°C', precipitation: 'mm',
      rain: 'mm', showers: 'mm', snowfall: 'cm', cloud_cover: '%', wind_speed_10m: 'km/h', wind_direction_10m: '°' },
    current: { time: NOW / 1000, interval: 900, temperature_2m: 29.2, precipitation: 0.8, rain: 0.5,
      showers: 0.3, snowfall: 0, cloud_cover: 82, wind_speed_10m: 14, wind_direction_10m: 240, weather_code: 61 },
    daily: {
      time: [Date.parse('2026-09-26T05:00:00Z') / 1000, Date.parse('2026-09-27T05:00:00Z') / 1000],
      sunrise: [Date.parse('2026-09-26T11:00:00Z') / 1000, Date.parse('2026-09-27T11:00:00Z') / 1000],
      sunset: [Date.parse('2026-09-26T23:00:00Z') / 1000, Date.parse('2026-09-27T23:00:00Z') / 1000],
    },
  };
}

/** Fresh normalized weather keeps tests at the same public data boundary as production. */
function weatherFixture(): WeatherSnapshot {
  return parseWeatherResponse(responseFixture(), NOW);
}

/** Storage and document doubles expose observable behavior without React internals. */
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

class TestVisibility extends EventTarget {
  hidden = false;
  /** Emulate the real visibility event for pause/resume lifecycle checks. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('weather API boundary', () => {
  it('sends only town coordinates with explicit metric units and UTC timestamps', () => {
    const url = new URL(buildWeatherUrl(PROPERTY_LOCATION));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('18.4538');
    expect(url.searchParams.get('timezone')).toBe('America/Jamaica');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(url.searchParams.has('name')).toBe(false);
    expect(url.searchParams.has('apikey')).toBe(false);
  });

  it('normalizes rainfall and timestamps without applying the local offset twice', () => {
    const weather = weatherFixture();
    expect(weather.rainMm).toBeCloseTo(0.8);
    expect(weather.observedAt).toBe(NOW);
    expect(weather.daylightDays[0]).toEqual({ date: '2026-09-26', sunrise: Date.parse('2026-09-26T11:00:00Z'), sunset: Date.parse('2026-09-26T23:00:00Z') });
  });

  it.each([
    ['null rain', 'rain', null], ['missing temperature', 'temperature_2m', undefined],
    ['negative precipitation', 'precipitation', -1], ['cloud cover above 100', 'cloud_cover', 140],
    ['non-finite wind', 'wind_speed_10m', Infinity], ['invalid direction', 'wind_direction_10m', 361],
    ['unknown WMO code', 'weather_code', 42], ['future observation', 'time', NOW / 1000 + 7200],
  ])('rejects %s', (_name, key, value) => {
    const fixture = responseFixture();
    Object.assign(fixture.current, { [key]: value });
    expect(() => parseWeatherResponse(fixture, NOW)).toThrow();
  });

  it('rejects unexpected units and invalid time zones', () => {
    const fixture = responseFixture();
    fixture.current_units.wind_speed_10m = 'mph';
    expect(() => parseWeatherResponse(fixture, NOW)).toThrow('unexpected units');
    fixture.current_units.wind_speed_10m = 'km/h';
    fixture.timezone = 'Mars/Olympus';
    expect(() => parseWeatherResponse(fixture, NOW)).toThrow('time zone');
  });

  it('allows absent polar sunrise values while rejecting broken daily arrays', () => {
    const fixture = responseFixture();
    Object.assign(fixture.daily, { sunrise: [null, null], sunset: [null, null] });
    expect(parseWeatherResponse(fixture, NOW).daylightDays[0].sunrise).toBeNull();
    fixture.daily.time.pop();
    expect(() => parseWeatherResponse(fixture, NOW)).toThrow('Sunrise');
  });

  it('handles HTTP failures without presenting a response as live', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unavailable', { status: 503 }));
    await expect(fetchWeather(PROPERTY_LOCATION, new AbortController().signal, fetcher, () => NOW)).rejects.toThrow('temporarily unavailable');
  });

  it('cancels network requests when the consumer aborts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const controller = new AbortController();
    const request = fetchWeather(PROPERTY_LOCATION, controller.signal, fetcher);
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
  });

  it('bounds an unresponsive weather request to twelve seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const request = fetchWeather(PROPERTY_LOCATION, new AbortController().signal, fetcher);
    const assertion = expect(request).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(WEATHER_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('describes rain, snow and storms without inferring rain from cloud cover', () => {
    expect(weatherDescription(3)).toBe('Overcast');
    expect(weatherDescription(61)).toBe('Rain');
    expect(weatherDescription(85)).toBe('Snow showers');
    expect(weatherDescription(95)).toBe('Thunderstorm');
    expect(weatherDescription(97)).toBe('Conditions unavailable');
  });
});

describe('property solar clock', () => {
  it('switches at the exact sunrise and sunset, even in another browser time zone', () => {
    const weather = weatherFixture();
    const sunrise = weather.daylightDays[0].sunrise!;
    const sunset = weather.daylightDays[0].sunset!;
    expect(deriveSolarClock(sunrise - 1, PROPERTY_LOCATION, weather).isNight).toBe(true);
    expect(deriveSolarClock(sunrise, PROPERTY_LOCATION, weather).isNight).toBe(false);
    expect(deriveSolarClock(sunset - 1, PROPERTY_LOCATION, weather).isNight).toBe(false);
    expect(deriveSolarClock(sunset, PROPERTY_LOCATION, weather).isNight).toBe(true);
  });

  it('formats the property day instead of the UTC or viewer day', () => {
    const midnightUtc = Date.parse('2026-09-27T00:10:00Z');
    expect(localDateKey(midnightUtc, PROPERTY_LOCATION.timeZone)).toBe('2026-09-26');
    const clock = deriveSolarClock(midnightUtc, PROPERTY_LOCATION, weatherFixture());
    expect(clock.localTime).toBe('7:10 PM');
    expect(clock.clockSource).toBe('sunrise-sunset');
    expect(clock.isNight).toBe(true);
  });

  it('handles IANA daylight-saving transitions without fixed UTC offsets', () => {
    expect(localDateKey(Date.parse('2026-11-01T03:30:00Z'), 'America/New_York')).toBe('2026-10-31');
    expect(localDateKey(Date.parse('2026-11-01T06:30:00Z'), 'America/New_York')).toBe('2026-11-01');
  });

  it('continues calculating real sun position when offline schedules expire', () => {
    const clock = deriveSolarClock(Date.parse('2026-10-10T17:00:00Z'), PROPERTY_LOCATION, weatherFixture());
    expect(clock.clockSource).toBe('solar-calculation');
    expect(clock.isNight).toBe(false);
    expect(clock.daylight).toBe(1);
    expect(deriveSolarClock(Date.parse('2026-10-10T05:00:00Z'), PROPERTY_LOCATION, null).isNight).toBe(true);
  });

  it('matches basic solar geometry at the equinox and through a leap year', () => {
    expect(solarAltitude(Date.parse('2026-03-20T12:00:00Z'), 0, 0)).toBeGreaterThan(87);
    expect(solarAltitude(Date.parse('2026-03-20T00:00:00Z'), 0, 0)).toBeLessThan(-87);
    expect(Number.isFinite(solarAltitude(Date.parse('2028-02-29T12:00:00Z'), 18.4538, -78.01534))).toBe(true);
  });

  it('handles polar night and midnight sun without fabricated sunrise hours', () => {
    const polar = { name: 'Longyearbyen', latitude: 78.22, longitude: 15.63, timeZone: 'Arctic/Longyearbyen' };
    expect(deriveSolarClock(Date.parse('2026-12-21T11:00:00Z'), polar, null).isNight).toBe(true);
    expect(deriveSolarClock(Date.parse('2026-06-21T23:00:00Z'), polar, null).isNight).toBe(false);
  });

  it('provides a smooth bounded twilight amount before sunrise', () => {
    const clock = deriveSolarClock(Date.parse('2026-09-26T10:50:00Z'), PROPERTY_LOCATION, null);
    expect(clock.daylight).toBeGreaterThan(0);
    expect(clock.daylight).toBeLessThan(1);
  });
});

describe('weather cache and polling lifecycle', () => {
  it('rejects corrupt, expired and wrong-location caches', () => {
    const storage = memoryStorage();
    const key = weatherCacheKey(PROPERTY_LOCATION);
    storage.setItem(key, '{broken');
    expect(readWeatherCache(storage, PROPERTY_LOCATION, NOW)).toBeNull();
    writeWeatherCache(storage, PROPERTY_LOCATION, weatherFixture());
    expect(readWeatherCache(storage, PROPERTY_LOCATION, NOW)?.tempC).toBe(29.2);
    expect(readWeatherCache(storage, PROPERTY_LOCATION, NOW + 7 * 3_600_000)).toBeNull();
    expect(readWeatherCache(storage, { ...PROPERTY_LOCATION, longitude: -77 }, NOW)).toBeNull();
    storage.setItem(key, JSON.stringify({ ...weatherFixture(), weatherCode: 42 }));
    expect(readWeatherCache(storage, PROPERTY_LOCATION, NOW)).toBeNull();
  });

  it('survives browser storage restrictions', () => {
    const storage = { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } };
    expect(readWeatherCache(storage, PROPERTY_LOCATION, NOW)).toBeNull();
    expect(() => writeWeatherCache(storage, PROPERTY_LOCATION, weatherFixture())).not.toThrow();
  });

  it('never calls stale observations live after a successful fetch', () => {
    const weather = weatherFixture();
    expect(weatherStatus(weather, NOW, null)).toBe('live');
    expect(weatherStatus(weather, NOW + 46 * 60_000, null)).toBe('stale');
    expect(weatherStatus(weather, NOW, 'Offline')).toBe('stale');
    expect(weatherStatus(weather, NOW - 2 * 3_600_000, null)).toBe('stale');
    expect(weatherStatus(null, NOW, 'Offline')).toBe('unavailable');
  });

  it('polls every fifteen minutes and coalesces rapid manual refreshes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const load = vi.fn().mockResolvedValue(weatherFixture());
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, storage: memoryStorage() });
    const unsubscribe = monitor.subscribe(() => {});
    monitor.refresh(); monitor.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().status).toBe('live');
    await vi.advanceTimersByTimeAsync(WEATHER_POLL_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(WEATHER_POLL_MS * 2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('preserves last-good conditions as stale on failure, then expires them', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const load = vi.fn().mockResolvedValueOnce(weatherFixture()).mockRejectedValue(new Error('Offline'));
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, storage: memoryStorage() });
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(WEATHER_POLL_MS);
    expect(monitor.getSnapshot()).toMatchObject({ status: 'stale', error: 'Offline', weather: { rainMm: 0.8 } });
    await vi.advanceTimersByTimeAsync(7 * 3_600_000);
    expect(monitor.getSnapshot()).toMatchObject({ status: 'unavailable', weather: null });
    unsubscribe();
  });

  it('shows a cache as stale until a fresh request succeeds', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const storage = memoryStorage();
    writeWeatherCache(storage, PROPERTY_LOCATION, weatherFixture());
    const load = vi.fn().mockResolvedValue(weatherFixture());
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, storage });
    expect(monitor.getSnapshot().status).toBe('stale');
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().status).toBe('live');
    unsubscribe();
  });

  it('pauses hidden polls, refreshes on return and aborts on unsubscribe', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const visibility = new TestVisibility();
    const load = vi.fn().mockResolvedValue(weatherFixture());
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, storage: memoryStorage(), visibility });
    const unsubscribe = monitor.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(WEATHER_POLL_MS * 3);
    expect(load).toHaveBeenCalledTimes(1);
    visibility.setHidden(false);
    expect(load).toHaveBeenCalledTimes(2);
    const signal: AbortSignal = load.mock.calls[1][1];
    unsubscribe();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().weather?.fetchedAt).toBe(NOW);
  });

  it('does not publish a cancelled response after a replacement request', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const visibility = new TestVisibility();
    let resolveFirst: (weather: WeatherSnapshot) => void = () => {};
    const load = vi.fn().mockImplementationOnce(() => new Promise<WeatherSnapshot>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ ...weatherFixture(), tempC: 30 });
    const monitor = new WeatherMonitor(PROPERTY_LOCATION, { load, storage: memoryStorage(), visibility });
    const unsubscribe = monitor.subscribe(() => {});
    visibility.setHidden(true); visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    resolveFirst(weatherFixture());
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.getSnapshot().weather?.tempC).toBe(30);
    unsubscribe();
  });
});

describe('real minute scheduling', () => {
  it('ticks at the next minute, sleeps while hidden and catches up on resume', async () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-09-26T17:29:48Z'));
    const visibility = new TestVisibility(); vi.stubGlobal('document', visibility);
    const listener = vi.fn();
    const stop = subscribeMinuteClock(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(listener).toHaveBeenLastCalledWith(Date.parse('2026-09-26T17:30:00Z'));
    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(listener).toHaveBeenCalledTimes(2);
    visibility.setHidden(false);
    expect(listener).toHaveBeenLastCalledWith(Date.parse('2026-09-26T17:33:00Z'));
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
