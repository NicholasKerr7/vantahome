import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardHeader, DashboardRoomBar } from './DashboardChrome';
import type { WeatherSnapshot } from './environment/types';

const environment = { localTime: '10:42 AM', weather: null, status: 'unavailable' as const };
const weather: WeatherSnapshot = { tempC: 29.2, precipitationMm: 2, rainMm: 2, snowfallCm: 0, cloudCover: 92,
  windSpeedKmh: 14, windDirectionDeg: 240, weatherCode: 95, observedAt: 0, fetchedAt: 0,
  intervalSeconds: 900, timeZone: 'America/Jamaica', daylightDays: [] };

describe('home workspace chrome', () => {
  it('keeps one embedded time entry point without duplicate lighting shortcuts', () => {
    const markup = renderToStaticMarkup(<DashboardHeader embedded environment={environment} onSettings={() => undefined} />);
    expect(markup).not.toContain('dashboard-brand');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('dashboard-address');
    expect(markup.match(/aria-label="Property time and weather:/g)).toHaveLength(1);
    expect(markup).toContain('Hopewell');
    expect(markup).toContain('10:42 AM');
    expect(markup).toContain('Property time and weather: Weather unavailable');
    expect(markup).not.toContain('°');
    expect(markup).toContain('Home settings and help');
    expect(markup).not.toContain('light-mode-switch');
  });

  it('shows regional estimates without presenting cached conditions as live', () => {
    const live = renderToStaticMarkup(<DashboardHeader embedded environment={{ ...environment, weather, status: 'live' }} onSettings={() => undefined} />);
    expect(live).toContain('29°');
    expect(live).toContain('Thunderstorm');
    expect(live).toContain('Current regional estimate');
    expect(live.match(/aria-label="Property time and weather:/g)).toHaveLength(1);
    const stale = renderToStaticMarkup(<DashboardHeader embedded environment={{ ...environment, weather, status: 'stale' }} onSettings={() => undefined} />);
    expect(stale).toContain('Saved regional estimate');
    expect(stale).not.toContain('Current regional estimate');
    expect(stale.match(/aria-label="Property time and weather:/g)).toHaveLength(1);
  });

  it('retains standalone identity and accessible room/floor navigation', () => {
    const header = renderToStaticMarkup(<DashboardHeader environment={environment} onSettings={() => undefined} />);
    expect(header).toContain('VantaHome house preview');
    expect(header).toContain('class="dashboard-brand-mark"><img');
    expect(header).toContain('alt="" aria-hidden="true"');
    expect(header).toContain('dashboard-address');
    expect(header).toContain('<time>10:42 AM</time>');
    expect(header).not.toContain('light-mode-switch');
    expect(header.match(/aria-label="Property time and weather:/g)).toHaveLength(1);
    const markup = renderToStaticMarkup(<DashboardRoomBar onRooms={() => undefined} />);
    expect(markup).toContain('cinematic-artwork--thumbnail');
    for (const control of ['Choose a room', 'Choose floor', 'Ground', 'Upper']) expect(markup).toContain(control);
  });
});
