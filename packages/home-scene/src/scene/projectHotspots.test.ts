import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { arrangeHotspots, projectHotspotAnchors } from './arrangeHotspots';

const SIZE = { width: 780, height: 520 };

/** Build a real perspective camera with an explicitly evaluated world transform. */
function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(72, SIZE.width / SIZE.height, 0.1, 100);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Turn a desired screen location into a world point using Three's inverse projection. */
function worldAtPixel(camera: PerspectiveCamera, x: number, y: number): Vector3 {
  return new Vector3(x / SIZE.width * 2 - 1, 1 - y / SIZE.height * 2, 0).unproject(camera);
}

describe('actual-camera hotspot projection', () => {
  it('rejects behind-camera, near-clipped, far-clipped and non-finite world points', () => {
    const camera = makeCamera();
    const anchors = [
      { id: 'behind', world: new Vector3(0, 0, 5) },
      { id: 'visible', world: new Vector3(0, 0, -5) },
      { id: 'before-near', world: new Vector3(0, 0, -0.05) },
      { id: 'beyond-far', world: new Vector3(0, 0, -101) },
      { id: 'camera-plane', world: new Vector3(0, 0, 0) },
      { id: 'nan', world: new Vector3(NaN, 0, -5) },
      { id: 'infinite', world: new Vector3(Infinity, 0, -5) },
    ];
    expect(projectHotspotAnchors(anchors, camera, SIZE)).toEqual([{ id: 'visible', x: 390, y: 260 }]);
  });

  it('does not let a hidden point displace the visible control at the same projected position', () => {
    const camera = makeCamera();
    // Both points project to screen center despite being on opposite sides of the eye.
    const front = new Vector3(0, 0, -5);
    const behind = new Vector3(0, 0, 5);
    expect(front.clone().project(camera).x).toBeCloseTo(behind.clone().project(camera).x, 12);
    const projected = projectHotspotAnchors([{ id: 'hidden', world: behind }, { id: 'visible', world: front }], camera, SIZE);
    expect(arrangeHotspots(projected, SIZE.width, SIZE.height)).toEqual({ visible: [390, 260] });
  });

  it.each([
    [-23, 260, true], [-25, 260, false], [803, 260, true], [805, 260, false],
    [390, -23, true], [390, -25, false], [390, 543, true], [390, 545, false],
  ])('respects the screen-edge allowance at pixel (%s, %s)', (x, y, expected) => {
    const camera = makeCamera();
    const result = projectHotspotAnchors([{ id: 'edge', world: worldAtPixel(camera, x, y) }], camera, SIZE);
    expect(result.length).toBe(expected ? 1 : 0);
    if (expected) {
      expect(result[0].x).toBeCloseTo(x, 8);
      expect(result[0].y).toBeCloseTo(y, 8);
    }
  });

  it('uses the updated eye and look direction after an immersive camera turn', () => {
    const camera = makeCamera();
    camera.position.set(7.5, 1.5, -9);
    camera.lookAt(12.5, 1.5, -9);
    camera.updateMatrixWorld(true);
    const result = projectHotspotAnchors([
      { id: 'ahead', world: new Vector3(12.5, 1.5, -9) },
      { id: 'behind', world: new Vector3(2.5, 1.5, -9) },
    ], camera, SIZE);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ahead');
    expect(result[0].x).toBeCloseTo(SIZE.width / 2, 8);
    expect(result[0].y).toBeCloseTo(SIZE.height / 2, 8);
  });

  it('gives an upper-floor world anchor the same projection after translating the eye by the floor datum', () => {
    const camera = makeCamera();
    const local = new Vector3(0.3, 0.4, -5);
    const cutaway = projectHotspotAnchors([{ id: 'upper-lamp', world: local }], camera, SIZE);
    const elevation = new Vector3(0, 2.9464, 0);
    camera.position.add(elevation);
    camera.updateMatrixWorld(true);
    const complete = projectHotspotAnchors([{ id: 'upper-lamp', world: local.clone().add(elevation) }], camera, SIZE);
    expect(complete[0].x).toBeCloseTo(cutaway[0].x, 10);
    expect(complete[0].y).toBeCloseTo(cutaway[0].y, 10);
  });

  it('leaves world anchors and camera pose unchanged and returns detached screen coordinates', () => {
    const camera = makeCamera();
    const world = new Vector3(0.1, 0.2, -5);
    Object.freeze(world);
    const originalPosition = camera.position.clone();
    const originalQuaternion = camera.quaternion.clone();
    const originalProjection = camera.projectionMatrix.clone();
    const originalWorld = camera.matrixWorld.clone();
    const originalInverse = camera.matrixWorldInverse.clone();
    const anchors = [{ id: 'device', world }];
    const first = projectHotspotAnchors(anchors, camera, SIZE);
    first[0].x = -999;
    expect(projectHotspotAnchors(anchors, camera, SIZE)[0].x).not.toBe(-999);
    expect(world.toArray()).toEqual([0.1, 0.2, -5]);
    expect(camera.position.equals(originalPosition)).toBe(true);
    expect(camera.quaternion.equals(originalQuaternion)).toBe(true);
    expect(camera.projectionMatrix.equals(originalProjection)).toBe(true);
    expect(camera.matrixWorld.equals(originalWorld)).toBe(true);
    expect(camera.matrixWorldInverse.equals(originalInverse)).toBe(true);
  });
});
