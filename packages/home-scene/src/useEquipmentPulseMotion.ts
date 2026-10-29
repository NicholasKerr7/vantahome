import { useLayoutEffect, type RefObject } from 'react';
import { subscribeScenePresentation } from './scenePresentation';

/** Pulse one compositor layer only while its accepted simulation is visible and motion is allowed. */
export function useEquipmentPulseMotion(layer: RefObject<HTMLDivElement | null>, on: boolean, reduced: boolean) {
  useLayoutEffect(() => {
    const element = layer.current;
    if (!on || reduced || !element || typeof element.animate !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let suspended = false;
    let animation: Animation | null = null;
    /** Cancel when covered/backgrounded so the static artwork remains calm and no loop keeps running. */
    function update() {
      const allowed = !media.matches && !document.hidden && !suspended;
      if (!allowed) { animation?.cancel(); animation = null; return; }
      if (!animation) animation = element!.animate([{ opacity: .45 }, { opacity: .95 }, { opacity: .45 }],
        { duration: 2400, iterations: Infinity, easing: 'ease-in-out' });
    }
    const unsubscribe = subscribeScenePresentation(window, (value) => { suspended = value; update(); });
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { unsubscribe(); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); animation?.cancel(); };
  }, [layer, on, reduced]);
}
