import { useEffect, useRef } from "react";
import { createViewportManipulationTracker } from "./viewportManipulation";

/** Dim phone hotspots during canvas manipulation without intercepting camera, button, or keyboard input. */
export function useViewportManipulation() {
  const viewportRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const tracker = createViewportManipulationTracker((active) =>
      viewport.classList.toggle("is-manipulating", active),
    );

    /** Ignore hotspot and overlay presses; OrbitControls owns the canvas event itself. */
    function start(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("canvas")) {
        tracker.start(event.pointerId, event.clientX, event.clientY);
      }
    }
    /** Document listeners receive releases even when a drag ends outside the viewport. */
    function move(event: PointerEvent) {
      tracker.move(event.pointerId, event.clientX, event.clientY);
    }
    /** Release and cancel have the same visual cleanup while leaving input behavior unchanged. */
    function end(event: PointerEvent) {
      tracker.end(event.pointerId);
    }
    /** Backgrounding can cancel a pointer sequence without delivering its final up event. */
    function visibilityChanged() {
      if (document.hidden) tracker.reset();
    }

    viewport.addEventListener("pointerdown", start, {
      passive: true,
      capture: true,
    });
    document.addEventListener("pointermove", move, {
      passive: true,
      capture: true,
    });
    document.addEventListener("pointerup", end, {
      passive: true,
      capture: true,
    });
    document.addEventListener("pointercancel", end, {
      passive: true,
      capture: true,
    });
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("blur", tracker.reset);
    return () => {
      viewport.removeEventListener("pointerdown", start, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("blur", tracker.reset);
      tracker.reset();
    };
  }, []);

  return viewportRef;
}
