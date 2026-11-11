import React, { useId } from 'react';
import { Animated, View } from 'react-native';
import Svg, { G } from 'react-native-svg';
import {
  CEILING_FAN_BLADE_ANGLES, createCeilingFanBlade, createCeilingFanHousing, createCeilingFanHub,
} from '../../../packages/home-scene/src/ceilingFanArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { fanControllerStyles as styles } from './FanControllerStyles';
import { useCeilingFanMotion } from './useCeilingFanMotion';

interface Props { velocity: number; compact: boolean; motionAllowed: boolean }

/** Keep the suspended housing still while the rotor turns inside a fixed perspective plane. */
export function CeilingFanControllerArtwork({ velocity, compact, motionAllowed }: Props) {
  const id = useId().replace(/:/g, '');
  const rotorStyle = useCeilingFanMotion(velocity, motionAllowed);
  const housing = createCeilingFanHousing(`${id}-housing`);
  const hub = createCeilingFanHub(`${id}-hub`, velocity !== 0);

  return <View testID="fan-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.ceilingArtwork, compact && styles.ceilingArtworkCompact]}>
    <Svg testID="fan-suspended-model" width="100%" height="100%" viewBox={housing.viewBox} style={styles.layer} aria-hidden>
      <EquipmentArtworkSvg drawing={housing} />
    </Svg>
    <View testID="fan-ceiling-plane" pointerEvents="none" style={[styles.ceilingPlane, compact && styles.ceilingPlaneCompact]}>
      <Animated.View testID="fan-preview-rotor" style={[styles.layer, rotorStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 360 360" aria-hidden>
          {CEILING_FAN_BLADE_ANGLES.map((angle) => <G key={angle} transform={`rotate(${angle} 180 180)`}>
            <EquipmentArtworkSvg drawing={createCeilingFanBlade(`${id}-blade-${angle}`)} />
          </G>)}
        </Svg>
      </Animated.View>
    </View>
    <Svg testID="fan-ceiling-hub" width="100%" height="100%" viewBox={hub.viewBox} style={styles.layer} pointerEvents="none" aria-hidden>
      <EquipmentArtworkSvg drawing={hub} />
    </Svg>
  </View>;
}
