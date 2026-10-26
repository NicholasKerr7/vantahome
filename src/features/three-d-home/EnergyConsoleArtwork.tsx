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
  return <View testID={`energy-preview-${energy.kind}`}
    style={[styles.preview, energy.kind === 'solar' && !compact && styles.previewSolar, energy.kind === 'energy' && styles.previewMeter, compact && styles.previewCompact]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 240 160" aria-hidden>
      <EnergyEquipmentSvg drawing={createEnergyArtwork(prefix, energy)} />
    </Svg>
  </View>;
}
