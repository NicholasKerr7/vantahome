import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../../components/Pressable';
import { theme } from '../../../theme/theme';
import { CameraCenterArtwork } from './CameraCenterArtwork';
import { cameraCenterStyles as styles } from './CameraCenterStyles';
import type { CameraCenterCamera, CameraCenterEvent } from './CameraCenterTypes';

/** Sample events remain separate from camera selection and never imply a recorded video exists. */
export function CameraCenterActivity({ cameras, events, compact, tablet, onSelectCamera }: {
  cameras: readonly CameraCenterCamera[];
  events: readonly CameraCenterEvent[];
  compact: boolean;
  tablet: boolean;
  onSelectCamera: (id: string) => void;
}) {
  const [cameraFilter, setCameraFilter] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const allowedIds = new Set(cameras.map((camera) => camera.id));
  const filter = cameraFilter && allowedIds.has(cameraFilter) ? cameraFilter : null;
  const visibleEvents = events.filter((event) => allowedIds.has(event.cameraId) && (!filter || event.cameraId === filter));
  const canCreateSample = cameras.some((camera) => camera.canControl && (!filter || camera.id === filter));
  const eventStyle = useMemo(() => StyleSheet.create({ item: { width: tablet ? Math.max(260, (width - 12) / 2) : Math.max(220, width - 18) } }).item, [tablet, width]);

  /** Derive event widths from the available workspace, including tablet preview bounds. */
  function measure(event: LayoutChangeEvent): void { setWidth(event.nativeEvent.layout.width); }

  return <View style={styles.activity} testID="camera-center-activity">
    <View style={styles.activityIntro}>
      <Text style={styles.eyebrow}>SAMPLE ACTIVITY</Text>
      {!compact && <Text style={styles.activityTitle}>A little more context.</Text>}
      <Text style={styles.activityDescription}>Simulation events only. No footage is captured or stored.</Text>
    </View>
    <ScrollView horizontal style={styles.filterStrip} contentContainerStyle={styles.filterContent} showsHorizontalScrollIndicator={false}
      bounces={false} overScrollMode="never" directionalLockEnabled>
      <Pressable style={[styles.filter, !filter && styles.filterActive]} onPress={() => setCameraFilter(null)} accessibilityLabel="Activity from all cameras"
        accessibilityState={{ selected: !filter }}><Text style={styles.filterText}>All cameras</Text></Pressable>
      {cameras.map((camera) => <Pressable key={camera.id} style={[styles.filter, filter === camera.id && styles.filterActive]}
        onPress={() => setCameraFilter(camera.id)} accessibilityLabel={`Activity from ${camera.name}`} accessibilityState={{ selected: filter === camera.id }}>
        <Text style={styles.filterText}>{camera.name}</Text>
      </Pressable>)}
    </ScrollView>
    {visibleEvents.length ? <View style={styles.eventStrip} onLayout={measure}>
      <ScrollView horizontal style={styles.horizontalScroll} contentContainerStyle={styles.eventContent} showsHorizontalScrollIndicator={false}
        bounces={false} overScrollMode="never" directionalLockEnabled decelerationRate="normal">
        {visibleEvents.map((event) => {
          const camera = cameras.find((candidate) => candidate.id === event.cameraId)!;
          return <Pressable key={event.id} style={[styles.event, eventStyle]} accessibilityLabel={`${event.label}, ${camera.name}, ${event.timeLabel}. Sample activity. View camera preview.`}
            onPress={() => onSelectCamera(camera.id)}>
            <View style={styles.stage}>{camera.status === 'demo' ? <CameraCenterArtwork view={camera.view} /> : <Ionicons name="videocam-off-outline" size={30} color={theme.colors.accentText} />}</View>
            <View style={styles.eventDetails}>
              <Text style={styles.demoBadge}>SAMPLE · NOT A RECORDING</Text>
              <Text style={styles.eventTitle} numberOfLines={2}>{event.label}</Text>
              <Text style={styles.eventMeta}>{camera.name} · {event.timeLabel}</Text>
              {!compact && event.detail && <Text style={styles.eventMeta} numberOfLines={3}>{event.detail}</Text>}
              <View style={styles.eventAction}><Text style={styles.eventActionText}>View camera preview</Text><Ionicons name="arrow-forward" size={16} color={theme.colors.accentText} /></View>
            </View>
          </Pressable>;
        })}
      </ScrollView>
    </View> : <View style={styles.empty}>
      <Ionicons name="albums-outline" size={32} color={theme.colors.accentText} />
      <Text style={styles.emptyTitle}>No sample activity yet</Text>
      <Text style={styles.emptyMessage}>{canCreateSample
        ? "Use Simulate snapshot in a camera's controls to create a sample event. It does not capture an image."
        : 'An authorized household manager can create sample events in the camera controls. No footage is recorded.'}</Text>
    </View>}
  </View>;
}
