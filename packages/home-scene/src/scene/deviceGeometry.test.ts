import { describe, expect, it } from 'vitest';
import source from '../device-geometry.json';
import { DEVICES, getDevice } from '../data';
import { BLINDS_GEOMETRY, getBlindsPose } from '../blinds';
import { FIXTURE_LIBRARY, validateFixtureLibrary, type FixturePart } from './deviceGeometry';
import { openingFraction, shutterPose } from './deviceMotion';

/** Freeze every generated child to catch accidental validation-time writes. */
function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  Object.values(value).forEach(freezeTree);
  Object.freeze(value);
}

/** Measure projected vertical coverage from actual descriptor dimensions and rotation. */
function projectedHeight(part: FixturePart, angle: number): number {
  return Math.abs(part.size[1] * Math.cos(angle)) + Math.abs(part.size[2] * Math.sin(angle));
}

describe('portable device geometry contract', () => {
  it('contains one assembly for each of the 90 real manifest IDs, without orphan hardware', () => {
    expect(DEVICES).toHaveLength(90);
    expect(new Set(DEVICES.map((device) => device.id)).size).toBe(90);
    expect(Object.keys(FIXTURE_LIBRARY.devices).sort()).toEqual(DEVICES.map((device) => device.id).sort());
    expect(Object.keys(FIXTURE_LIBRARY.materials).length).toBeLessThanOrEqual(25);
  });

  it('retains existing appliance bodies and the separately exported gate', () => {
    for (const id of ['family-tv', 'entry-gate']) expect(FIXTURE_LIBRARY.devices[id].parts).toEqual([]);
    for (const id of ['laundry-washer', 'laundry-dryer']) {
      expect(FIXTURE_LIBRARY.devices[id].parts.map((part) => part.role)).toEqual(['display']);
    }
    expect(getDevice('laundry-dryer')!.position[0]).toBe(getDevice('laundry-washer')!.position[0]);
    expect(getDevice('laundry-dryer')!.position[2]).toBe(getDevice('laundry-washer')!.position[2]);
    expect(getDevice('laundry-dryer')!.position[1] - getDevice('laundry-washer')!.position[1]).toBeCloseTo(0.9, 8);
  });

  it('accepts deeply readonly imported geometry without changing nested arrays or surfaces', () => {
    const frozen = structuredClone(source);
    const snapshot = structuredClone(frozen);
    freezeTree(frozen);
    const library = validateFixtureLibrary(frozen);
    expect(library).toEqual(snapshot);
    expect(frozen).toEqual(snapshot);
    for (const fixture of Object.values(library.devices)) {
      for (const part of fixture.parts) {
        expect(part.position.every(Number.isFinite)).toBe(true);
        expect(part.rotation.every(Number.isFinite)).toBe(true);
        expect(part.size.every((dimension) => Number.isFinite(dimension) && dimension > 0)).toBe(true);
      }
    }
  });

  it.each(['size', 'rotation', 'material', 'role', 'pivot', 'surface'] as const)(
    'rejects damaged %s before the descriptor reaches the renderer', (field) => {
      const candidate = structuredClone(FIXTURE_LIBRARY);
      const fixture = candidate.devices['entry-door'];
      const part = fixture.parts[0];
      if (field === 'size') part.size[1] = 0;
      if (field === 'rotation') part.rotation[0] = Number.NaN;
      if (field === 'material') part.material = 'missing-surface';
      if (field === 'role') Object.assign(part, { role: 'unknown-animation' });
      if (field === 'pivot') fixture.pivot = [0, Infinity, 0];
      if (field === 'surface') candidate.materials[part.material].roughness = Infinity;
      const snapshot = structuredClone(candidate);
      expect(() => validateFixtureLibrary(candidate)).toThrow();
      expect(candidate).toEqual(snapshot);
    },
  );

  it('anchors moving leaves on the authored hinge, not on their bounding-box centers', () => {
    const door = FIXTURE_LIBRARY.devices['entry-door'];
    expect(door.pivot).toEqual([0, 0, 0]);
    const leaf = door.parts.find((part) => part.name === 'teak leaf')!;
    expect(leaf.position[0] - leaf.size[0] / 2).toBeCloseTo(0, 10);
    expect(leaf.position[1] - leaf.size[1] / 2).toBeCloseTo(0, 10);
    const window = FIXTURE_LIBRARY.devices['kitchen-window'];
    const height = getDevice('kitchen-window')!.dimensions[1];
    expect(window.pivot).toEqual([0, height, 0]);
    const glazing = window.parts.find((part) => part.name === 'opening glazing')!;
    expect(glazing.position[1]).toBeCloseTo(height / 2, 10);
  });
});

