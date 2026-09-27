import { describe, expect, it } from 'vitest';
import type { WeatherKind } from './weather';
import { stormFlash, WEATHER_GROUPS, weatherGroupPose } from './weatherAnimation';

describe('shared surface weather animation', () => {
  it('keeps rain budgets bounded at 120, 240, and 360 drops across the three intensities', () => {
    for (const [kind, batches] of [['clear', 0], ['light', 4], ['heavy', 8], ['storm', 12]] as const) {
      const visible = WEATHER_GROUPS.filter((group) => group.kind === 'rain'
        && weatherGroupPose(group, 0, kind, 48, 55, true).scale[0] > 0);
      expect(visible).toHaveLength(batches);
    }
  });

  it('keeps wet materials and original foliage visible while reduced motion suppresses precipitation', () => {
    for (const group of WEATHER_GROUPS) {
      const pose = weatherGroupPose(group, 6, 'storm', 48, 55, false);
      expect(pose.position).toEqual(group.anchor);
      expect(pose.rotation).toEqual([0, 0, 0]);
      expect(pose.scale).toEqual(['wet', 'plant'].includes(group.kind) ? [1, 1, 1] : [0, 0, 0]);
    }
    expect(stormFlash(5.9, 'storm', false)).toBe(0);
  });

  it('moves falling rain downwind from meteorological north and east source directions', () => {
    const rain = WEATHER_GROUPS.find(({ kind }) => kind === 'rain')!;
    const northStart = weatherGroupPose(rain, 0, 'storm', 48, 0, true);
    const northLater = weatherGroupPose(rain, 0.1, 'storm', 48, 0, true);
    expect(northLater.position[1]).toBeLessThan(northStart.position[1]);
    expect(northLater.position[2]).toBeGreaterThan(northStart.position[2]);
    const eastStart = weatherGroupPose(rain, 0, 'storm', 48, 90, true);
    const eastLater = weatherGroupPose(rain, 0.1, 'storm', 48, 90, true);
    expect(eastLater.position[0]).toBeLessThan(eastStart.position[0]);
  });

  it('never translates rain below its sampled surface and keeps rooted foliage within a small bend', () => {
    for (const weather of ['clear', 'light', 'heavy', 'storm'] as WeatherKind[]) {
      for (const group of WEATHER_GROUPS) {
        for (let frame = 0; frame < 60; frame++) {
          const pose = weatherGroupPose(group, frame * 0.113, weather, 180, 359, true);
          expect([...pose.position, ...pose.rotation, ...pose.scale].every(Number.isFinite)).toBe(true);
          if (group.kind === 'rain') {
            expect(pose.position[1]).toBeGreaterThanOrEqual(0);
            expect(pose.position[1]).toBeLessThanOrEqual(6);
            expect(Math.hypot(pose.position[0], pose.position[2])).toBeLessThanOrEqual(0.508);
          }
          if (group.kind === 'plant') {
            expect(pose.position).toEqual(group.anchor);
            expect(Math.hypot(...pose.rotation)).toBeLessThanOrEqual(0.095);
          }
        }
      }
    }
  });

  it('uses a single soft flash separated by long quiet periods and never flashes for ordinary rain', () => {
    expect(stormFlash(5.925, 'storm', true)).toBeCloseTo(0.65);
    expect(stormFlash(4, 'storm', true)).toBe(0);
    expect(stormFlash(6.5, 'storm', true)).toBe(0);
    expect(stormFlash(5.925, 'heavy', true)).toBe(0);
    expect(stormFlash(5.925 + 19, 'storm', true)).toBeCloseTo(0.65);
  });
});
