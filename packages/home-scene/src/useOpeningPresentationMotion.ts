import { useLayoutEffect, useState } from 'react';
import { subscribeScenePresentation } from './scenePresentation';

/** Gate short position transitions without an idle loop or any per-frame React updates. */
export function useOpeningPresentationMotion(reduced: boolean) {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let suspended = false;
    /** Snap to accepted positions whenever the surface or motion preference disallows animation. */
    function update() { setVisible(!document.hidden && !media.matches && !suspended); }
    const unsubscribe = subscribeScenePresentation(window, (value) => { suspended = value; update(); });
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      unsubscribe();
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return visible && !reduced;
}
