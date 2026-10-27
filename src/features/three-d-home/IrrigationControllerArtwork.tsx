import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg from 'react-native-svg';
import { createIrrigationEquipmentArtwork, createIrrigationSprayArtwork } from '../../../packages/home-scene/src/irrigationArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useControllerFocused } from './useControllerFocused';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { irrigationControllerStyles as styles, irrigationSprayStyle } from './IrrigationControllerStyles';

/** Pulse only the spray on the native driver; suspend on blur, background and reduced motion. */
function useSprayMotion(on: boolean, motionAllowed: boolean) {
  const focused = useControllerFocused();
  const allowed = useDecorativeMotion(on && focused && motionAllowed);
  const opacity = useRef(new Animated.Value(.75)).current;
  const layerStyle = useMemo(() => irrigationSprayStyle(opacity), [opacity]);
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

/** Share the exact lightweight nozzle and spray geometry with Home's embedded console. */
export function IrrigationControllerArtwork({ on, compact, motionAllowed }: { on: boolean; compact: boolean; motionAllowed: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-irrigation`;
  const motionStyle = useSprayMotion(on, motionAllowed);
  return <View testID="irrigation-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 280 210" aria-hidden><EquipmentArtworkSvg drawing={createIrrigationEquipmentArtwork(prefix, on)} /></Svg>
    {on && <Animated.View testID="irrigation-preview-spray" pointerEvents="none" style={[styles.layer, motionStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 280 210" aria-hidden><EquipmentArtworkSvg drawing={createIrrigationSprayArtwork(prefix)} /></Svg>
    </Animated.View>}
  </View>;
}
