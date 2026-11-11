import { useLayoutEffect, useRef, type RefObject } from 'react';
import { fanRotorTransitionVelocity, planFanRotorTransition, type FanRotorSegment } from './fanRotorMotion';
import { subscribeScenePresentation } from './scenePresentation';

/** Keep the steady rotor on the compositor; JavaScript runs only during short speed transitions. */
export function useCeilingFanMotion(rotor: RefObject<HTMLDivElement | null>, velocity: number, reduced: boolean) {
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
    let disposed = false;
    let currentVelocity = 0;
    let targetVelocity = 0;
    let frame: number | null = null;
    let steps: readonly FanRotorSegment[] = [];
    let startedAt = 0;
    let duration = 0;

    /** Preserve blade position across direction changes and pause precisely at zero speed. */
    function applyVelocity(speed: number): void {
      currentVelocity = speed;
      if (speed === 0) { animation.pause(); return; }
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

    /** Stop bounded transition work without discarding the current compositor phase. */
    function cancelTransition(): void {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      steps = [];
    }

    /** Advance only the finite speed envelope; steady rotation needs no frame callback. */
    function tick(time: number): void {
      frame = null;
      if (disposed) return;
      const elapsed = Math.max(0, time - startedAt);
      applyVelocity(fanRotorTransitionVelocity(steps, elapsed));
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else steps = [];
    }

    /** A new command rebases from the speed already shown; lifecycle suspension stops immediately. */
    function update(): void {
      const { velocity: speed, reduced: motionDisabled } = requested.current;
      if (motionDisabled || media.matches || document.hidden || suspended || !Number.isFinite(speed)) {
        cancelTransition();
        currentVelocity = targetVelocity = 0;
        animation.pause();
        return;
      }
      if (speed === targetVelocity && frame !== null) return;
      cancelTransition();
      targetVelocity = speed;
      steps = planFanRotorTransition(currentVelocity, speed);
      if (!steps.length) { applyVelocity(speed); return; }
      duration = steps.reduce((total, step) => total + step.durationMs, 0);
      startedAt = performance.now();
      frame = requestAnimationFrame(tick);
    }

    synchronize.current = update;
    const unsubscribe = subscribeScenePresentation(window, (value) => { suspended = value; update(); });
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      disposed = true;
      synchronize.current = null;
      cancelTransition();
      unsubscribe();
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      animation.cancel();
    };
  }, [rotor]);

  useLayoutEffect(() => { synchronize.current?.(); }, [velocity, reduced]);
}
