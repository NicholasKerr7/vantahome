import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CINEMATIC_IDLE_MS, createIdleCinematicController } from './idleCinematic';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('idle cinematic deadline', () => {
  it('requires 90 quiet seconds and keeps only one timer during frequent movement', () => {
    const start = vi.fn();
    const controller = createIdleCinematicController({ allowed: () => true, start, stop: vi.fn() });
    controller.activity();
    vi.advanceTimersByTime(CINEMATIC_IDLE_MS - 1000);
    for (let index = 0; index < 200; index++) controller.activity();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(CINEMATIC_IDLE_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    controller.dispose();
  });

  it('checks eligibility at delivery and starts a fresh interval after a blocker clears', () => {
    let allowed = true;
    const start = vi.fn();
    const stop = vi.fn();
    const controller = createIdleCinematicController({ allowed: () => allowed, start, stop });
    controller.activity();
    allowed = false;
    vi.advanceTimersByTime(CINEMATIC_IDLE_MS * 3);
    expect(start).not.toHaveBeenCalled();
    allowed = true;
    controller.activity();
    vi.advanceTimersByTime(CINEMATIC_IDLE_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledOnce();
    controller.activity();
    expect(stop).toHaveBeenCalled();
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(CINEMATIC_IDLE_MS * 2);
    expect(start).toHaveBeenCalledOnce();
  });
});
