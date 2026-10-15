import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { getLandscapeCamera } from './siteGeometry';
import { projectSiteCardinal, SITE_CARDINALS, SITE_NORTH_OFFSET_DEGREES, siteBearingDirection, siteCardinalPosition } from './siteOrientation';

/** Match the actual landscape camera without changing its framing to accommodate labels. */
function overviewCamera(width: number, height: number): PerspectiveCamera {
  const pose = getLandscapeCamera(width / height);
  const camera = new PerspectiveCamera(42, width / height, 0.08, 500);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  return camera;
}

describe('plan-calibrated property compass', () => {
  it('uses the A002 arrow, not an assumed drawing-up or screen-up north', () => {
    expect(SITE_NORTH_OFFSET_DEGREES).toBe(-30);
    const north = siteBearingDirection(0);
    expect(north.x).toBeCloseTo(-0.5);
    expect(north.y).toBe(0);
    expect(north.z).toBeCloseTo(-Math.sqrt(3) / 2);
    const east = siteBearingDirection(90);
    expect(east.x).toBeCloseTo(Math.sqrt(3) / 2);
    expect(east.z).toBeCloseTo(-0.5);
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
    expect(siteCardinalPosition(0)[0]).toBeCloseTo(-7.5);
    expect(siteCardinalPosition(0)[2]).toBeCloseTo(-8 - 35 * Math.sqrt(3) / 2);
    camera.position.set(57, 44, 33);
    camera.lookAt(10, 0, -8);
    camera.updateMatrixWorld();
    const second = projectSiteCardinal(0, camera, { width: 700, height: 600 });
    expect(Math.hypot(second[0] - first[0], second[1] - first[1])).toBeGreaterThan(100);
  });
});
