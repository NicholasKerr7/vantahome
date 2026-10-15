import { describe, expect, it } from 'vitest';
import siteLayout from '../site-layout.json';
import { createRoadMarkingGeometry, ROAD_MARKING_ELEVATION, roadMarkingStripes } from './roadMarkingGeometry';

describe('property road markings', () => {
  it('stays within the existing road and above the asphalt without moving its geometry', () => {
    const before = JSON.stringify(siteLayout);
    const [minX, maxX, minNorth, maxNorth] = siteLayout.road.bounds as [number, number, number, number];
    for (const stripe of roadMarkingStripes()) {
      expect(stripe.minX).toBeGreaterThan(minX);
      expect(stripe.maxX).toBeLessThan(maxX);
      expect(stripe.minZ).toBeGreaterThan(-maxNorth);
      expect(stripe.maxZ).toBeLessThan(-minNorth);
      expect(stripe.maxX).toBeGreaterThan(stripe.minX);
      expect(stripe.maxZ).toBeGreaterThan(stripe.minZ);
    }
    expect(ROAD_MARKING_ELEVATION - siteLayout.road.elevation).toBeCloseTo(0.008);
    expect(JSON.stringify(siteLayout)).toBe(before);
  });

  it('breaks the property-side edge paint at the driveway apron', () => {
    const roadCenter = -(siteLayout.road.bounds[2]! + siteLayout.road.bounds[3]!) / 2;
    const entranceStart = Math.min(...siteLayout.apron.polygon.map(([x]) => x!));
    const entranceEnd = Math.max(...siteLayout.apron.polygon.map(([x]) => x!));
    const nearEdge = roadMarkingStripes().filter((stripe) => stripe.minZ > roadCenter + 1);
    expect(nearEdge).toHaveLength(2);
    for (const stripe of nearEdge) expect(stripe.maxX < entranceStart || stripe.minX > entranceEnd).toBe(true);
  });

  it('batches finite, upward-facing triangles with separated center dashes', () => {
    const geometry = createRoadMarkingGeometry();
    try {
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      expect([...position.array].every(Number.isFinite)).toBe(true);
      for (let index = 0; index < normal.count; index++) expect(normal.getY(index)).toBeCloseTo(1);
      expect(geometry.index!.count).toBe(roadMarkingStripes().length * 6);
      expect(geometry.boundingSphere!.radius).toBeLessThan(26);
      const center = roadMarkingStripes().slice(3);
      expect(center.length).toBeGreaterThan(5);
      for (let index = 1; index < center.length; index++) expect(center[index]!.minX - center[index - 1]!.maxX).toBeCloseTo(3.5);
    } finally { geometry.dispose(); }
  });
});
