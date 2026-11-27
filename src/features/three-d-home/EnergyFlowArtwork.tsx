import React from 'react';
import { Animated, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { ENERGY_FLOW_ARTWORK, ENERGY_FLOW_ROUTES, ENERGY_FLOW_VIEWBOX } from '../../../packages/home-scene/src/powerFlowGeometry';
import { sourceFlowDirection, type EnergySourceId } from '../../../packages/home-scene/src/energyFlowInsights';
import type { EnergyFlow } from '../../../packages/home-scene/src/energySimulation';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';
import { energyFlowStyles as styles } from './EnergyFlowStyles';

const SOURCE_IDS: readonly EnergySourceId[] = ['solar', 'battery', 'grid', 'generator'];

/** Share the isometric station artwork while one native-driver pulse illuminates actual source flow. */
export function EnergyFlowArtwork({ flow, selected, compact, motionAllowed }: {
  flow: EnergyFlow | null; selected: EnergySourceId | null; compact: boolean; motionAllowed: boolean;
}) {
  const active = SOURCE_IDS.some((source) => sourceFlowDirection(flow, source) !== 'idle');
  const motionStyle = useEquipmentPulseMotion(active, motionAllowed);
  return <View testID="energy-flow-artwork" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox={ENERGY_FLOW_VIEWBOX} aria-hidden>
      {SOURCE_IDS.map((source) => <Path key={source} d={ENERGY_FLOW_ROUTES[source].d} fill="none" stroke={selected === source ? '#9371AE' : '#3A2C4B'} strokeWidth={selected === source ? 2.5 : 1.5} />)}
      {ENERGY_FLOW_ARTWORK.map((path, index) => <Path key={index} {...path} />)}
    </Svg>
    <Animated.View pointerEvents="none" style={[styles.artworkLayer, motionStyle]}>
      <Svg width="100%" height="100%" viewBox={ENERGY_FLOW_VIEWBOX} aria-hidden>
        {SOURCE_IDS.map((source) => {
          const direction = sourceFlowDirection(flow, source);
          if (direction === 'idle') return null;
          const route = ENERGY_FLOW_ROUTES[source];
          return <G key={source} testID={`energy-flow-route-${source}`} opacity={selected && selected !== source ? 0.35 : 1}>
            <Path d={route.d} fill="none" stroke="#C897F7" strokeWidth={selected === source ? 2.5 : 1.8} />
            <Path testID={`energy-flow-arrow-${source}`} d={direction === 'out' ? route.arrowOut : route.arrowIn} fill="none" stroke="#F1DFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </G>;
        })}
      </Svg>
    </Animated.View>
  </View>;
}
