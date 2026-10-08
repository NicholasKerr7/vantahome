import { act, renderHook } from '@testing-library/react-native';
import type { WeatherSnapshot } from '../../../../packages/home-scene/src/environment/types';
import { fetchWeather, WEATHER_FRESH_MS, WEATHER_POLL_MS } from '../../../../packages/home-scene/src/environment/weatherClient';
import type { WeatherChoice } from '../protocol';
import { useLabWeather } from '../useLabWeather';

jest.mock('../../../../packages/home-scene/src/environment/weatherClient', () => ({
  ...jest.requireActual('../../../../packages/home-scene/src/environment/weatherClient'),
  fetchWeather: jest.fn(),
}));
const load = jest.mocked(fetchWeather);

/** A validated town snapshot makes lifecycle tests independent of the weather network. */
function stormSnapshot(): WeatherSnapshot {
  return { tempC: 27, precipitationMm: 3, rainMm: 3, snowfallCm: 0, cloudCover: 95,
    windSpeedKmh: 42, windDirectionDeg: 78, weatherCode: 95,
    observedAt: Date.now(), fetchedAt: Date.now(), intervalSeconds: 900,
    timeZone: 'America/Jamaica', daylightDays: [] };
}

beforeEach(() => { jest.useFakeTimers(); load.mockReset(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('manual previews do not fetch weather, while Auto labels current town model estimates', async () => {
  load.mockResolvedValue(stormSnapshot());
  const { result, rerender, unmount } = renderHook(({ choice, active }: { choice: WeatherChoice; active: boolean }) => useLabWeather(choice, active),
    { initialProps: { choice: 'heavy', active: true } });
  expect(result.current.settings.weather).toBe('heavy');
  expect(result.current.status).toBe('preview');
  expect(load).not.toHaveBeenCalled();
  await act(async () => rerender({ choice: 'auto', active: true }));
  expect(result.current.settings).toEqual({ weather: 'storm', windSpeed: 42, windDirection: 78 });
  expect(result.current.status).toBe('live');
  expect(result.current.detail).toContain('Hopewell');
  expect(result.current.detail).toContain('Regional estimate');
  expect(result.current.detail).toContain('Model time:');
  expect(result.current.detail).not.toContain('Live');
  unmount();
});

test('Auto cancels and stops polling off screen, rejects late completions, and resumes on return', async () => {
  let complete: (value: WeatherSnapshot) => void = () => undefined;
  load.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const { result, rerender, unmount } = renderHook(({ active }: { active: boolean }) => useLabWeather('auto', active),
    { initialProps: { active: true } });
  const signal = load.mock.calls[0][1];
  expect(result.current.status).toBe('loading');
  rerender({ active: false });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    complete(stormSnapshot());
    jest.advanceTimersByTime(WEATHER_POLL_MS * 2);
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current.settings.weather).toBe('clear');
  load.mockResolvedValue(stormSnapshot());
  await act(async () => rerender({ active: true }));
  expect(load).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('live');
  unmount();
});

test('failed Auto requests expose unavailable or last-known status without inventing a storm', async () => {
  load.mockRejectedValue(new Error('Weather service is temporarily unavailable.'));
  const { result, unmount } = renderHook(() => useLabWeather('auto', true));
  await act(async () => undefined);
  expect(result.current.status).toBe('unavailable');
  expect(result.current.settings.weather).toBe('clear');
  expect(result.current.detail).toContain('Effects paused');
  load.mockResolvedValue(stormSnapshot());
  await act(async () => jest.advanceTimersByTime(WEATHER_POLL_MS));
  expect(result.current.status).toBe('live');
  load.mockRejectedValue(new Error('Weather request timed out.'));
  await act(async () => jest.advanceTimersByTime(WEATHER_POLL_MS));
  expect(result.current.status).toBe('stale');
  expect(result.current.settings).toEqual({ weather: 'clear', windSpeed: 0, windDirection: 0 });
  expect(result.current.detail).toContain('Saved estimate');
  expect(result.current.detail).toContain('Effects paused');
  unmount();
});


test('returning after a long pause labels old data stale while the refresh is pending', async () => {
  load.mockResolvedValue(stormSnapshot());
  const { result, rerender, unmount } = renderHook(({ active }: { active: boolean }) => useLabWeather('auto', active),
    { initialProps: { active: true } });
  await act(async () => undefined);
  expect(result.current.status).toBe('live');
  rerender({ active: false });
  act(() => jest.advanceTimersByTime(60 * 60_000));
  load.mockImplementation(() => new Promise(() => undefined));
  rerender({ active: true });
  expect(result.current.status).toBe('stale');
  expect(result.current.detail).toContain('Saved estimate');
  expect(result.current.settings).toEqual({ weather: 'clear', windSpeed: 0, windDirection: 0 });
  unmount();
});

test('ages active Auto conditions out even while a refresh remains unresolved', async () => {
  load.mockResolvedValueOnce(stormSnapshot()).mockImplementation(() => new Promise(() => undefined));
  const { result, unmount } = renderHook(() => useLabWeather('auto', true));
  await act(async () => undefined);
  expect(result.current.settings.weather).toBe('storm');
  await act(async () => jest.advanceTimersByTime(WEATHER_FRESH_MS + 60_000));
  expect(result.current.status).toBe('stale');
  expect(result.current.settings).toEqual({ weather: 'clear', windSpeed: 0, windDirection: 0 });
  expect(result.current.detail).toContain('Saved estimate');
  expect(result.current.detail).toContain('Effects paused');
  expect(load).toHaveBeenCalledTimes(2);
  const signal = load.mock.calls[1][1];
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => jest.advanceTimersByTime(WEATHER_POLL_MS * 2));
  expect(load).toHaveBeenCalledTimes(2);
});


test('expires very old observations immediately on resume even before the request completes', async () => {
  load.mockResolvedValue(stormSnapshot());
  const { result, rerender, unmount } = renderHook(({ active }: { active: boolean }) => useLabWeather('auto', active),
    { initialProps: { active: true } });
  await act(async () => undefined);
  expect(result.current.settings.weather).toBe('storm');
  rerender({ active: false });
  act(() => jest.advanceTimersByTime(7 * 60 * 60_000));
  load.mockImplementation(() => new Promise(() => undefined));
  rerender({ active: true });
  expect(result.current.status).toBe('loading');
  expect(result.current.settings).toEqual({ weather: 'clear', windSpeed: 0, windDirection: 0 });
  expect(result.current.detail).toContain('Effects paused');
  unmount();
});
