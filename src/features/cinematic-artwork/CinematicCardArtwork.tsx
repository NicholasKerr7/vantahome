import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme/theme';
import type { ArtworkKey } from './artwork';
import { cinematicArtworkAssets } from './cinematicArtworkAssets';

type Props = { artwork: ArtworkKey; variant?: 'background' | 'thumbnail'; testID?: string };
const VERTICAL_SCRIM = ['rgba(15, 7, 32, 0.58)', 'rgba(15, 7, 32, 0.20)', 'rgba(15, 7, 32, 0.94)'] as const;
const HORIZONTAL_SCRIM = ['rgba(15, 7, 32, 0.55)', 'rgba(15, 7, 32, 0.04)'] as const;
const VERTICAL_STOPS = [0, 0.4, 1] as const;
const LEFT = { x: 0, y: 0.5 };
const RIGHT = { x: 1, y: 0.5 };

/** Paint a bundled reference image without adding layout height, touch targets, or live-state claims. */
export default function CinematicCardArtwork({ artwork, variant = 'background', testID }: Props) {
  const [failedArtwork, setFailedArtwork] = useState<ArtworkKey | null>(null);
  const source = cinematicArtworkAssets[failedArtwork === artwork ? 'device-generic' : artwork]
    ?? cinematicArtworkAssets['device-generic'];
  const thumbnail = variant === 'thumbnail';
  return <View
    testID={testID ?? `cinematic-artwork-${artwork}`}
    style={thumbnail ? styles.thumbnail : styles.background}
    pointerEvents="none"
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  >
    <Image
      source={source}
      style={styles.image}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={artwork}
      transition={0}
      accessible={false}
      onError={() => setFailedArtwork(artwork)}
    />
    {!thumbnail && <>
      <LinearGradient colors={VERTICAL_SCRIM} locations={VERTICAL_STOPS} style={styles.image} />
      <LinearGradient colors={HORIZONTAL_SCRIM} start={LEFT} end={RIGHT} style={styles.image} />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  thumbnail: { width: 44, height: 44, flexShrink: 0, overflow: 'hidden', borderRadius: 13, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke },
  image: { ...StyleSheet.absoluteFillObject },
});
