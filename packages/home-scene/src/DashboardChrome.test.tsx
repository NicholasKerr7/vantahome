import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardHeader, DashboardRoomBar } from './DashboardChrome';
import type { WeatherSnapshot } from './environment/types';

const environment = { localTime: '10:42 AM', weather: null, status: 'unavailable' as const };
const weather: WeatherSnapshot = { tempC: 29.2, precipitationMm: 2, rainMm: 2, snowfallCm: 0, cloudCover: 92,
  windSpeedKmh: 14, windDirectionDeg: 240, weatherCode: 95, observedAt: 0, fetchedAt: 0,
  intervalSeconds: 900, timeZone: 'America/Jamaica', daylightDays: [] };

describe('home workspace chrome', () => {
  it('removes duplicate embedded identity while retaining time, lighting and environment access', () => {
    const markup = renderToStaticMarkup(<DashboardHeader embedded environment={environment} onSettings={() => undefined} />);
    expect(markup).not.toContain('dashboard-brand');
    expect(markup).toContain('HOPEWELL');
    expect(markup).toContain('10:42 AM');
    expect(markup).toContain('Property time and weather: Weather unavailable');
    expect(markup).not.toContain('°');
    for (const control of ['Automatic local daylight', 'Daylight preview', 'Night lighting preview', 'Home settings and help']) expect(markup).toContain(control);
  });

  it('shows measured weather without presenting cached conditions as live', () => {
    const live = renderToStaticMarkup(<DashboardHeader embedded environment={{ ...environment, weather, status: 'live' }} onSettings={() => undefined} />);
    expect(live).toContain('29°');
    expect(live).toContain('Thunderstorm');
    expect(live).toContain('Live weather');
    const stale = renderToStaticMarkup(<DashboardHeader embedded environment={{ ...environment, weather, status: 'stale' }} onSettings={() => undefined} />);
    expect(stale).toContain('Last available weather');
    expect(stale).not.toContain('Live weather');
  });

  it('retains standalone identity and accessible room/floor navigation', () => {
    expect(renderToStaticMarkup(<DashboardHeader environment={environment} onSettings={() => undefined} />)).toContain('VantaHome house preview');
    const markup = renderToStaticMarkup(<DashboardRoomBar onRooms={() => undefined} />);
    for (const control of ['Choose a room', 'Choose floor', 'Ground', 'Upper']) expect(markup).toContain(control);
  });
});
