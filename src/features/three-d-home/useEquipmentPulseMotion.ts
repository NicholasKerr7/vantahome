import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useControllerFocused } from './useControllerFocused';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';

/** Bind native animated opacity through one reusable style factory. */
function equipmentPulseStyle(opacity: Animated.Value) { return { opacity }; }

/** Pulse one decorative layer on the native driver, suspended on blur, background or reduced motion. */
export function useEquipmentPulseMotion(on: boolean, motionAllowed: boolean) {
  const focused = useControllerFocused();
  const allowed = useDecorativeMotion(on && focused && motionAllowed);
  const opacity = useRef(new Animated.Value(.75)).current;
  const layerStyle = useMemo(() => equipmentPulseStyle(opacity), [opacity]);
  useEffect(() => {
    opacity.setValue(.75);
    if (!allowed) return;
    const options = { duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false };
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { ...options, toValue: .45 }),
      Animated.timing(opacity, { ...options, toValue: .95 }),
    ]));
    animation.start();
    return () => { animation.stop(); opacity.stopAnimation(); opacity.setValue(.75); };
  }, [allowed, opacity]);
  return layerStyle;
}
