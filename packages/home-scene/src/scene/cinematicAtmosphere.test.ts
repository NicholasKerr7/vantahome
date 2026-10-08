import { describe, expect, it } from 'vitest';
import { createCinematicAtmosphereState, updateCinematicAtmosphereState } from './cinematicAtmospherePalette';

describe('cinematic property atmosphere', () => {
  it('follows daylight instead of turning a real night into a staged day', () => {
    const day = createCinematicAtmosphereState();
    const night = createCinematicAtmosphereState();
    updateCinematicAtmosphereState(day, 1, null);
    updateCinematicAtmosphereState(night, 0, null);
    expect(day.sunVisibility).toBe(1);
    expect(day.moonVisibility).toBe(0);
    expect(night.sunVisibility).toBe(0);
    expect(night.moonVisibility).toBe(1);
    expect(night.zenith.r + night.zenith.g + night.zenith.b).toBeLessThan(day.zenith.r + day.zenith.g + day.zenith.b);
    expect(night.horizon.b).toBeGreaterThan(night.horizon.r);
  });

  it('softens the celestial light and adds bounded haze for actual cloud and rain readings', () => {
    const clear = createCinematicAtmosphereState();
    const wet = createCinematicAtmosphereState();
    updateCinematicAtmosphereState(clear, 1, { cloudCover: 0, precipitationMm: 0 });
    updateCinematicAtmosphereState(wet, 1, { cloudCover: 100, precipitationMm: 12 });
    expect(wet.sunVisibility).toBeLessThan(clear.sunVisibility * 0.1);
    expect(wet.fogDensity).toBeGreaterThan(clear.fogDensity);
    expect(wet.fogDensity).toBeLessThan(0.009);
  });

  it('reuses palette objects while handling malformed and extreme external values', () => {
    const state = createCinematicAtmosphereState();
    const colors = [state.zenith, state.horizon, state.terrain, state.sun];
    for (const daylight of [Number.NaN, Infinity, -10, 0.5, 20]) {
      updateCinematicAtmosphereState(state, daylight, { cloudCover: Infinity, precipitationMm: -200 });
      expect([state.zenith, state.horizon, state.terrain, state.sun]).toEqual(colors);
      expect(state.zenith).toBe(colors[0]);
      expect(state.horizon).toBe(colors[1]);
      expect(state.terrain).toBe(colors[2]);
      expect(state.sun).toBe(colors[3]);
      expect(Number.isFinite(state.fogDensity)).toBe(true);
      expect(state.sunVisibility).toBeGreaterThanOrEqual(0);
      expect(state.sunVisibility).toBeLessThanOrEqual(1);
    }
  });
});
