import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { createRefrigeratorEquipmentArtwork } from '../../../packages/home-scene/src/refrigeratorArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { refrigeratorControllerStyles as styles } from './RefrigeratorControllerStyles';

/** A quiet sculpted appliance reflects accepted power only, with no simulated temperature telemetry. */
export function RefrigeratorControllerArtwork({ on, compact }: { on: boolean; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-refrigerator`;
  return <View testID="refrigerator-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 280 260" aria-hidden>
      <EquipmentArtworkSvg drawing={createRefrigeratorEquipmentArtwork(prefix, on)} />
    </Svg>
  </View>;
}
