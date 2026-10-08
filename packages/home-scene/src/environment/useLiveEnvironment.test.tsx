// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveEnvironment } from './useLiveEnvironment';
import { fetchWeather } from './weatherClient';
import { PROPERTY_LOCATION, type WeatherLocation, type WeatherSnapshot } from './types';
import { weatherPresentation } from './weatherPresentation';

vi.mock('./weatherClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./weatherClient')>(), fetchWeather: vi.fn(),
}));

const NOW = Date.parse('2026-10-08T12:00:00Z');
let root: Root;
let container: HTMLElement;

/** Observe the hook's public output and retry action without scene, network or host bridge dependencies. */
function EnvironmentProbe({ location, enabled }: { location: WeatherLocation; enabled: boolean }) {
  const environment = useLiveEnvironment(location, enabled);
  const presentation = weatherPresentation(environment, environment.now);
  return <section><output data-now={environment.now}>{environment.status}:{environment.weather?.tempC ?? 'none'}:{environment.location.name}</output>
    <p>{presentation.modelAgeLabel};{presentation.fetchedAgeLabel}</p>
    <button onClick={environment.refresh}>Refresh</button></section>;
}

/** A complete regional estimate is independent of the currently selected household identity. */
function weatherFixture(tempC: number): WeatherSnapshot {
  return { tempC, precipitationMm: 1, rainMm: 1, snowfallCm: 0, cloudCover: 90,
    windSpeedKmh: 20, windDirectionDeg: 45, weatherCode: 61, observedAt: NOW, fetchedAt: NOW,
    intervalSeconds: 900, timeZone: 'America/Jamaica', daylightDays: [] };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(fetchWeather).mockReset();
  localStorage.clear();
  container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('trusted weather location readiness', () => {
  it('uses the render clock for a response arriving forty seconds after the minute tick', async () => {
    let resolvePending: (weather: WeatherSnapshot) => void = () => {};
    vi.mocked(fetchWeather).mockImplementation(() => new Promise<WeatherSnapshot>((resolve) => { resolvePending = resolve; }));
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled />));
    await act(async () => vi.advanceTimersByTime(40_000));
    const weather = { ...weatherFixture(27), observedAt: NOW - 30 * 60_000 - 20_000, fetchedAt: Date.now() };
    await act(async () => resolvePending(weather));
    expect(Number(container.querySelector('output')!.dataset.now)).toBeGreaterThanOrEqual(weather.fetchedAt);
    expect(container.querySelector('p')!.textContent).toBe('Model time: 31 min ago;Retrieved: <1 min ago');
  });

  it('still exposes a provider model timestamp that is genuinely ahead of the real clock', async () => {
    const weather = { ...weatherFixture(27), observedAt: NOW + 2 * 60_000 };
    vi.mocked(fetchWeather).mockResolvedValue(weather);
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled />));
    expect(container.querySelector('p')!.textContent).toBe('Model time: 2 min ahead;Retrieved: <1 min ago');
  });

  it('does not subscribe or fetch before host configuration is ready, including manual refresh', async () => {
    vi.mocked(fetchWeather).mockResolvedValue(weatherFixture(27));
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled={false} />));
    act(() => container.querySelector('button')!.click());
    expect(fetchWeather).not.toHaveBeenCalled();
    expect(container.querySelector('output')!.textContent).toBe('loading:none:Hopewell, Jamaica');
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled />));
    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(container.querySelector('output')!.textContent).toBe('live:27:Hopewell, Jamaica');
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled={false} />));
    expect(container.querySelector('output')!.textContent).toBe('loading:none:Hopewell, Jamaica');
  });

  it('aborts the previous location request and never publishes its late response into the next location', async () => {
    let resolveFirst: (weather: WeatherSnapshot) => void = () => {};
    vi.mocked(fetchWeather).mockImplementationOnce(() => new Promise<WeatherSnapshot>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue(weatherFixture(29));
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled />));
    const firstSignal = vi.mocked(fetchWeather).mock.calls[0][1];
    const nextLocation = { ...PROPERTY_LOCATION, name: 'Confirmed property', longitude: -78.01 };
    await act(async () => root.render(<EnvironmentProbe location={nextLocation} enabled />));
    expect(firstSignal.aborted).toBe(true);
    expect(container.querySelector('output')!.textContent).toBe('live:29:Confirmed property');
    await act(async () => resolveFirst(weatherFixture(22)));
    expect(container.querySelector('output')!.textContent).toBe('live:29:Confirmed property');
  });

  it('cancels active work when host configuration becomes unavailable and ignores its late result', async () => {
    let resolvePending: (weather: WeatherSnapshot) => void = () => {};
    vi.mocked(fetchWeather).mockImplementation(() => new Promise<WeatherSnapshot>((resolve) => { resolvePending = resolve; }));
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled />));
    const signal = vi.mocked(fetchWeather).mock.calls[0][1];
    await act(async () => root.render(<EnvironmentProbe location={PROPERTY_LOCATION} enabled={false} />));
    expect(signal.aborted).toBe(true);
    await act(async () => resolvePending(weatherFixture(27)));
    expect(container.querySelector('output')!.textContent).toBe('loading:none:Hopewell, Jamaica');
  });
});
