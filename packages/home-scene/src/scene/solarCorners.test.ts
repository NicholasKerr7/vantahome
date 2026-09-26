import { describe, expect, it } from 'vitest';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import source from '../solar-corners.json';
import site from '../site-layout.json';
import { DEVICES, getDevice } from '../data';
import { FIXTURE_LIBRARY } from './deviceGeometry';
import { getLandscapeCamera } from './siteGeometry';

/** Evaluate each full part box after its authored local rotation and device mounting rotation. */
function occupiedVertices(id: string): Vector3[] {
  const device = getDevice(id)!;
  const vertices: Vector3[] = [];
  for (const part of FIXTURE_LIBRARY.devices[id]!.parts) {
    for (const x of [-0.5, 0.5]) {
      for (const y of [-0.5, 0.5]) {
        for (const z of [-0.5, 0.5]) {
          vertices.push(new Vector3(x * part.size[0], y * part.size[1], z * part.size[2])
            .applyEuler(new Euler(...part.rotation))
            .add(new Vector3(...part.position))
            .applyEuler(new Euler(...device.rotation))
            .add(new Vector3(...device.position)));
        }
      }
    }
  }
  return vertices;
}

/** Compute signed inward distance to the clockwise traced parcel edges. */
function parcelClearance(point: Vector3): number {
  return Math.min(...site.parcel.vertices.map((a, index) => {
    const b = site.parcel.vertices[(index + 1) % site.parcel.vertices.length]!;
    const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
    return -(dx * (-point.z - a[1]!) - dy * (point.x - a[0]!)) / Math.hypot(dx, dy);
  }));
}

describe('four solar corner streetlights', () => {
  it('has one independently controllable, sun-panelled light at each distinct parcel corner', () => {
    const lamps = DEVICES.filter((device) => device.model === 'solar-streetlight');
    expect(lamps).toHaveLength(4);
    expect(new Set(source.corners.map((corner) => corner.parcelVertex)).size).toBe(4);
    for (const corner of source.corners) {
      const device = getDevice(corner.id)!;
      expect(device.kind).toBe('light');
      expect(device.roomId).toBe('grounds');
      expect(device.position).toEqual([corner.positionBlender[0], corner.positionBlender[2], -corner.positionBlender[1]!]);
      const parts = FIXTURE_LIBRARY.devices[corner.id]!.parts;
      expect(parts.filter((part) => part.role === 'glow')).toHaveLength(1);
      expect(parts.some((part) => part.material === 'solar')).toBe(true);
      expect(parts.some((part) => part.name === 'service access panel')).toBe(true);
      const parcelCorner = site.parcel.vertices[corner.parcelVertex]!;
      expect(Math.hypot(device.position[0] - parcelCorner[0]!, -device.position[2] - parcelCorner[1]!)).toBeLessThan(1.5);
    }
  });

  it.each(source.corners)('$corner light keeps its whole inward-facing head and base inside the parcel', ({ id }) => {
    const vertices = occupiedVertices(id);
    expect(Math.min(...vertices.map(parcelClearance))).toBeGreaterThan(0.12);
    expect(Math.min(...vertices.map((point) => point.y))).toBeCloseTo(site.parcel.lawnElevation, 5);
    expect(Math.max(...vertices.map((point) => point.y))).toBeLessThan(4);
  });

  it.each([320 / 568, 390 / 844, 834 / 1194, 1024 / 768, 1366 / 1024])('frames all lamp geometry for aspect %s', (aspect) => {
    const pose = getLandscapeCamera(aspect);
    const camera = new PerspectiveCamera(42, aspect, 0.08, 1000);
    camera.position.set(...pose.position);
    camera.lookAt(new Vector3(...pose.target));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    for (const corner of source.corners) {
      for (const point of occupiedVertices(corner.id)) {
        point.project(camera);
        expect(Math.abs(point.x)).toBeLessThanOrEqual(1 / 1.12 + 1e-8);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(1 / 1.12 + 1e-8);
      }
    }
  });
});
