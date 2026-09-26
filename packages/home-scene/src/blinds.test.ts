import { describe, expect, it } from 'vitest';
import { BLINDS_GEOMETRY, createBlindsState, getBlindsPose } from './blinds';

describe('blinds geometry matches the source window', () => {
  it('covers the full glass height with overlapping closed slats', () => {
    const pose = getBlindsPose(0);
    const { depth, thickness, firstSlatHeight, slatCount, windowBottom, windowTop } = BLINDS_GEOMETRY;
    const projectedHeight = depth * Math.sin(pose.tilt) + thickness * Math.cos(pose.tilt);
    const top = firstSlatHeight + pose.firstOffset + projectedHeight / 2;
    const bottom = firstSlatHeight + pose.firstOffset - (slatCount - 1) * pose.gap - projectedHeight / 2;
    expect(projectedHeight).toBeGreaterThan(pose.gap);
    expect(top).toBeGreaterThanOrEqual(windowTop);
    expect(bottom).toBeLessThanOrEqual(windowBottom);
  });

  it('lifts every slat and the bottom rail clear of the glass at 100%', () => {
    const pose = getBlindsPose(100);
    const { firstSlatHeight, slatCount, thickness, windowTop } = BLINDS_GEOMETRY;
    const lastSlatBottom = firstSlatHeight + pose.firstOffset - (slatCount - 1) * pose.gap - thickness / 2;
    const bottomRailEdge = firstSlatHeight + pose.bottomOffset - 0.03;
    expect(lastSlatBottom).toBeGreaterThanOrEqual(windowTop);
    expect(bottomRailEdge).toBeGreaterThanOrEqual(windowTop);
    expect(pose.tilt).toBe(0);
  });

  it('exposes approximately half the glass at the midpoint', () => {
    const pose = getBlindsPose(50);
    const { firstSlatHeight, windowBottom, windowTop } = BLINDS_GEOMETRY;
    const visibleHeight = firstSlatHeight + pose.bottomOffset - 0.03 - windowBottom;
    expect(visibleHeight / (windowTop - windowBottom)).toBeGreaterThan(0.45);
    expect(visibleHeight / (windowTop - windowBottom)).toBeLessThan(0.55);
  });

  it('can evaluate endpoints directly for reduced-motion rendering', () => {
    expect(getBlindsPose(Number.NaN)).toEqual(getBlindsPose(0));
    expect(getBlindsPose(-50)).toEqual(getBlindsPose(0));
    expect(getBlindsPose(200)).toEqual(getBlindsPose(100));
    expect(createBlindsState(0)).toEqual({ on: false, level: 0 });
    expect(createBlindsState(47.5)).toEqual({ on: true, level: 48 });
  });
});
