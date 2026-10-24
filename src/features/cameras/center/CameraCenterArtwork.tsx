import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../../../theme/theme';
import type { CameraCenterCamera } from './CameraCenterTypes';
import { cameraCenterStyles as styles } from './CameraCenterStyles';

/** Bundled generated references are visual samples, never captured footage or verified property coverage. */
export const cameraCenterArtworkSources = {
  entry: require('../../../../assets/cinematic/device-gate.jpg'),
  driveway: require('../../../../assets/cinematic/room-grounds.jpg'),
  terrace: require('../../../../assets/cinematic/device-window.jpg'),
  generic: require('../../../../assets/cinematic/room-grounds.jpg'),
} as const;

/** Show an aspect-preserving packaged illustration with no URL, audio, persistent media cache or animation loop. */
export function CameraCenterArtwork({ view }: { view: CameraCenterCamera['view'] }) {
  const [failedView, setFailedView] = useState<CameraCenterCamera['view'] | null>(null);
  return <View testID={`camera-center-art-${view}`} style={styles.artwork} accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
    {failedView === view ? <View style={[styles.stage, styles.unavailable]}>
      <Ionicons name="image-outline" size={28} color={theme.colors.accentText} />
      <Text style={styles.unavailableTitle}>Illustration unavailable</Text>
    </View> : <Image source={cameraCenterArtworkSources[view]} style={styles.artworkImage} contentFit="contain"
      cachePolicy="memory" recyclingKey={`camera-center-${view}`} transition={0} accessible={false}
      onError={() => setFailedView(view)} />}
  </View>;
}
