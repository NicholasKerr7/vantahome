import { describe, expect, it } from 'vitest';
import { createWeatherAnchors, irrigationJetPoint, isInsideWeatherParcel, weatherLandingHeight, weatherMagnitude, weatherParticleCount, windTravelDirection } from './weatherGeometry';

describe('weather placement and motion', () => {
  it('keeps every rain anchor inside the irregular property and produces stable samples', () => {
    const anchors = createWeatherAnchors(460);
    expect(anchors).toHaveLength(460);
    expect(anchors.every(([x, z]) => isInsideWeatherParcel(x, z))).toBe(true);
    expect(createWeatherAnchors(460)).toEqual(anchors);
    expect(isInsideWeatherParcel(34, 10)).toBe(false);
    expect(isInsideWeatherParcel(-13, 10)).toBe(false);
  });

  it('stops rain above the house and energy pavilion but lets it reach the open lawn', () => {
    expect(weatherLandingHeight(8, -8)).toBeGreaterThan(7.9);
    expect(weatherLandingHeight(1.1, 8.4)).toBeGreaterThan(2.6);
    expect(weatherLandingHeight(25, -18)).toBeCloseTo(-0.325);
  });

  it('translates north and east source winds into the scene travel directions', () => {
    expect(windTravelDirection(0)[1]).toBeCloseTo(1);
    expect(windTravelDirection(90)[0]).toBeCloseTo(-1);
    expect(windTravelDirection(180)[1]).toBeCloseTo(-1);
    expect(windTravelDirection(Number.NaN)).toEqual([-0, 1]);
  });

  it('bounds mobile cost and avoids particles for dry or malformed observations', () => {
    expect(weatherParticleCount(0, false)).toBe(0);
    expect(weatherParticleCount(Number.NaN, false)).toBe(0);
    expect(weatherParticleCount(-1, true)).toBe(0);
    expect(weatherParticleCount(40, true)).toBeLessThanOrEqual(260);
    expect(weatherParticleCount(40, false)).toBeLessThanOrEqual(460);
    expect(weatherParticleCount(2, true)).toBeLessThan(weatherParticleCount(2, false));
    expect(weatherMagnitude(Infinity, 30)).toBe(0);
  });

  it('launches irrigation at the real nozzle and lands exactly at the local lawn', () => {
    expect(irrigationJetPoint(0, 55, 0.1728)).toEqual([0.055, 0.1728, 0]);
    expect(irrigationJetPoint(1, 55, 0.1728)[1]).toBe(0);
    expect(irrigationJetPoint(0.5, 55, 0.1728)[1]).toBeGreaterThan(0.1728);
    expect(irrigationJetPoint(1, 100, 0.1728)[0]).toBeGreaterThan(irrigationJetPoint(1, 20, 0.1728)[0]);
    expect(irrigationJetPoint(Infinity, 55, 0.1728)).toEqual([0.055, 0.1728, 0]);
  });
});
