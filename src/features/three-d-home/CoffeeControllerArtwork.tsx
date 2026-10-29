import React, { useId } from 'react';
import { Animated, View } from 'react-native';
import Svg from 'react-native-svg';
import { createCoffeeEquipmentArtwork, createCoffeeSteamArtwork } from '../../../packages/home-scene/src/coffeeArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';
import { coffeeControllerStyles as styles } from './CoffeeControllerStyles';

/** Share the exact appliance geometry; optional steam reflects accepted preview activity only. */
export function CoffeeControllerArtwork({ on, compact, motionAllowed }: { on: boolean; compact: boolean; motionAllowed: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-coffee`;
  const motionStyle = useEquipmentPulseMotion(on, motionAllowed);
  return <View testID="coffee-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 280 240" aria-hidden><EquipmentArtworkSvg drawing={createCoffeeEquipmentArtwork(prefix, on)} /></Svg>
    {on && <Animated.View testID="coffee-preview-steam" pointerEvents="none" style={[styles.layer, motionStyle]}><Svg width="100%" height="100%" viewBox="0 0 280 240" aria-hidden><EquipmentArtworkSvg drawing={createCoffeeSteamArtwork()} /></Svg></Animated.View>}
  </View>;
}
