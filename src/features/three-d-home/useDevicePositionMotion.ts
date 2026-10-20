import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { useControllerFocused } from './useControllerFocused';

/** Tween accepted position once; hidden or reduced-motion views snap without replaying an old command. */
export function useDevicePositionMotion(position: number | null, motionAllowed: boolean): Animated.Value {
  const known = position !== null && Number.isFinite(position);
  const target = known ? Math.max(0, Math.min(100, position)) : 0;
  const focused = useControllerFocused();
  const allowed = useDecorativeMotion(motionAllowed && focused);
  const value = useRef(new Animated.Value(target)).current;
  const previousTarget = useRef(target);
  const previousKnown = useRef(known);

  useEffect(() => {
    const changed = target !== previousTarget.current;
    const hadPosition = previousKnown.current;
    previousTarget.current = target;
    previousKnown.current = known;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;
    value.stopAnimation((current) => {
      if (cancelled) return;
      if (!allowed || !changed || !known || !hadPosition) {
        value.setValue(target);
        return;
      }
      // A new accepted command begins at the interrupted presentation, never from an endpoint.
      value.setValue(Number.isFinite(current) ? current : target);
      animation = Animated.timing(value, {
        toValue: target,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      });
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
      value.stopAnimation();
    };
  }, [allowed, known, target, value]);

  return value;
}
