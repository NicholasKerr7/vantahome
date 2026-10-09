import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme/theme';
import type { ArtworkKey } from './artwork';
import { cinematicArtworkAssets } from './cinematicArtworkAssets';

type Props = { artwork: ArtworkKey; variant?: 'background' | 'thumbnail' | 'room-backdrop' | 'room-row' | 'scene-backdrop'; testID?: string };
const VERTICAL_SCRIM = ['rgba(15, 7, 32, 0.58)', 'rgba(15, 7, 32, 0.20)', 'rgba(15, 7, 32, 0.94)'] as const;
const HORIZONTAL_SCRIM = ['rgba(15, 7, 32, 0.55)', 'rgba(15, 7, 32, 0.04)'] as const;
const VERTICAL_STOPS = [0, 0.4, 1] as const;
const LEFT = { x: 0, y: 0.5 };
const RIGHT = { x: 1, y: 0.5 };
// Room photography stays clear outside its labels; each room layout uses only one neutral-plum shade.
const ROOM_BACKDROP_SCRIM = ['rgba(20, 18, 26, 0.04)', 'rgba(20, 18, 26, 0.08)', 'rgba(20, 18, 26, 0.64)', 'rgba(20, 18, 26, 0.84)'] as const;
const ROOM_BACKDROP_STOPS = [0, 0.0625, 0.5, 1] as const;
const ROOM_ROW_SCRIM = ['rgba(20, 18, 26, 0.04)', 'rgba(20, 18, 26, 0.20)', 'rgba(20, 18, 26, 0.64)', 'rgba(20, 18, 26, 0.64)', 'rgba(20, 18, 26, 0.20)', 'rgba(20, 18, 26, 0.04)'] as const;
const ROOM_ROW_STOPS = [0, 0.16, 0.3, 0.7, 0.84, 1] as const;
// Scene names and actions sit at the foot of the image; their shade leaves the upper atmosphere visible.
const SCENE_BACKDROP_SCRIM = ['rgba(20, 18, 26, 0.02)', 'rgba(20, 18, 26, 0.20)', 'rgba(20, 18, 26, 0.68)', 'rgba(20, 18, 26, 0.84)'] as const;
const SCENE_BACKDROP_STOPS = [0, 0.15, 0.42, 1] as const;

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
    {variant === 'background' && <>
      <LinearGradient colors={VERTICAL_SCRIM} locations={VERTICAL_STOPS} style={styles.image} />
      <LinearGradient colors={HORIZONTAL_SCRIM} start={LEFT} end={RIGHT} style={styles.image} />
    </>}
    {variant === 'room-backdrop' && <LinearGradient colors={ROOM_BACKDROP_SCRIM} locations={ROOM_BACKDROP_STOPS} style={styles.roomBackdropShade} />}
    {variant === 'room-row' && <LinearGradient colors={ROOM_ROW_SCRIM} locations={ROOM_ROW_STOPS} style={styles.image} />}
    {variant === 'scene-backdrop' && <LinearGradient colors={SCENE_BACKDROP_SCRIM} locations={SCENE_BACKDROP_STOPS} style={styles.sceneBackdropShade} />}
  </View>;
}

const styles = StyleSheet.create({
  background: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  thumbnail: { width: 44, height: 44, flexShrink: 0, overflow: 'hidden', borderRadius: 13, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke },
  image: { ...StyleSheet.absoluteFillObject },
  roomBackdropShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 128 },
  sceneBackdropShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 200, maxHeight: '100%' },
});
