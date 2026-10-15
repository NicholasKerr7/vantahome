import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { getLandscapeCamera } from './siteGeometry';
import { projectSiteCardinal, SITE_CARDINALS, SITE_NORTH_OFFSET_DEGREES, siteBearingDirection } from './siteOrientation';

/** Match the actual landscape camera without changing its framing to accommodate labels. */
function overviewCamera(width: number, height: number): PerspectiveCamera {
  const pose = getLandscapeCamera(width / height);
  const camera = new PerspectiveCamera(42, width / height, 0.08, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  return camera;
}

describe('official-map-calibrated property compass', () => {
  it('uses the mapped frontage without assuming drawing-up or screen-up north', () => {
    expect(SITE_NORTH_OFFSET_DEGREES).toBe(-26.884524018094538);
    const north = siteBearingDirection(0);
    expect(north.x).toBeCloseTo(-0.45219381219845867);
    expect(north.y).toBe(0);
    expect(north.z).toBeCloseTo(-0.8919197027812678);
    const east = siteBearingDirection(90);
    expect(east.x).toBeCloseTo(0.8919197027812678);
    expect(east.z).toBeCloseTo(-0.45219381219845867);
    expect(east.dot(north)).toBeCloseTo(0);
    expect(siteBearingDirection(180).add(north).length()).toBeCloseTo(0);
    expect(siteBearingDirection(270).add(east).length()).toBeCloseTo(0);
  });

  it.each([[390, 540], [768, 800], [600, 600]])('keeps all four points bounded at %s x %s through orbit and zoom', (width, height) => {
    const camera = overviewCamera(width, height);
    for (const distance of [10, 50, 300]) {
      for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
        camera.position.set(10 + Math.sin(angle) * distance, Math.max(2, distance * 0.8), -8 + Math.cos(angle) * distance);
        camera.lookAt(10, 0, -8);
        camera.updateMatrixWorld();
        for (const cardinal of SITE_CARDINALS) {
          const [x, y] = projectSiteCardinal(cardinal.bearing, camera, { width, height });
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(24);
          expect(x).toBeLessThanOrEqual(width - 24);
          expect(y).toBeGreaterThanOrEqual(94);
          expect(y).toBeLessThanOrEqual(height - 84);
        }
      }
    }
  });

  it('moves labels with the camera while preserving the camera and model coordinate system', () => {
    const camera = overviewCamera(700, 600);
    const before = camera.matrixWorld.toArray();
    const first = projectSiteCardinal(0, camera, { width: 700, height: 600 });
    expect(camera.matrixWorld.toArray()).toEqual(before);
    camera.position.set(57, 44, 33);
    camera.lookAt(10, 0, -8);
    camera.updateMatrixWorld();
    const second = projectSiteCardinal(0, camera, { width: 700, height: 600 });
    expect(Math.hypot(second[0] - first[0], second[1] - first[1])).toBeGreaterThan(100);
  });
});

describe('camera-relative compass projection', () => {
  it('keeps north stable when a panned orbit crosses the former world-anchor camera plane', () => {
    const size = { width: 390, height: 540 };
    const camera = overviewCamera(size.width, size.height);
    const positions = [217.1, 217.2].map((azimuthDegrees) => {
      const azimuth = azimuthDegrees * Math.PI / 180;
      camera.position.set(30 + Math.sin(azimuth) * 35 * Math.cos(0.7), 35 * Math.sin(0.7), -8 + Math.cos(azimuth) * 35 * Math.cos(0.7));
      camera.lookAt(30, 0, -8);
      camera.updateMatrixWorld();
      return projectSiteCardinal(0, camera, size);
    });
    // The previous front/behind switch moved north more than 200 pixels here.
    expect(Math.hypot(positions[1][0] - positions[0][0], positions[1][1] - positions[0][1])).toBeLessThan(3);
  });

  it('does not change compass bearings when panning or zooming without rotating the camera', () => {
    const size = { width: 768, height: 800 };
    const camera = overviewCamera(size.width, size.height);
    const lookDirection = new Vector3(1, 0.8, 1).normalize();
    let expected: [number, number][] | undefined;
    for (const pan of [new Vector3(10, 0, -8), new Vector3(30, 0, -8), new Vector3(-90, 0, 92)]) {
      for (const distance of [10, 35, 300]) {
        camera.position.copy(pan).addScaledVector(lookDirection, distance);
        camera.lookAt(pan);
        camera.updateMatrixWorld();
        const positions = SITE_CARDINALS.map(({ bearing }) => projectSiteCardinal(bearing, camera, size));
        const reference = expected ?? positions;
        expected = reference;
        positions.forEach(([x, y], index) => {
          expect(x).toBeCloseTo(reference[index][0], 8);
          expect(y).toBeCloseTo(reference[index][1], 8);
        });
      }
    }
  });

  it('keeps opposite directions opposite through orbit and a direct horizon view', () => {
    const size = { width: 390, height: 540 };
    const camera = overviewCamera(size.width, size.height);
    for (const bearing of [0, 45, 90, 180, 270]) {
      camera.position.set(10, 0, -8);
      camera.lookAt(camera.position.clone().add(siteBearingDirection(bearing)));
      camera.updateMatrixWorld();
      const north = projectSiteCardinal(0, camera, size);
      const south = projectSiteCardinal(180, camera, size);
      const east = projectSiteCardinal(90, camera, size);
      const west = projectSiteCardinal(270, camera, size);
      for (const [first, opposite] of [[north, south], [east, west]]) {
        expect(first.every(Number.isFinite) && opposite.every(Number.isFinite)).toBe(true);
        expect(first[0] + opposite[0]).toBeCloseTo(390);
        expect(first[1] + opposite[1]).toBeCloseTo(94 + 540 - 84);
      }
    }
  });
});
