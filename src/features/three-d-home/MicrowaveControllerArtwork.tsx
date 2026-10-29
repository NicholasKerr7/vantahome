import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { createMicrowaveEquipmentArtwork } from '../../../packages/home-scene/src/microwaveArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { microwaveControllerStyles as styles } from './MicrowaveControllerStyles';

/** Match Home's lightweight appliance geometry; power changes the cavity light without an idle loop. */
export function MicrowaveControllerArtwork({ on, compact }: { on: boolean; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-microwave`;
  return <View testID="microwave-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 210" aria-hidden><EquipmentArtworkSvg drawing={createMicrowaveEquipmentArtwork(prefix, on)} /></Svg>
  </View>;
}
