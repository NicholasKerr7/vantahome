import React, { useId } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import type { EnergyControllerState } from '../../../packages/home-scene/src/energyController';
import { createEnergyArtwork } from '../../../packages/home-scene/src/energyArtwork';
import { EnergyEquipmentSvg } from './EnergyEquipmentSvg';
import { energyControllerStyles as styles } from './EnergyControllerStyles';

/** Native SVG equipment shares the browser geometry without creating a renderer or animation loop. */
export function EnergyConsoleArtwork({ energy, compact }: { energy: EnergyControllerState; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-energy`;
  const drawing = createEnergyArtwork(prefix, energy);
  return <View testID={`energy-preview-${energy.kind}`}
    style={[styles.preview, energy.kind === 'solar' && !compact && styles.previewSolar, energy.kind === 'energy' && styles.previewMeter, compact && styles.previewCompact]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox={drawing.viewBox} aria-hidden>
      <EnergyEquipmentSvg drawing={drawing} />
    </Svg>
  </View>;
}
