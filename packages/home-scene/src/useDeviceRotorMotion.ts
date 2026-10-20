import { useLayoutEffect, useRef, type RefObject } from 'react';
import { subscribeScenePresentation } from './scenePresentation';

/** Keep rotation on the compositor, preserving phase across speed/direction changes without a render loop. */
export function useDeviceRotorMotion(rotor: RefObject<HTMLDivElement | null>, velocity: number, reduced: boolean) {
  const requested = useRef({ velocity, reduced });
  requested.current = { velocity, reduced };
  const synchronize = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const element = rotor.current;
    if (!element || typeof element.animate !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animation = element.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 1000, iterations: Infinity, easing: 'linear' });
    animation.pause();
    let reversed = false;
    let suspended = false;

    /** Mirror the phase when reversing so changing direction never jumps to another blade position. */
    function update() {
      const { velocity: speed, reduced: motionDisabled } = requested.current;
      if (motionDisabled || media.matches || document.hidden || suspended || !Number.isFinite(speed) || speed === 0) {
        animation.pause();
        return;
      }
      const reverse = speed < 0;
      if (reverse !== reversed) {
        const time = typeof animation.currentTime === 'number' ? animation.currentTime : 0;
        animation.effect?.updateTiming({ direction: reverse ? 'reverse' : 'normal' });
        animation.currentTime = Math.floor(time / 1000) * 1000 + (1000 - time % 1000) % 1000;
        reversed = reverse;
      }
      animation.updatePlaybackRate(Math.abs(speed) / (2 * Math.PI));
      animation.play();
    }

    synchronize.current = update;
    const unsubscribe = subscribeScenePresentation(window, (value) => { suspended = value; update(); });
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      synchronize.current = null;
      unsubscribe();
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      animation.cancel();
    };
  }, [rotor]);

  useLayoutEffect(() => { synchronize.current?.(); }, [velocity, reduced]);
}
