import { useEffect, useRef } from 'react';

/** Keep animation callbacks dormant while the document is hidden. */
export function usePageMotion(reducedMotion: boolean) {
  const canAnimate = useRef(!reducedMotion && !document.hidden);

  useEffect(() => {
    /** Update this inexpensive ref without re-rendering the scene. */
    function updateVisibility() {
      canAnimate.current = !reducedMotion && !document.hidden;
    }
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [reducedMotion]);

  return canAnimate;
}
