import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { createCooktopArtwork } from '../../../packages/home-scene/src/cooktopArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { cooktopControllerStyles as styles } from './CooktopControllerStyles';

/** Render the shared glass cooktop from accepted power and heat without independent zone controls. */
export function CooktopControllerArtwork({ on, heat, compact }: { on: boolean; heat: number | null; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-cooktop`;
  return <View testID="cooktop-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 360 230" aria-hidden>
      <EquipmentArtworkSvg drawing={createCooktopArtwork(prefix, on, heat)} />
    </Svg>
  </View>;
}
