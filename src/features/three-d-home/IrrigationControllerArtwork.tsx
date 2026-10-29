import React, { useId } from 'react';
import { Animated, View } from 'react-native';
import Svg from 'react-native-svg';
import { createIrrigationEquipmentArtwork, createIrrigationSprayArtwork } from '../../../packages/home-scene/src/irrigationArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';
import { irrigationControllerStyles as styles } from './IrrigationControllerStyles';

/** Share the exact lightweight nozzle and spray geometry with Home's embedded console. */
export function IrrigationControllerArtwork({ on, compact, motionAllowed }: { on: boolean; compact: boolean; motionAllowed: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-irrigation`;
  const motionStyle = useEquipmentPulseMotion(on, motionAllowed);
  return <View testID="irrigation-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 280 210" aria-hidden><EquipmentArtworkSvg drawing={createIrrigationEquipmentArtwork(prefix, on)} /></Svg>
    {on && <Animated.View testID="irrigation-preview-spray" pointerEvents="none" style={[styles.layer, motionStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 280 210" aria-hidden><EquipmentArtworkSvg drawing={createIrrigationSprayArtwork(prefix)} /></Svg>
    </Animated.View>}
  </View>;
}
