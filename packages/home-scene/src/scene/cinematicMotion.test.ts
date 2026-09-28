import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { useCinematicStore } from '../cinematicStore';
import { advanceCinematicOrbit, bindCinematicInterruptions, canPlayCinematic } from './cinematicMotion';
import { getLandscapeCamera, getLandscapeFramingPoints } from './siteGeometry';

/** Supply only the document event surface, keeping lifecycle tests independent of a browser. */
class TestPage extends EventTarget {
  hidden = false;
}

afterEach(() => useCinematicStore.getState().setShowcase(false));

describe('cinematic overview motion', () => {
  it('preserves the selected target, zoom distance, and height throughout a full presentation', () => {
    const target = new Vector3(8, 0.4, -8);
    const position = new Vector3(25, 22, 10);
    const distance = position.distanceTo(target);
    const initial = position.clone();
    let elapsed = 0;
    for (let frame = 0; frame < 10_800; frame += 1) elapsed = advanceCinematicOrbit(position, target, elapsed, 1 / 60);
    expect(position.distanceTo(target)).toBeCloseTo(distance, 8);
    expect(position.y).toBe(initial.y);
    expect(target.toArray()).toEqual([8, 0.4, -8]);
    expect(position.distanceTo(initial)).toBeGreaterThan(1);
  });

  it('follows the same path at different frame rates and eases into the opening movement', () => {
    const target = new Vector3();
    const slow = new Vector3(20, 12, 0);
    const fast = slow.clone();
    let slowElapsed = 0;
    let fastElapsed = 0;
    for (let frame = 0; frame < 400; frame += 1) slowElapsed = advanceCinematicOrbit(slow, target, slowElapsed, 1 / 20);
    for (let frame = 0; frame < 1200; frame += 1) fastElapsed = advanceCinematicOrbit(fast, target, fastElapsed, 1 / 60);
    expect(slow.distanceTo(fast)).toBeLessThan(1e-8);
    const opening = new Vector3(20, 12, 0);
    const settled = opening.clone();
    advanceCinematicOrbit(opening, target, 0, 1 / 60);
    advanceCinematicOrbit(settled, target, 20, 1 / 60);
    expect(Math.abs(opening.z)).toBeLessThan(Math.abs(settled.z) / 100);
  });

  it('caps a delayed frame and ignores invalid clock values', () => {
    const target = new Vector3();
    const delayed = new Vector3(20, 12, 0);
    const bounded = delayed.clone();
    expect(advanceCinematicOrbit(delayed, target, 15, 30)).toBeCloseTo(15.08);
    advanceCinematicOrbit(bounded, target, 15, 0.08);
    expect(delayed.equals(bounded)).toBe(true);
    const before = delayed.clone();
    for (const delta of [NaN, Infinity, -1, 0]) expect(advanceCinematicOrbit(delayed, target, 15, delta)).toBe(15);
    expect(delayed.equals(before)).toBe(true);
  });

  it.each([0.48, 0.75, 1, 1.45, 1.9])('keeps the complete fitted property visible throughout playback at aspect %s', (aspect) => {
    const pose = getLandscapeCamera(aspect);
    const target = new Vector3(...pose.target);
    const camera = new PerspectiveCamera(42, aspect, 0.08, 500);
    camera.position.set(...pose.position);
    const points = getLandscapeFramingPoints().map((point) => new Vector3(...point));
    let elapsed = 0;
    for (let frame = 0; frame < 1500; frame += 1) {
      elapsed = advanceCinematicOrbit(camera.position, target, elapsed, 0.05);
      if (frame % 15 !== 0) continue;
      camera.lookAt(target);
      camera.updateMatrixWorld();
      for (const point of points) {
        const projected = point.clone().project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
      }
    }
  });

  it('blocks immersive, reduced-motion, hidden, and suspended scenes', () => {
    for (const view of ['ground', 'upper', 'exterior']) expect(canPlayCinematic(view, false, false, false)).toBe(true);
    expect(canPlayCinematic('immersive', false, false, false)).toBe(false);
    expect(canPlayCinematic('ground', true, false, false)).toBe(false);
    expect(canPlayCinematic('ground', false, true, false)).toBe(false);
    expect(canPlayCinematic('ground', false, false, true)).toBe(false);
  });
});

describe('cinematic input lifecycle', () => {
  it.each(['pointerdown', 'wheel', 'keydown'])('stops immediately on %s without consuming the input', (type) => {
    const page = new TestPage();
    const unbind = bindCinematicInterruptions(page as unknown as Document, () => useCinematicStore.getState().setShowcase(false));
    useCinematicStore.getState().setShowcase(true);
    const event = new Event(type, { cancelable: true });
    page.dispatchEvent(event);
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    unbind();
  });

  it('stops when backgrounded and never starts itself after returning', () => {
    const page = new TestPage();
    const unbind = bindCinematicInterruptions(page as unknown as Document, () => useCinematicStore.getState().setShowcase(false));
    useCinematicStore.getState().setShowcase(true);
    page.hidden = true;
    page.dispatchEvent(new Event('visibilitychange'));
    expect(useCinematicStore.getState().showcase).toBe(false);
    page.hidden = false;
    page.dispatchEvent(new Event('visibilitychange'));
    expect(useCinematicStore.getState().showcase).toBe(false);
    unbind();
  });

  it('lets the explicit stop button own its click so pointerdown cannot restart it', () => {
    const page = new TestPage();
    const stop = vi.fn();
    const unbind = bindCinematicInterruptions(page as unknown as Document, stop);
    const event = new Event('pointerdown');
    Object.defineProperty(event, 'target', { value: { closest: () => ({}) } });
    page.dispatchEvent(event);
    expect(stop).not.toHaveBeenCalled();
    unbind();
  });

  it.each(['wheel', 'keydown'])('still stops on %s over the playback control unless activating its button', (type) => {
    const page = new TestPage();
    const stop = vi.fn();
    const unbind = bindCinematicInterruptions(page as unknown as Document, stop);
    const event = new Event(type);
    Object.defineProperty(event, 'target', { value: { closest: () => ({}) } });
    Object.defineProperty(event, 'key', { value: 'ArrowRight' });
    page.dispatchEvent(event);
    expect(stop).toHaveBeenCalledOnce();
    unbind();
  });

  it('removes all listeners when the scene unmounts', () => {
    const page = new TestPage();
    const stop = vi.fn();
    const unbind = bindCinematicInterruptions(page as unknown as Document, stop);
    unbind();
    page.hidden = true;
    for (const type of ['pointerdown', 'wheel', 'keydown', 'visibilitychange']) page.dispatchEvent(new Event(type));
    expect(stop).not.toHaveBeenCalled();
  });
});
