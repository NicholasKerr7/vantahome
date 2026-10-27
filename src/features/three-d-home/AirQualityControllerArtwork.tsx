import React, { useId } from 'react';
import { Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { createAirQualityEquipmentArtwork } from '../../../packages/home-scene/src/airQualityArtwork';
import type { AirQualityControllerState } from '../../../packages/home-scene/src/airQualityController';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { airQualityControllerStyles as styles } from './AirQualityControllerStyles';

/** Present a fixed sample inside the shared ceramic sensor without suggesting live sampling motion. */
export function AirQualityControllerArtwork({ air, compact }: { air: AirQualityControllerState; compact: boolean }) {
  const prefix = `${useId().replace(/:/g, '')}-air-quality`;
  return <View testID="air-quality-preview-model" style={[styles.artwork, compact && styles.artworkCompact]}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.artworkLayer}>
      <Svg width="100%" height="100%" viewBox="0 0 280 220" aria-hidden>
        <EquipmentArtworkSvg drawing={createAirQualityEquipmentArtwork(prefix, air.tone)} />
      </Svg>
    </View>
    <View accessible accessibilityLabel={air.aqi === null ? 'AQI sample unavailable' : `AQI sample: ${air.aqi}`} pointerEvents="none" style={styles.screen}>
      <Text maxFontSizeMultiplier={1.25} style={styles.sampleLabel}>SAMPLE</Text>
      <Text maxFontSizeMultiplier={1.25} style={[styles.aqiValue, compact && styles.aqiValueCompact, air.tone === 'exceeded' && styles.aqiExceeded, air.tone === 'unknown' && styles.aqiUnknown]}>{air.aqi ?? '—'}</Text>
      <Text maxFontSizeMultiplier={1.25} style={styles.aqiUnit}>AQI</Text>
    </View>
  </View>;
}
