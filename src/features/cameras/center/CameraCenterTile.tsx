import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../../components/Pressable';
import { theme } from '../../../theme/theme';
import { CameraCenterArtwork } from './CameraCenterArtwork';
import { cameraCenterStyles as styles } from './CameraCenterStyles';
import type { CameraCenterCamera } from './CameraCenterTypes';

const CAMERA_STATES = {
  configured: { icon: 'videocam-outline', title: 'Configured camera', message: 'Open viewer to watch. Playback begins only when you request it.' },
  privacy: { icon: 'eye-off-outline', title: 'Preview hidden', message: 'This view is unavailable under the current privacy setting.' },
  stale: { icon: 'refresh-outline', title: 'Waiting for camera information', message: 'The last state is no longer current. No live image is being shown.' },
  unconfigured: { icon: 'videocam-off-outline', title: 'Camera not connected', message: 'A camera connection is needed for live video, sound and recordings.' },
  unavailable: { icon: 'cloud-offline-outline', title: 'Camera unavailable', message: 'Camera information could not be verified. Try again when your connection returns.' },
} as const;

/** Present sample art or a truthful unavailable state without mounting video, audio or media caches. */
export function CameraCenterTile({ camera, compact = false, condensed = false, selected = false, onToggleFavorite }: {
  camera: CameraCenterCamera;
  compact?: boolean;
  condensed?: boolean;
  selected?: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  const unavailable = camera.status === 'demo' ? null : CAMERA_STATES[camera.status];
  return <View style={[styles.tile, compact && styles.tileCompact, selected && styles.tileSelected]} testID={`camera-center-tile-${camera.id}`}>
    <View style={[styles.tileHeader, compact && styles.tileHeaderCompact]}>
      <View style={styles.tileIdentity}>
        <Text style={[styles.cameraName, compact && styles.cameraNameCompact]} numberOfLines={1}>{camera.name}</Text>
        {!compact && <Text style={styles.roomName} numberOfLines={1}>{camera.roomName}</Text>}
      </View>
      {!compact && onToggleFavorite && <Pressable style={styles.tool}
        accessibilityLabel={`${camera.favorite ? 'Remove' : 'Add'} ${camera.name} ${camera.favorite ? 'from' : 'to'} favorites`}
        accessibilityState={{ selected: Boolean(camera.favorite) }} onPress={() => onToggleFavorite(camera.id)}>
        <Ionicons name={camera.favorite ? 'star' : 'star-outline'} size={20} color={theme.colors.accentText} />
      </Pressable>}
      {compact && camera.favorite && <Ionicons name="star" size={12} color={theme.colors.accentText} />}
    </View>
    {unavailable ? <View style={[styles.stage, styles.unavailable, compact && styles.unavailableCompact]}>
      <Ionicons name={unavailable.icon} size={compact ? 22 : 30} color={theme.colors.accentText} />
      <Text style={[styles.unavailableTitle, compact && styles.unavailableTitleCompact]}>{unavailable.title}</Text>
      {!compact && <Text style={styles.unavailableMessage}>{camera.statusDetail ?? unavailable.message}</Text>}
    </View> : <View style={styles.stage}><CameraCenterArtwork view={camera.view} /></View>}
    {!compact && camera.status === 'demo' && <View style={styles.provenance}>
      <Text style={styles.provenanceTitle}>Generated illustration</Text>
      {!condensed && <Text style={styles.provenanceDetail}>A visual reference, not your camera's view.</Text>}
    </View>}
    <View style={[styles.statusRow, compact && styles.statusRowCompact]}>
      <View style={styles.stateBadge}>
        {camera.status === 'demo' && <View style={styles.stateDot} />}
        <Text style={[styles.demoBadge, compact && styles.demoBadgeCompact]}>{camera.status === 'demo' ? 'DEMO PREVIEW' : camera.status === 'configured' ? 'NOT PLAYING' : 'NO LIVE FEED'}</Text>
      </View>
      {!compact && camera.status === 'demo' && <Text style={styles.statusLabel}>{camera.armed ? 'Armed preference' : 'Disarmed preference'}</Text>}
    </View>
  </View>;
}
