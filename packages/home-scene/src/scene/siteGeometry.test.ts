import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import siteLayout from '../site-layout.json';
import { getGatePosition, getLandscapeCamera, getLandscapeFramingPoints } from './siteGeometry';

const VIEWPORTS = [
  { label: 'narrow phone portrait', width: 320, height: 700 },
  { label: 'phone portrait', width: 390, height: 844 },
  { label: 'phone canvas', width: 366, height: 370 },
  { label: 'phone landscape', width: 844, height: 390 },
  { label: 'tablet portrait', width: 834, height: 1194 },
  { label: 'tablet landscape', width: 1194, height: 834 },
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'wide desktop', width: 1920, height: 1080 },
  { label: 'ultrawide desktop', width: 3440, height: 1440 },
] as const;

/** Use Three's actual perspective matrices to verify the pure fit with a separate method. */
function projectSite(aspect: number, fov: number): Vector3[] {
  const pose = getLandscapeCamera(aspect, fov);
  const camera = new PerspectiveCamera(fov, aspect, 0.08, 1000);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return getLandscapeFramingPoints().map((point) => new Vector3(...point).project(camera));
}

describe('landscape camera fit', () => {
  it.each(VIEWPORTS)('fits the full site on $label with its intended margin', ({ width, height }) => {
    const projected = projectSite(width / height, 42);
    const paddedEdge = 1 / 1.12;
    for (const corner of projected) {
      expect(Math.abs(corner.x)).toBeLessThanOrEqual(paddedEdge + 1e-9);
      expect(Math.abs(corner.y)).toBeLessThanOrEqual(paddedEdge + 1e-9);
      expect(corner.z).toBeGreaterThan(-1);
      expect(corner.z).toBeLessThan(1);
    }
    // The tightest axis should use the available frame rather than shrink needlessly.
    const largestExtent = Math.max(...projected.flatMap((corner) => [Math.abs(corner.x), Math.abs(corner.y)]));
    expect(largestExtent).toBeCloseTo(paddedEdge, 8);
    const horizontalSpan = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const verticalSpan = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    expect(Math.max(horizontalSpan, verticalSpan)).toBeCloseTo(paddedEdge * 2, 8);
  });

  it.each([28, 55, 72])('fits portrait and landscape views at a %s-degree field of view', (fov) => {
    for (const aspect of [390 / 844, 1920 / 1080]) {
      for (const corner of projectSite(aspect, fov)) {
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(1 / 1.12 + 1e-9);
        expect(Math.abs(corner.y)).toBeLessThanOrEqual(1 / 1.12 + 1e-9);
      }
    }
  });

  it('retains the authored overview direction while centering the frame without mutating the layout', () => {
    const before = structuredClone(siteLayout.runtime);
    const pose = getLandscapeCamera(390 / 844);
    const actualDirection = new Vector3(...pose.position).sub(new Vector3(...pose.target)).normalize();
    const authoredDirection = new Vector3(...siteLayout.runtime.overviewCamera).sub(new Vector3(...siteLayout.runtime.center)).normalize();
    expect(actualDirection.distanceTo(authoredDirection)).toBeLessThan(1e-12);
    expect(pose.target.every(Number.isFinite)).toBe(true);
    expect(siteLayout.runtime).toEqual(before);
    pose.target[0] = -999;
    expect(siteLayout.runtime.center).toEqual(before.center);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('falls back to a square view for invalid aspect %s', (aspect) => {
    expect(getLandscapeCamera(aspect)).toEqual(getLandscapeCamera(1));
  });

  it.each([0, -20, 180, Number.NaN, Number.POSITIVE_INFINITY])('uses the default field of view when %s is invalid', (fov) => {
    expect(getLandscapeCamera(1.5, fov)).toEqual(getLandscapeCamera(1.5, 42));
  });
});

describe('occupied landscape framing points', () => {
  it('includes the actual parcel, road and house extents without tall imaginary parcel corners', () => {
    const points = getLandscapeFramingPoints();
    const { parcel, road } = siteLayout;
    for (const [x, y] of parcel.vertices) {
      expect(points).toContainEqual([x, parcel.lawnElevation, -y!]);
      expect(points).toContainEqual([x, parcel.lawnElevation - parcel.slabThickness, -y!]);
    }
    for (const x of [road.bounds[0], road.bounds[1]]) {
      for (const y of [road.bounds[2], road.bounds[3]]) expect(points).toContainEqual([x, road.elevation, -y!]);
    }
    for (const x of [-0.7, 17.3]) {
      for (const y of [-0.25, 7.9]) {
        for (const z of [-16.9, 0.7]) expect(points).toContainEqual([x, y, z]);
      }
    }
    expect(points).not.toContainEqual([-15.5, 7.9, -29]);
    expect(points).not.toContainEqual([35.5, 7.9, 12.65]);
  });

  it('includes conservative crown corners and both gate posts', () => {
    const points = getLandscapeFramingPoints();
    for (const [x, y, height] of siteLayout.planting.palms) {
      for (const xOffset of [-1.6, 1.6]) {
        for (const zOffset of [-1.6, 1.6]) {
          expect(points).toContainEqual([x! + xOffset, height! + 1, -y! + zOffset]);
          expect(points).toContainEqual([x! + xOffset, siteLayout.parcel.lawnElevation, -y! + zOffset]);
        }
      }
    }
    const postRadius = siteLayout.boundary.gatePostWidth / 2 + siteLayout.boundary.capThickness;
    for (const [x, y, z] of [siteLayout.runtime.gate.openingStart, siteLayout.runtime.gate.openingEnd]) {
      expect(points).toContainEqual([x! - postRadius, y! + 2, z! - postRadius]);
      expect(points).toContainEqual([x! + postRadius, y! + 2, z! + postRadius]);
    }
  });

  it('returns fresh finite points so callers cannot change the fixture', () => {
    const before = getLandscapeFramingPoints();
    expect(before.every((point) => point.every(Number.isFinite))).toBe(true);
    const copy = getLandscapeFramingPoints();
    copy[0]![0] = 999;
    expect(getLandscapeFramingPoints()).toEqual(before);
  });
});

describe('entry gate position', () => {
  it.each([0, 25, 50, 100])('moves to %s percent along the authored translation', (percent) => {
    const { position, openTranslation } = siteLayout.runtime.gate;
    const result = getGatePosition(percent);
    expect(result).toHaveLength(3);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(result[axis]).toBeCloseTo(position[axis]! + openTranslation[axis]! * percent / 100, 10);
    }
  });

  it.each([
    [-25, 0], [125, 100], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [Number.NEGATIVE_INFINITY, 0],
  ])('bounds invalid or out-of-range position %s to %s', (input, expected) => {
    expect(getGatePosition(input)).toEqual(getGatePosition(expected));
  });

  it('completely clears the opening when fully open and spans it when closed', () => {
    const gate = siteLayout.runtime.gate;
    const start = new Vector3(...gate.openingStart);
    const end = new Vector3(...gate.openingEnd);
    const openingLength = start.distanceTo(end);
    const openingAxis = end.clone().sub(start).normalize();
    const panelAxis = new Vector3(Math.cos(gate.rotationY), 0, -Math.sin(gate.rotationY));
    const halfWidthOnOpening = Math.abs(panelAxis.dot(openingAxis)) * gate.width / 2;
    const closedCenter = new Vector3(...getGatePosition(0)).sub(start).dot(openingAxis);
    const openedCenter = new Vector3(...getGatePosition(100)).sub(start).dot(openingAxis);

    expect(closedCenter - halfWidthOnOpening).toBeCloseTo(0, 8);
    expect(closedCenter + halfWidthOnOpening).toBeCloseTo(openingLength, 8);
    expect(openedCenter - halfWidthOnOpening).toBeGreaterThan(openingLength);
    expect(openedCenter - halfWidthOnOpening - openingLength).toBeCloseTo(0.18, 8);
  });

  it('does not expose a mutable reference to the authored gate origin', () => {
    const closed = getGatePosition(0);
    closed[0] = 999;
    expect(getGatePosition(0)).toEqual(siteLayout.runtime.gate.position);
  });
});
