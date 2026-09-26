import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasNativeWeatherTransport, requestNativeWeather } from './nativeWeatherTransport';
import { fetchWeather } from './weatherClient';
import { PROPERTY_LOCATION } from './types';

/** Emulate only the native bridge's documented browser event surface. */
function nativeWindow() {
  const target = new EventTarget();
  const postMessage = vi.fn<(message: string) => void>();
  const bridge = Object.assign(target, { ReactNativeWebView: { postMessage } });
  vi.stubGlobal('window', bridge);
  return {
    postMessage,
    /** Deliver the same CustomEvent detail produced by the host's injected response script. */
    respond(detail: unknown) {
      const event = new Event('vantahome-native-weather-v1');
      Object.defineProperty(event, 'detail', { value: detail });
      target.dispatchEvent(event);
    },
    /** Inspect the emitted message without hard-coding the monotonically increasing request ID. */
    request() { return JSON.parse(postMessage.mock.calls[0][0]) as { requestId: number }; },
  };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('native scene weather transport', () => {
  it('uses the host only when a native bridge exists', () => {
    expect(hasNativeWeatherTransport()).toBe(false);
    nativeWindow();
    expect(hasNativeWeatherTransport()).toBe(true);
  });

  it('sends no URL or coordinates and ignores responses for other IDs', async () => {
    const host = nativeWindow();
    const pending = requestNativeWeather(new AbortController().signal);
    const request = host.request();
    expect(request).toEqual({ channel: 'vantahome-weather', version: 1, type: 'current', requestId: expect.any(Number) });
    host.respond({ channel: 'vantahome-weather', version: 1, requestId: request.requestId + 1, status: 'ok', body: { bad: true } });
    host.respond({ channel: 'vantahome-weather', version: 1, requestId: request.requestId, status: 'ok', body: { current: {} } });
    await expect(pending).resolves.toEqual({ current: {} });
  });

  it('sends cancellation and removes the pending request on abort', async () => {
    const host = nativeWindow();
    const controller = new AbortController();
    const pending = requestNativeWeather(controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(JSON.parse(host.postMessage.mock.calls[1][0])).toEqual({ channel: 'vantahome-weather', version: 1, type: 'cancel', requestId: host.request().requestId });
    host.respond({ channel: 'vantahome-weather', version: 1, requestId: host.request().requestId, status: 'ok', body: {} });
  });

  it('times out if the host does not return a valid response', async () => {
    vi.useFakeTimers();
    const host = nativeWindow();
    const pending = requestNativeWeather(new AbortController().signal);
    const assertion = expect(pending).rejects.toThrow('timed out');
    host.respond({ channel: 'vantahome-weather', version: 1, requestId: host.request().requestId, status: 'ok', body: {}, extra: true });
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
    expect(host.postMessage).toHaveBeenCalledTimes(2);
  });

  it('applies the existing weather schema to broker responses', async () => {
    const host = nativeWindow();
    const browserFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', browserFetch);
    const pending = fetchWeather(PROPERTY_LOCATION, new AbortController().signal);
    host.respond({ channel: 'vantahome-weather', version: 1, requestId: host.request().requestId, status: 'ok', body: { current: { temperature_2m: 'invalid' } } });
    await expect(pending).rejects.toThrow('invalid format');
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it('normalizes a valid native response through the same weather data path', async () => {
    const host = nativeWindow();
    const now = Date.parse('2026-09-26T17:00:00Z');
    const pending = fetchWeather(PROPERTY_LOCATION, new AbortController().signal, undefined, () => now);
    const body = {
      timezone: 'America/Jamaica',
      current_units: { time: 'unixtime', temperature_2m: '°C', precipitation: 'mm', rain: 'mm',
        showers: 'mm', snowfall: 'cm', cloud_cover: '%', wind_speed_10m: 'km/h', wind_direction_10m: '°' },
      current: { time: now / 1000, interval: 900, temperature_2m: 29, precipitation: 0.7, rain: 0.5,
        showers: 0.2, snowfall: 0, cloud_cover: 70, wind_speed_10m: 12, wind_direction_10m: 220, weather_code: 61 },
      daily: { time: [now / 1000], sunrise: [now / 1000 - 6 * 3600], sunset: [now / 1000 + 6 * 3600] },
    };
    host.respond({ channel: 'vantahome-weather', version: 1, requestId: host.request().requestId, status: 'ok', body });
    await expect(pending).resolves.toMatchObject({ tempC: 29, rainMm: 0.7, windSpeedKmh: 12, timeZone: 'America/Jamaica' });
  });

  it('does not silently request a different location through the fixed property broker', async () => {
    const host = nativeWindow();
    await expect(fetchWeather({ ...PROPERTY_LOCATION, latitude: 0 }, new AbortController().signal)).rejects.toThrow('does not match');
    expect(host.postMessage).not.toHaveBeenCalled();
  });

  it('preserves explicitly injected fetchers even when a bridge is present', async () => {
    const host = nativeWindow();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unavailable', { status: 503 }));
    await expect(fetchWeather(PROPERTY_LOCATION, new AbortController().signal, fetcher)).rejects.toThrow('temporarily unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.postMessage).not.toHaveBeenCalled();
  });
});
