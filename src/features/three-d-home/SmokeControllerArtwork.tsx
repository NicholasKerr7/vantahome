import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { createSmokeArtwork } from '../../../packages/home-scene/src/smokeArtwork';
import type { SmokeControllerState } from '../../../packages/home-scene/src/smokeController';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { smokeControllerStyles as styles } from './SmokeControllerStyles';

/** Match Home's sculpted detector and steady signal ring without an idle animation loop. */
export function SmokeControllerArtwork({ tone, size }: { tone: SmokeControllerState['tone']; size: 'full' | 'medium' | 'compact' }) {
  const prefix = `${useId().replace(/:/g, '')}-smoke`;
  return <View testID="smoke-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, size === 'medium' && styles.artworkMedium, size === 'compact' && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 220" aria-hidden><EquipmentArtworkSvg drawing={createSmokeArtwork(prefix, tone)} /></Svg>
  </View>;
}
