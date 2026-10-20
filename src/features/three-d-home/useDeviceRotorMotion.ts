import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Animated, Easing } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { createDeviceRotorStyle } from './deviceRotorMotionStyles';

/** Observe focus when a controller lives on a retained route, with a safe standalone preview fallback. */
function useControllerFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((notify: () => void) => {
    if (!navigation) return () => undefined;
    const offFocus = navigation.addListener('focus', notify);
    const offBlur = navigation.addListener('blur', notify);
    return () => { offFocus(); offBlur(); };
  }, [navigation]);
  const readFocus = useCallback(() => navigation?.isFocused() ?? true, [navigation]);
  return useSyncExternalStore(subscribe, readFocus, readFocus);
}

/** Rotate on the native driver only while visible and permitted; speed changes preserve the current phase. */
export function useDeviceRotorMotion(velocity: number, motionAllowed: boolean) {
  const focused = useControllerFocused();
  const allowed = useDecorativeMotion(motionAllowed && focused);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotorStyle = useMemo(() => createDeviceRotorStyle(rotation), [rotation]);

  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    rotation.stopAnimation((phase) => {
      if (cancelled || !allowed || !Number.isFinite(velocity) || velocity === 0) return;
      // Full turns have the same visual phase, so rebasing prevents an indefinitely growing value.
      const start = Number.isFinite(phase) ? phase % 1 : 0;
      rotation.setValue(start);
      loop = Animated.loop(Animated.timing(rotation, {
        toValue: start + Math.sign(velocity),
        duration: Math.max(100, Math.round((2 * Math.PI / Math.abs(velocity)) * 1000)),
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }));
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
      rotation.stopAnimation();
    };
  }, [allowed, rotation, velocity]);

  return rotorStyle;
}
