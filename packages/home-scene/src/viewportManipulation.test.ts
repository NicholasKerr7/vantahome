import { describe, expect, it, vi } from "vitest";
import { createViewportManipulationTracker } from "./viewportManipulation";

describe("viewport manipulation boundaries", () => {
  it("preserves taps and slight finger drift without hiding device targets", () => {
    const change = vi.fn();
    const tracker = createViewportManipulationTracker(change);
    tracker.start(1, 50, 50);
    tracker.move(1, 54, 54);
    tracker.end(1);
    expect(change).not.toHaveBeenCalled();
  });

  it("dims once on orbit and restores when released outside the canvas", () => {
    const change = vi.fn();
    const tracker = createViewportManipulationTracker(change);
    tracker.start(1, 50, 50);
    tracker.move(1, 65, 50);
    tracker.move(1, 85, 80);
    expect(change.mock.calls).toEqual([[true]]);
    tracker.end(1);
    expect(change.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps pinch feedback until both pointers end and ignores unrelated pointers", () => {
    const change = vi.fn();
    const tracker = createViewportManipulationTracker(change);
    tracker.move(99, 100, 100);
    tracker.start(1, 50, 50);
    tracker.start(2, 80, 80);
    tracker.end(99);
    tracker.end(1);
    expect(change.mock.calls).toEqual([[true]]);
    tracker.end(2);
    expect(change.mock.calls).toEqual([[true], [false]]);
  });

  it("resets an interrupted gesture and does not retain stale pointers", () => {
    const change = vi.fn();
    const tracker = createViewportManipulationTracker(change);
    tracker.start(1, 0, 0);
    tracker.move(1, 9, 0);
    tracker.reset();
    tracker.reset();
    tracker.move(1, 100, 0);
    tracker.start(2, 0, 0);
    tracker.end(2);
    expect(change.mock.calls).toEqual([[true], [false]]);
  });
});
