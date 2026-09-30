type PointerOrigin = { x: number; y: number };

/** Track meaningful canvas gestures without classifying a tap as an orbit. */
export function createViewportManipulationTracker(
  onChange: (active: boolean) => void,
) {
  const pointers = new Map<number, PointerOrigin>();
  let active = false;

  /** Notify only at gesture boundaries, never once per pointer frame. */
  function setActive(next: boolean) {
    if (active === next) return;
    active = next;
    onChange(next);
  }

  return {
    /** Only pointers that began on the canvas participate in camera gestures. */
    start(id: number, x: number, y: number) {
      pointers.set(id, { x, y });
      if (pointers.size > 1) setActive(true);
    },
    /** Leave ordinary taps and slight finger drift untouched. */
    move(id: number, x: number, y: number) {
      const origin = pointers.get(id);
      if (origin && Math.hypot(x - origin.x, y - origin.y) > 8) setActive(true);
    },
    /** Keep a pinch active until its final finger has been released or cancelled. */
    end(id: number) {
      pointers.delete(id);
      if (!pointers.size) setActive(false);
    },
    /** Clear interrupted gestures on app blur, visibility loss, or unmount. */
    reset() {
      pointers.clear();
      setActive(false);
    },
  };
}
