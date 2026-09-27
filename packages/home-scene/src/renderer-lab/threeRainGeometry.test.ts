import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import surfaces from './weather-surfaces.json';
import { createRainGeometry, type RainGeometryKind } from './threeRainGeometry';

const CASES = [
  { kind: 'rain', count: 720, copies: 2, points: surfaces.landingPoints },
  { kind: 'splash', count: 336, copies: 3, points: surfaces.splashPoints },
  { kind: 'runoff', count: 56, copies: 1, points: surfaces.runoffPoints },
] as const;

/** Compare exact float32 contact coordinates, independent of their ordering in a pool. */
function anchorKey(position: number[]): string {
  return position.map(Math.fround).join(',');
}

describe('Three.js surveyed rain geometry', () => {
  it('uses fixed particle budgets and one indexed quad per instance', () => {
    for (const { kind, count } of CASES) {
      const geometry = createRainGeometry(kind);
      expect(geometry.instanceCount).toBe(count);
      expect(Array.from(geometry.getAttribute('position').array)).toEqual([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]);
      expect(Array.from(geometry.getAttribute('uv').array)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
      expect(Array.from(geometry.index!.array)).toEqual([0, 1, 2, 2, 1, 3]);
      expect(geometry.getAttribute('aAnchor').count).toBe(count);
      expect(geometry.getAttribute('aSeed').count).toBe(count);
      geometry.dispose();
    }
  });

  it('retains every surveyed roof, pavement, yard, and eave anchor without spatial jitter', () => {
    for (const { kind, copies, points } of CASES) {
      const geometry = createRainGeometry(kind);
      const anchors = geometry.getAttribute('aAnchor');
      const expected = new Map<string, number>();
      const actual = new Map<string, number>();
      for (const point of points) {
        const key = anchorKey(point.position);
        expected.set(key, (expected.get(key) ?? 0) + copies);
      }
      for (let index = 0; index < anchors.count; index++) {
        const key = anchorKey([anchors.getX(index), anchors.getY(index), anchors.getZ(index)]);
        actual.set(key, (actual.get(key) ?? 0) + 1);
      }
      expect(actual).toEqual(expected);
      geometry.dispose();
    }
  });

  it('bounds seed values and retains the authored light/heavy/storm visibility tiers', () => {
    const expectedVisibleCounts: Record<RainGeometryKind, number[]> = {
      rain: [240, 480, 720], splash: [168, 336, 336], runoff: [0, 56, 56],
    };
    for (const { kind } of CASES) {
      const geometry = createRainGeometry(kind);
      const seeds = geometry.getAttribute('aSeed');
      expect(Array.from(seeds.array).every(Number.isFinite)).toBe(true);
      const visible = [0, 0, 0];
      for (let index = 0; index < seeds.count; index++) {
        expect(seeds.getX(index)).toBeGreaterThanOrEqual(0);
        expect(seeds.getX(index)).toBeLessThan(1);
        expect(seeds.getY(index)).toBeGreaterThanOrEqual(0);
        expect(seeds.getY(index)).toBeLessThan(kind === 'splash' ? Math.PI * 10 / 3 : 1);
        expect(seeds.getW(index)).toBeGreaterThanOrEqual(0);
        expect(seeds.getW(index)).toBeLessThan(1);
        expect(Number.isInteger(seeds.getZ(index))).toBe(true);
        for (let tier = 1; tier <= 3; tier++) if (seeds.getZ(index) <= tier) visible[tier - 1]++;
      }
      expect(visible).toEqual(expectedVisibleCounts[kind]);
      geometry.dispose();
    }
  });

  it('keeps each splash burst synchronized while spacing its three arms evenly', () => {
    const geometry = createRainGeometry('splash');
    const seeds = geometry.getAttribute('aSeed');
    for (let index = 0; index < seeds.count; index += 3) {
      for (let arm = 1; arm < 3; arm++) {
        expect(seeds.getX(index + arm)).toBe(seeds.getX(index));
        expect(seeds.getZ(index + arm)).toBe(seeds.getZ(index));
        expect(seeds.getW(index + arm)).toBe(seeds.getW(index));
        expect(seeds.getY(index + arm) - seeds.getY(index)).toBeCloseTo(arm * Math.PI * 2 / 3, 5);
      }
    }
    geometry.dispose();
  });

  it('produces identical buffers on recreation and independent timing for paired raindrops', () => {
    for (const { kind } of CASES) {
      const first = createRainGeometry(kind), second = createRainGeometry(kind);
      expect(Array.from(first.getAttribute('aAnchor').array)).toEqual(Array.from(second.getAttribute('aAnchor').array));
      expect(Array.from(first.getAttribute('aSeed').array)).toEqual(Array.from(second.getAttribute('aSeed').array));
      if (kind === 'rain') {
        const seeds = first.getAttribute('aSeed');
        for (let index = 0; index < seeds.count; index += 2) expect(seeds.getX(index)).not.toBe(seeds.getX(index + 1));
      }
      first.dispose(); second.dispose();
    }
  });

  it('keeps every anchor and the maximum supported shader travel inside conservative bounds', () => {
    const point = new Vector3();
    for (const { kind, points } of CASES) {
      const geometry = createRainGeometry(kind);
      expect(geometry.boundingBox?.isEmpty()).toBe(false);
      expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
      for (const anchor of points) {
        for (const height of [-1.1, 7.5]) {
          for (const x of [-1.5, 1.5]) {
            for (const z of [-1.5, 1.5]) {
              point.fromArray(anchor.position).add(new Vector3(x, height, z));
              expect(geometry.boundingBox!.containsPoint(point)).toBe(true);
              expect(geometry.boundingSphere!.containsPoint(point)).toBe(true);
            }
          }
        }
      }
      geometry.dispose();
    }
  });
});
