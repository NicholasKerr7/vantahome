import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { createGasLeakArtwork } from '../../../packages/home-scene/src/gasLeakArtwork';
import type { GasLeakSnapshot } from '../../../packages/home-scene/src/gasLeakController';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { gasLeakControllerStyles as styles } from './GasLeakControllerStyles';

/** Match Home's sculpted detector and steady signal ring without an idle animation loop. */
export function GasLeakControllerArtwork({ detector, compact }: { detector: GasLeakSnapshot; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-gasLeak`;
  return <View testID="gas-leak-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 210" aria-hidden><EquipmentArtworkSvg drawing={createGasLeakArtwork(prefix, detector)} /></Svg>
  </View>;
}