describe('descriptor-driven primary blinds coverage', () => {
  const device = getDevice('master-blinds')!;
  const assembly = FIXTURE_LIBRARY.devices[device.id];
  const slats = assembly.parts.filter((part) => part.role === 'slat');
  const lowerRail = assembly.parts.find((part) => part.role === 'blindBottom')!;

  it('uses the validated width, twenty overlapping slats, and the actual closed tilt', () => {
    expect(slats).toHaveLength(BLINDS_GEOMETRY.slatCount);
    expect(slats.map((part) => part.index)).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(device.position[1]).toBeCloseTo(0.905, 8);
    expect(device.dimensions[1]).toBeCloseTo(1.575, 8);
    for (const slat of slats) {
      expect(slat.size[0]).toBeGreaterThanOrEqual(0.914);
      expect(slat.size[0]).toBeCloseTo(device.dimensions[0], 8);
      expect(slat.size[1]).toBeCloseTo(BLINDS_GEOMETRY.thickness, 8);
      expect(slat.size[2]).toBeCloseTo(BLINDS_GEOMETRY.depth, 8);
      expect(slat.rotation[0]).toBeCloseTo(Math.PI / 2, 8);
      const expected = BLINDS_GEOMETRY.firstSlatHeight - slat.index! * getBlindsPose(0).gap;
      expect(device.position[1] + slat.position[1]).toBeCloseTo(expected, 8);
    }
  });

  it.each([0, 2.9464])('covers and uncovers the glass with floor elevation %s m', (floorElevation) => {
    const before = structuredClone(assembly);
    const bottom = BLINDS_GEOMETRY.windowBottom + floorElevation;
    const top = BLINDS_GEOMETRY.windowTop + floorElevation;
    const coverage = [0, 50, 100].map((level) => {
      const pose = getBlindsPose(level);
      const spans = slats.map((part) => {
        const localCenter = BLINDS_GEOMETRY.firstSlatHeight - device.position[1]
          + pose.firstOffset - part.index! * pose.gap;
        const center = device.position[1] + floorElevation + localCenter;
        const half = projectedHeight(part, pose.tilt) / 2;
        return { top: center + half, bottom: center - half };
      });
      const railBottom = floorElevation + BLINDS_GEOMETRY.firstSlatHeight
        + pose.bottomOffset - lowerRail.size[1] / 2;
      return { pose, spans, railBottom };
    });
    const [closed, halfway, open] = coverage;
    expect(closed.spans[0].top).toBeGreaterThanOrEqual(top);
    expect(closed.spans.at(-1)!.bottom).toBeLessThanOrEqual(bottom);
    for (let index = 1; index < closed.spans.length; index += 1) {
      expect(closed.spans[index].top).toBeGreaterThan(closed.spans[index - 1].bottom);
    }
    expect((halfway.railBottom - bottom) / (top - bottom)).toBeGreaterThan(0.45);
    expect((halfway.railBottom - bottom) / (top - bottom)).toBeLessThan(0.55);
    expect(open.spans.every((span) => span.bottom >= top)).toBe(true);
    expect(open.railBottom).toBeGreaterThanOrEqual(top);
    expect(assembly).toEqual(before);
  });
});

describe('bounded opening and shutter poses', () => {
  it.each([[-10, 0], [0, 0], [50, 0.5], [100, 1], [150, 1], [NaN, 0], [Infinity, 0]])(
    'bounds input %s to a finite opening fraction %s', (input, expected) => {
      expect(openingFraction(input)).toBe(expected);
    },
  );

  it('keeps the service shutter top fixed and all posed parts inside the original opening height', () => {
    const device = getDevice('utility-shutter')!;
    const parts = FIXTURE_LIBRARY.devices[device.id].parts.filter((part) => part.role === 'shutter');
    const snapshot = structuredClone(parts);
    const height = device.dimensions[1];
    for (const level of [0, 25, 50, 75, 100]) {
      const pose = shutterPose(height, openingFraction(level));
      expect(pose.scale).toBeGreaterThan(0);
      expect(pose.scale).toBeLessThanOrEqual(1);
      expect(pose.rise + height * pose.scale).toBeCloseTo(height, 10);
      for (const part of parts) {
        const bottom = pose.rise + (part.position[1] - part.size[1] / 2) * pose.scale;
        const top = pose.rise + (part.position[1] + part.size[1] / 2) * pose.scale;
        expect(bottom).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThanOrEqual(height + 1e-10);
        if (level === 100) expect(bottom).toBeGreaterThan(height * 0.98);
      }
    }
    expect(parts).toEqual(snapshot);
  });
});
