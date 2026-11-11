import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { fanRotorSegmentProgress, fanRotorTransitionVelocity, planFanRotorTransition, type FanRotorSegment } from '../../../packages/home-scene/src/fanRotorMotion';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { createDeviceRotorStyle } from './deviceRotorMotionStyles';
import { useControllerFocused } from './useControllerFocused';

interface RotorTravel {
  velocity: number;
  startedAt: number;
  steps: readonly FanRotorSegment[];
}

/** Run finite inertial transitions and steady rotation on the native driver while visible. */
export function useCeilingFanMotion(velocity: number, motionAllowed: boolean) {
  const focused = useControllerFocused();
  const allowed = useDecorativeMotion(motionAllowed && focused);
  const rotation = useRef(new Animated.Value(0)).current;
  const travel = useRef<RotorTravel>({ velocity: 0, startedAt: 0, steps: [] });
  const rotorStyle = useMemo(() => createDeviceRotorStyle(rotation), [rotation]);

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;
    // Invalidate momentum immediately, even if the native stop callback arrives after focus returns.
    if (!allowed || !Number.isFinite(velocity)) travel.current = { velocity: 0, startedAt: 0, steps: [] };

    /** A completed ramp continues at constant speed without React updates or JavaScript frames. */
    function startSteady(phase: number): void {
      if (cancelled) return;
      travel.current = { velocity, startedAt: 0, steps: [] };
      if (velocity === 0) return;
      const start = phase % 1;
      rotation.setValue(start);
      animation = Animated.loop(Animated.timing(rotation, {
        toValue: start + Math.sign(velocity),
        duration: Math.max(100, Math.round(2 * Math.PI / Math.abs(velocity) * 1000)),
        easing: Easing.linear, useNativeDriver: true, isInteraction: false,
      }));
      animation.start();
    }

    rotation.stopAnimation((phase) => {
      if (cancelled) return;
      if (!allowed || !Number.isFinite(velocity)) {
        travel.current = { velocity: 0, startedAt: 0, steps: [] };
        return;
      }
      let target = Number.isFinite(phase) ? phase % 1 : 0;
      rotation.setValue(target);
      const steps = planFanRotorTransition(travel.current.velocity, velocity);
      if (!steps.length) { startSteady(target); return; }
      travel.current = { velocity: travel.current.velocity, startedAt: performance.now(), steps };
      const timings = steps.map((step) => {
        target += step.turns;
        return Animated.timing(rotation, {
          toValue: target, duration: step.durationMs,
          easing: (progress) => fanRotorSegmentProgress(step, progress),
          useNativeDriver: true, isInteraction: false,
        });
      });
      const finalPhase = target;
      animation = Animated.sequence(timings);
      animation.start(({ finished }) => { if (finished && !cancelled) startSteady(finalPhase); });
    });
    return () => {
      cancelled = true;
      const previous = travel.current;
      travel.current = { velocity: previous.steps.length
        ? fanRotorTransitionVelocity(previous.steps, performance.now() - previous.startedAt) : previous.velocity,
      startedAt: 0, steps: [] };
      animation?.stop();
      rotation.stopAnimation();
    };
  }, [allowed, rotation, velocity]);

  return rotorStyle;
}
