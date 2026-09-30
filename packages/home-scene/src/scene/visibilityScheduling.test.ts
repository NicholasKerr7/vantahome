import { describe, expect, it, vi } from "vitest";
import { bindSceneVisibilityScheduling } from "./visibilityScheduling";

/** Exercise the real subscription lifecycle without mounting a WebGL renderer. */
function visibilitySource(hidden = false) {
  const events = new EventTarget();
  const page = {
    hidden,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return {
    page,
    /** Deliver the same event the browser emits after a visibility transition. */
    change(next: boolean) {
      page.hidden = next;
      events.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

describe("scene visibility scheduling", () => {
  it("keeps a visible covered canvas on demand, permitting resize and asset invalidations", () => {
    const source = visibilitySource();
    const setFrameloop = vi.fn();
    const invalidate = vi.fn();
    const dispose = bindSceneVisibilityScheduling(
      source.page,
      true,
      setFrameloop,
      invalidate,
    );
    expect(setFrameloop.mock.calls).toEqual([["demand"]]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    source.change(true);
    expect(setFrameloop).toHaveBeenLastCalledWith("never");
    expect(invalidate).toHaveBeenCalledTimes(1);
    source.change(false);
    expect(setFrameloop).toHaveBeenLastCalledWith("demand");
    expect(invalidate).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("restores continuous rendering after dismissal without retaining the old covered listener", () => {
    const source = visibilitySource();
    const setFrameloop = vi.fn();
    const invalidate = vi.fn();
    const dismiss = bindSceneVisibilityScheduling(
      source.page,
      true,
      setFrameloop,
      invalidate,
    );
    dismiss();
    const dispose = bindSceneVisibilityScheduling(
      source.page,
      false,
      setFrameloop,
      invalidate,
    );
    expect(setFrameloop.mock.calls).toEqual([["demand"], ["always"]]);
    source.change(true);
    source.change(false);
    expect(setFrameloop.mock.calls).toEqual([
      ["demand"],
      ["always"],
      ["never"],
      ["always"],
    ]);
    expect(invalidate).toHaveBeenCalledTimes(3);
    dispose();
    source.change(true);
    expect(setFrameloop).toHaveBeenCalledTimes(4);
  });

  it("does not start a frame while mounting or changing coverage in a hidden document", () => {
    const source = visibilitySource(true);
    const setFrameloop = vi.fn();
    const invalidate = vi.fn();
    const covered = bindSceneVisibilityScheduling(
      source.page,
      true,
      setFrameloop,
      invalidate,
    );
    covered();
    const dispose = bindSceneVisibilityScheduling(
      source.page,
      false,
      setFrameloop,
      invalidate,
    );
    expect(setFrameloop.mock.calls).toEqual([["never"], ["never"]]);
    expect(invalidate).not.toHaveBeenCalled();
    source.change(false);
    expect(setFrameloop).toHaveBeenLastCalledWith("always");
    expect(invalidate).toHaveBeenCalledTimes(1);
    dispose();
  });
});
