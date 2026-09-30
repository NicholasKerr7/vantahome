type SceneFrameLoop = "always" | "demand" | "never";
type VisibilitySource = Pick<
  Document,
  "hidden" | "addEventListener" | "removeEventListener"
>;

/** Keep a covered but visible canvas drawable after resize, asset arrival, or a device-state invalidation. */
export function bindSceneVisibilityScheduling(
  page: VisibilitySource,
  suspended: boolean,
  setFrameloop: (mode: SceneFrameLoop) => void,
  invalidate: () => void,
): () => void {
  /** Hidden documents render nothing; covered documents redraw only when the scene changes. */
  function syncVisibility() {
    const mode = page.hidden ? "never" : suspended ? "demand" : "always";
    setFrameloop(mode);
    if (mode !== "never") invalidate();
  }

  syncVisibility();
  page.addEventListener("visibilitychange", syncVisibility);
  return () => page.removeEventListener("visibilitychange", syncVisibility);
}
