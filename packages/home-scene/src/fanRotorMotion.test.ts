import { describe, expect, it } from 'vitest';
import { fanRotorSegmentProgress, fanRotorTransitionVelocity, planFanRotorTransition } from './fanRotorMotion';

describe('ceiling fan decorative momentum', () => {
  it('integrates acceleration and coast-down without changing their endpoints', () => {
    const [start] = planFanRotorTransition(0, 8);
    const [stop] = planFanRotorTransition(8, 0);
    expect(start.durationMs).toBe(500);
    expect(start.turns).toBeCloseTo(4 * 0.5 / (2 * Math.PI));
    expect(fanRotorTransitionVelocity([start], 250)).toBe(4);
    expect(fanRotorSegmentProgress(start, 0.5)).toBe(0.25);
    expect(stop.durationMs).toBe(420);
    expect(fanRotorTransitionVelocity([stop], 210)).toBe(4);
    expect(fanRotorSegmentProgress(stop, 0.5)).toBe(0.75);
    for (const step of [start, stop]) {
      expect(fanRotorSegmentProgress(step, -1)).toBe(0);
      expect(fanRotorSegmentProgress(step, 2)).toBe(1);
    }
  });

  it.each([8, -8])('passes through complete rest before reversing velocity %s', (speed) => {
    const steps = planFanRotorTransition(speed, -speed);
    expect(steps).toHaveLength(3);
    expect(fanRotorTransitionVelocity(steps, 0)).toBe(speed);
    expect(fanRotorTransitionVelocity(steps, 210)).toBe(speed / 2);
    expect(fanRotorTransitionVelocity(steps, 420)).toBe(0);
    expect(fanRotorTransitionVelocity(steps, 460)).toBe(0);
    expect(fanRotorTransitionVelocity(steps, 750)).toBe(-speed / 2);
    expect(fanRotorTransitionVelocity(steps, 1000)).toBe(-speed);
    expect(fanRotorTransitionVelocity(steps, 5000)).toBe(-speed);
    expect(steps[1].turns).toBe(0);
    expect(fanRotorSegmentProgress(steps[1], 0.5)).toBe(0.5);
  });

  it('rebases a rapid speed change on the already displayed velocity', () => {
    const initial = planFanRotorTransition(0, 10);
    const shown = fanRotorTransitionVelocity(initial, 200);
    const next = planFanRotorTransition(shown, 6);
    expect(next[0].fromVelocity).toBe(4);
    expect(fanRotorTransitionVelocity(next, 0)).toBe(shown);
    expect(fanRotorTransitionVelocity(next, 360)).toBe(6);
    expect(fanRotorSegmentProgress(next[0], 0.5)).toBeCloseTo(0.45);
  });

  it('allocates no transition for steady speed and recovers invalid prior input safely', () => {
    expect(planFanRotorTransition(8, 8)).toEqual([]);
    expect(planFanRotorTransition(0, Number.NaN)).toEqual([]);
    expect(planFanRotorTransition(Number.POSITIVE_INFINITY, 8)[0].fromVelocity).toBe(0);
    expect(fanRotorTransitionVelocity([], 100)).toBe(0);
  });
});
