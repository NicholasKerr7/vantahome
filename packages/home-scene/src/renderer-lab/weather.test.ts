import { describe, expect, it } from 'vitest';
import { classifyWeather, isWeatherSettings, WEATHER_PRESETS } from './weather';

const observed = { weatherCode: 0, rainMm: 0, intervalSeconds: 900, windSpeedKmh: 12, windDirectionDeg: 270 };

describe('shared storm conditions', () => {
  it('keeps presets and every renderer payload bounded', () => {
    for (const value of Object.values(WEATHER_PRESETS)) expect(isWeatherSettings(value)).toBe(true);
    for (const value of [null, [], {}, { ...WEATHER_PRESETS.clear, weather: 'snow' },
      { ...WEATHER_PRESETS.light, windSpeed: Infinity }, { ...WEATHER_PRESETS.heavy, windSpeed: -1 },
      { ...WEATHER_PRESETS.heavy, windSpeed: 181 }, { ...WEATHER_PRESETS.storm, windDirection: 360 },
      { ...WEATHER_PRESETS.storm, windDirection: NaN }]) expect(isWeatherSettings(value)).toBe(false);
  });

  it('enables thunder only for observed thunderstorm codes', () => {
    for (const weatherCode of [95, 96, 99]) expect(classifyWeather({ ...observed, weatherCode }).weather).toBe('storm');
    expect(classifyWeather({ ...observed, rainMm: 30, windSpeedKmh: 90 }).weather).toBe('heavy');
    expect(classifyWeather({ ...observed, weatherCode: 3, windSpeedKmh: 90 }).weather).toBe('clear');
  });

  it('uses rainfall rate and WMO severity without mistaking snow or fog for rain', () => {
    expect(classifyWeather({ ...observed, rainMm: 0.2 }).weather).toBe('light');
    expect(classifyWeather({ ...observed, rainMm: 0.7 }).weather).toBe('heavy');
    expect(classifyWeather({ ...observed, rainMm: 0.7, intervalSeconds: 3600 }).weather).toBe('light');
    for (const weatherCode of [51, 53, 55, 56, 57, 61, 66, 80]) expect(classifyWeather({ ...observed, weatherCode }).weather).toBe('light');
    for (const weatherCode of [63, 65, 67, 81, 82]) expect(classifyWeather({ ...observed, weatherCode }).weather).toBe('heavy');
    for (const weatherCode of [0, 3, 45, 48, 71, 73, 75, 77, 85, 86]) expect(classifyWeather({ ...observed, weatherCode }).weather).toBe('clear');
  });

  it('caps visual wind while preserving its observed direction', () => {
    expect(classifyWeather({ ...observed, windSpeedKmh: 250, windDirectionDeg: 360 }))
      .toEqual({ weather: 'clear', windSpeed: 180, windDirection: 0 });
    expect(classifyWeather(observed)).toEqual({ weather: 'clear', windSpeed: 12, windDirection: 270 });
  });
});
