import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import siteLayout from '../site-layout.json';
import { getLandscapeFramingPoints } from './siteGeometry';
import {
  advanceCinematicTour, CINEMATIC_MAX_FRAME_SECONDS, CINEMATIC_TOUR_DURATION,
  createCinematicTourFrame, getCinematicGateOpen, sampleCinematicTour,
} from './cinematicTour';

describe('authored exterior property tour', () => {
  it.each([0.3, 0.46, 0.75, 1, 1.5, 2.4, 3])('keeps every camera position outside the house and all projection values finite at aspect %s', (aspect) => {
    const frame = createCinematicTourFrame();
    for (let time = 0; time < CINEMATIC_TOUR_DURATION; time += 0.04) {
      sampleCinematicTour(time, aspect, frame);
      expect([...frame.eye, ...frame.target, frame.fov, frame.gateOpen].every(Number.isFinite)).toBe(true);
      expect(frame.fov).toBeGreaterThanOrEqual(28);
      expect(frame.fov).toBeLessThanOrEqual(50);
      expect(frame.gateOpen).toBeGreaterThanOrEqual(0);
      expect(frame.gateOpen).toBeLessThanOrEqual(1);
      // Includes a margin around the complete roof/wall envelope, not just the occupied rooms.
      const [x, y, z] = frame.eye;
      expect(x < -1.7 || x > 18.3 || z < -17.9 || z > 1.7 || y > 8.9).toBe(true);
    }
  });

  it.each([0.3, 0.46, 0.75, 1.5, 2.4])('frames both gate posts for the opening shot at aspect %s', (aspect) => {
    for (const time of [0, 3, 6]) {
      const frame = sampleCinematicTour(time, aspect);
      const camera = new PerspectiveCamera(frame.fov, aspect, 0.08, 500);
      camera.position.set(...frame.eye);
      camera.lookAt(new Vector3(...frame.target));
      camera.updateMatrixWorld();
      const { position, width } = siteLayout.runtime.gate;
      for (const sign of [-1, 1]) {
        const projected = new Vector3(position[0] + sign * (width / 2 + 0.4), 1, position[2]).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(0.96);
        expect(Math.abs(projected.y)).toBeLessThan(0.96);
      }
    }
  });

  it.each([0.3, 0.46, 0.75, 1.5, 2.4])('establishes the entire parcel, corner lights and road at aspect %s', (aspect) => {
    const frame = sampleCinematicTour(41, aspect);
    const camera = new PerspectiveCamera(frame.fov, aspect, 0.08, 500);
    camera.position.set(...frame.eye);
    camera.lookAt(new Vector3(...frame.target));
    camera.updateMatrixWorld();
    for (const point of getLandscapeFramingPoints()) {
      const projected = new Vector3(...point).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.96);
      expect(Math.abs(projected.y)).toBeLessThan(0.96);
    }
    const detail = sampleCinematicTour(46, aspect);
    expect(new Vector3(...frame.eye).distanceTo(new Vector3(...frame.target)))
      .toBeGreaterThan(new Vector3(...detail.eye).distanceTo(new Vector3(...detail.target)));
  });

  it.each([0.46, 0.75, 1.5, 2.4])('passes through the gate opening only after it is fully open at aspect %s', (aspect) => {
    let previous = sampleCinematicTour(0, aspect).eye[2];
    let crossingCount = 0;
    for (let time = 0.02; time < 24; time += 0.02) {
      const frame = sampleCinematicTour(time, aspect);
      const gateZ = -22.75;
      if (previous < gateZ && frame.eye[2] >= gateZ) {
        crossingCount += 1;
        expect(frame.gateOpen).toBe(1);
        expect(frame.eye[0]).toBeGreaterThan(-12.7);
        expect(frame.eye[0]).toBeLessThan(-6.88);
        expect(frame.eye[1]).toBeLessThan(3);
      }
      previous = frame.eye[2];
    }
    expect(crossingCount).toBe(1);
  });

  it('loops continuously with no cut in position, target, lens, or presentation gate', () => {
    const start = sampleCinematicTour(0, 0.75);
    const end = sampleCinematicTour(CINEMATIC_TOUR_DURATION, 0.75);
    expect(end).toEqual(start);
    for (const time of [6, 11, 16, 24, 34, 41, 46, 57, 64, 71, 78, 84]) {
      const before = sampleCinematicTour(time - 0.0001, 0.75);
      const after = sampleCinematicTour(time + 0.0001, 0.75);
      expect(new Vector3(...before.eye).distanceTo(new Vector3(...after.eye))).toBeLessThan(0.001);
      expect(new Vector3(...before.target).distanceTo(new Vector3(...after.target))).toBeLessThan(0.001);
      expect(Math.abs(before.fov - after.fov)).toBeLessThan(0.001);
      expect(Math.abs(before.gateOpen - after.gateOpen)).toBeLessThan(0.001);
    }
  });

  it('visits the arrival, driveway, crane, overhead, side, hero and return shots in an 84-second loop', () => {
    const shots = new Set(Array.from({ length: 84 }, (_, time) => sampleCinematicTour(time, 1).shot));
    expect([...shots]).toEqual(['arrival', 'driveway', 'crane', 'overhead', 'east', 'hero', 'return']);
    expect(sampleCinematicTour(41, 1).eye[1]).toBeGreaterThan(30);
    expect(sampleCinematicTour(57, 1).eye[0]).toBeGreaterThan(25);
    expect(CINEMATIC_TOUR_DURATION).toBeGreaterThanOrEqual(60);
    expect(CINEMATIC_TOUR_DURATION).toBeLessThanOrEqual(90);
  });

  it('closes the presentation gate before the next arrival and never touches real device state', () => {
    expect(getCinematicGateOpen(0)).toBe(0);
    expect(getCinematicGateOpen(4)).toBe(0);
    expect(getCinematicGateOpen(7)).toBeCloseTo(0.5);
    expect(getCinematicGateOpen(10)).toBe(1);
    expect(getCinematicGateOpen(62)).toBe(1);
    expect(getCinematicGateOpen(69)).toBe(0);
    expect(getCinematicGateOpen(83)).toBe(0);
    // Only this caller-owned frame contains gate motion; no command or scene-store API is involved.
    const frame = createCinematicTourFrame();
    expect(sampleCinematicTour(14, 1, frame).gateOpen).toBe(1);
    expect(Object.keys(frame).sort()).toEqual(['active', 'chapter', 'elapsed', 'eye', 'fov', 'gateOpen', 'shot', 'target']);
  });

  it('reuses its frame and vectors instead of allocating per animation frame', () => {
    const frame = createCinematicTourFrame();
    const { eye, target } = frame;
    for (let index = 0; index < 100; index += 1) expect(advanceCinematicTour(frame, 1 / 60, 0.75)).toBe(frame);
    expect(frame.eye).toBe(eye);
    expect(frame.target).toBe(target);
  });

  it('advances deterministically across normal frame rates and bounds catch-up after a pause', () => {
    const slow = createCinematicTourFrame();
    const fast = createCinematicTourFrame();
    for (let count = 0; count < 400; count += 1) advanceCinematicTour(slow, 1 / 20, 1);
    for (let count = 0; count < 1200; count += 1) advanceCinematicTour(fast, 1 / 60, 1);
    expect(slow.elapsed).toBeCloseTo(fast.elapsed, 8);
    expect(new Vector3(...slow.eye).distanceTo(new Vector3(...fast.eye))).toBeLessThan(1e-8);
    const elapsed = fast.elapsed;
    advanceCinematicTour(fast, 300, 1);
    expect(fast.elapsed - elapsed).toBeCloseTo(CINEMATIC_MAX_FRAME_SECONDS);
    for (const invalid of [NaN, Infinity, -1]) {
      const previous = fast.elapsed;
      advanceCinematicTour(fast, invalid, 1);
      expect(fast.elapsed).toBe(previous);
    }
  });

  it.each([NaN, Infinity, -1])('provides safe finite fallback values for invalid input %s', (invalid) => {
    const frame = sampleCinematicTour(invalid, invalid);
    expect(frame.elapsed).toBe(0);
    expect(frame.gateOpen).toBe(0);
    expect([...frame.eye, ...frame.target, frame.fov].every(Number.isFinite)).toBe(true);
  });
});
