import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { createGasMeterArtwork } from '../../../packages/home-scene/src/gasMeterArtwork';
import type { GasMeterSnapshot } from '../../../packages/home-scene/src/gasMeterController';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { gasMeterControllerStyles as styles } from './GasMeterControllerStyles';

/** Share Home's metal meter and accepted valve geometry without an animation loop. */
export function GasMeterControllerArtwork({ meter, compact }: { meter: GasMeterSnapshot; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-gasMeter`;
  return <View testID="gas-meter-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 210" aria-hidden><EquipmentArtworkSvg drawing={createGasMeterArtwork(prefix, meter)} /></Svg>
  </View>;
}
