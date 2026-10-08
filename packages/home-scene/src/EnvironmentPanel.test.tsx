import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentPanel } from './EnvironmentPanel';
import { clearPropertyWeatherConfiguration, receivePropertyWeatherConfiguration, WEATHER_CONFIGURATION_CHANNEL } from './environment/propertyWeatherConfiguration';
import { PROPERTY_LOCATION, type LiveEnvironment } from './environment/types';

vi.mock('./embeddedHost', () => ({ isEmbeddedScene: () => true }));
const now = Date.UTC(2026, 9, 8, 14, 0);
const environment: LiveEnvironment = {
  now, location: { ...PROPERTY_LOCATION, name: 'Seaview property' }, status: 'live', error: null,
  localTime: '9:00 AM', localDate: '2026-10-08', timeZone: 'America/Jamaica',
  clockSource: 'solar-calculation', isNight: false, daylight: 1, sunAltitudeDeg: 42, refresh: vi.fn(),
  weather: { tempC: 28, rainMm: 1.5, precipitationMm: 1.5, snowfallCm: 0, cloudCover: 85,
    windSpeedKmh: 20, windDirectionDeg: 90, weatherCode: 61, observedAt: now - 900_000,
    fetchedAt: now - 120_000, intervalSeconds: 900, timeZone: 'America/Jamaica', daylightDays: [] },
};

beforeEach(() => {
  clearPropertyWeatherConfiguration();
  receivePropertyWeatherConfiguration({ channel: WEATHER_CONFIGURATION_CHANNEL, version: 1,
    location: environment.location, configured: true, canManage: true, status: 'ready' });
});

describe('property weather presentation', () => {
  it('labels estimates, property location, model and retrieval age, and normalized rain rate', () => {
    const markup = renderToStaticMarkup(<EnvironmentPanel environment={environment} />);
    for (const label of ['Seaview property', 'Regional estimate', 'Property location', 'Current estimate',
      'Model time: 15 min ago', 'Retrieved: 2 min ago', 'Rain rate', '6.0', 'mm/h', 'Settings → Weather']) expect(markup).toContain(label);
    expect(markup).not.toContain('Live weather');
    expect(markup).not.toContain('Town fallback');
  });

  it('retains labelled saved readings but announces paused effects', () => {
    const markup = renderToStaticMarkup(<EnvironmentPanel environment={{ ...environment, status: 'stale', error: 'Offline' }} />);
    expect(markup).toContain('Saved estimate');
    expect(markup).toContain('Weather effects paused');
    expect(markup).not.toContain('Current estimate');
  });

  it('ages live data before presentation without turning missing measurements into zeros', () => {
    const markup = renderToStaticMarkup(<EnvironmentPanel environment={{ ...environment, now: now + 7 * 3_600_000 }} />);
    expect(markup).toContain('Weather unavailable');
    expect(markup).toContain('Weather effects paused');
    expect(markup).not.toContain('Rain rate');
    expect(markup).not.toContain('Retrieved:');
  });

  it('does not call an unverified location the property or town fallback', () => {
    receivePropertyWeatherConfiguration({ channel: WEATHER_CONFIGURATION_CHANNEL, version: 1,
      location: null, configured: false, canManage: false, status: 'unavailable' });
    const markup = renderToStaticMarkup(<EnvironmentPanel environment={{ ...environment, weather: null, status: 'unavailable' }} />);
    expect(markup).toContain('Location unverified');
    expect(markup).not.toContain('Town fallback');
    expect(markup).not.toContain('Seaview property');
    expect(markup).toMatch(/aria-label="Refresh weather estimate" disabled=""/);
  });
});
