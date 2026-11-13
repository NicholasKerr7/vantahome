import React, { useId } from 'react';
import { Animated, View } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { SPEAKER_ARTWORK_VIEWBOX, createSpeakerCabinetArtwork, createSpeakerPlaybackArtwork } from '../../../packages/home-scene/src/speakerArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';
import { useEquipmentPulseMotion } from './useEquipmentPulseMotion';
import { speakerControllerStyles as styles } from './SpeakerControllerStyles';

/** Keep the shared cabinet still; only accepted audible preview state reveals its acoustic light. */
export function SpeakerControllerArtwork({ active, compact, motionAllowed }: {
  active: boolean; compact: boolean; motionAllowed: boolean;
}) {
  const prefix = `${useId().replace(/:/g, '')}-speaker`;
  const motionStyle = useEquipmentPulseMotion(active, motionAllowed);
  return <View testID="speaker-preview-model" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox={SPEAKER_ARTWORK_VIEWBOX} aria-hidden>
      <EquipmentArtworkSvg drawing={createSpeakerCabinetArtwork(prefix)} />
    </Svg>
    <Animated.View pointerEvents="none" style={[styles.artworkLayer, motionStyle]}>
      <Svg width="100%" height="100%" viewBox={SPEAKER_ARTWORK_VIEWBOX} aria-hidden>
        <G testID="speaker-preview-indicator" opacity={active ? 1 : 0}>
          {active && <EquipmentArtworkSvg drawing={createSpeakerPlaybackArtwork(prefix)} />}
        </G>
      </Svg>
    </Animated.View>
  </View>;
}
