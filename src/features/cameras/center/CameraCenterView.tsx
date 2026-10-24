import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Pressable from '../../../components/Pressable';
import { useDecorativeMotion } from '../../../components/useDecorativeMotion';
import { theme } from '../../../theme/theme';
import { CameraCenterActivity } from './CameraCenterActivity';
import { CameraCenterTile } from './CameraCenterTile';
import { cameraCenterStyles as styles } from './CameraCenterStyles';
import type { CameraCenterCamera, CameraCenterViewProps } from './CameraCenterTypes';

/** Fit one selected architectural view, a touch camera strip and essential actions inside the host screen. */
export function CameraCenterView(props: CameraCenterViewProps) {
  const { cameras, selectedCameraId, section, layout, focused = false, loading = false, canViewActivity = true,
    onSelectCamera, onSectionChange, onLayoutChange, onOpenCamera, onControls, onLocate, onToggleFavorite, onAllCameras } = props;
  const { width, height, fontScale } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 768;
  const landscape = tablet && width > height;
  const compact = !tablet && height < 700;
  const largeText = fontScale > 1.3;
  const selected = cameras.find((camera) => camera.id === selectedCameraId) ?? (focused ? undefined : cameras[0]);
  const others = cameras.filter((camera) => camera.id !== selected?.id);
  const motionAllowed = useDecorativeMotion(true);
  const reveal = useSharedValue(1);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));

  // A finite reveal belongs to selection only; no idle animation or old-frame buffering is retained.
  useEffect(() => {
    cancelAnimation(reveal);
    reveal.value = motionAllowed ? 0.88 : 1;
    if (motionAllowed) reveal.value = withTiming(1, { duration: 180, reduceMotion: ReduceMotion.System });
    return () => cancelAnimation(reveal);
  }, [motionAllowed, reveal, selected?.id, selected?.status]);

  return <ScrollView testID="camera-center-workspace" style={styles.viewport}
    contentContainerStyle={[styles.content, compact && styles.compactContent, largeText && styles.largeTextContent]}
    scrollEnabled={largeText} showsVerticalScrollIndicator={largeText} bounces={false} overScrollMode="never" nestedScrollEnabled>
    <View style={styles.topbar}>
      {focused ? <Pressable style={[styles.tab, styles.tabActive]} accessibilityLabel="All cameras" onPress={onAllCameras}>
        <Ionicons name="grid-outline" size={18} color={theme.colors.accentText} /><Text style={styles.tabTextActive}>All cameras</Text>
      </Pressable> : <View accessibilityRole="tablist" style={styles.tabList}>
        <Pressable accessibilityRole="tab" accessibilityLabel="Cameras" accessibilityState={{ selected: section === 'cameras' }}
          onPress={() => onSectionChange('cameras')} style={[styles.tab, compact && styles.tabCompact, section === 'cameras' && styles.tabActive]}>
          <Ionicons name="videocam-outline" size={18} color={section === 'cameras' ? theme.colors.accentText : theme.colors.subtext} />
          <Text style={[styles.tabText, section === 'cameras' && styles.tabTextActive]}>Cameras</Text>
        </Pressable>
        {canViewActivity && <Pressable accessibilityRole="tab" accessibilityLabel="Activity" accessibilityState={{ selected: section === 'activity' }}
          onPress={() => onSectionChange('activity')} style={[styles.tab, compact && styles.tabCompact, section === 'activity' && styles.tabActive]}>
          <Ionicons name="time-outline" size={18} color={section === 'activity' ? theme.colors.accentText : theme.colors.subtext} />
          <Text style={[styles.tabText, section === 'activity' && styles.tabTextActive]}>Activity</Text>
        </Pressable>}
      </View>}
      {!focused && section === 'cameras' && cameras.length > 1 && <Pressable
        accessibilityLabel={layout === 'wall' ? 'Show selected camera' : 'Show camera wall'} accessibilityState={{ selected: layout === 'wall' }}
        onPress={() => onLayoutChange(layout === 'wall' ? 'focus' : 'wall')} style={[styles.tool, layout === 'wall' && styles.toolActive]}>
        <Ionicons name={layout === 'wall' ? 'albums-outline' : 'grid-outline'} size={20} color={theme.colors.accentText} />
      </Pressable>}
    </View>

    {loading ? <CameraCenterEmpty title="Preparing your camera views" message="Checking access to this home's camera collection." icon="videocam-outline" />
      : !selected ? <CameraCenterEmpty title={focused ? 'Camera unavailable' : 'No cameras to show'}
        message={focused ? 'This camera is no longer available in your current access.' : 'Authorized cameras will appear here. Shared property views do not grant camera access.'} icon="videocam-off-outline" />
        : section === 'activity' && !focused ? canViewActivity ? <CameraCenterActivity cameras={cameras} events={props.events}
          compact={compact} tablet={tablet} onSelectCamera={(id) => { onSelectCamera(id); onSectionChange('cameras'); }} />
          : <CameraCenterEmpty title="Activity access unavailable" message="Your current access does not include camera history." icon="lock-closed-outline" />
          : <>
            {!focused && layout === 'wall' ? <CameraWall cameras={cameras} selectedId={selected.id}
              onSelect={(id) => { onSelectCamera(id); onOpenCamera?.(id); }} />
              : <View style={[styles.workspace, landscape && !focused && styles.landscapeWorkspace]}>
                <Animated.View style={[styles.hero, revealStyle]}>
                  <CameraCenterTile camera={selected} condensed={compact} onToggleFavorite={onToggleFavorite} />
                </Animated.View>
                {!focused && others.length > 0 && (landscape ? <CameraSideRail cameras={others} selectedId={selected.id} onSelect={onSelectCamera} />
                  : <CameraStrip cameras={tablet ? others : cameras} selectedId={selected.id} tablet={tablet} compact={compact} onSelect={onSelectCamera} />)}
              </View>}
            {(focused || layout === 'focus') && <View style={styles.controls}>
              {!focused && onOpenCamera && <CameraAction label="Expand" icon="expand-outline" onPress={() => onOpenCamera(selected.id)} accessibilityLabel={`Open ${selected.name} viewer`} />}
              <CameraAction label="Controls" icon="options-outline" primary onPress={() => onControls(selected.id)} accessibilityLabel={`Open ${selected.name} controls`} />
              {onLocate && <CameraAction label="Locate" icon="navigate-outline" onPress={() => onLocate(selected.id)} accessibilityLabel={`Locate ${selected.name} in 3D Home`} />}
            </View>}
            <Text style={styles.note}>Illustrations only · No footage captured in this preview</Text>
          </>}
  </ScrollView>;
}

/** Keep each camera choice at a useful size; additional cameras move with native horizontal momentum. */
function CameraStrip({ cameras, selectedId, tablet, compact, onSelect }: {
  cameras: readonly CameraCenterCamera[]; selectedId: string; tablet: boolean; compact: boolean; onSelect: (id: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const itemStyle = useMemo(() => StyleSheet.create({ item: { width: tablet ? Math.max(160, (width - 10) / 2) : compact ? 140 : 158 } }).item, [width, tablet, compact]);
  /** Size tablet choices against their actual bounded host, rather than screen pixels. */
  function measure(event: LayoutChangeEvent): void { setWidth(event.nativeEvent.layout.width); }
  return <View style={[styles.thumbStrip, compact && styles.thumbStripCompact, tablet && styles.thumbStripTablet]} onLayout={measure}>
    <ScrollView testID="camera-thumbnail-strip" horizontal style={styles.horizontalScroll} contentContainerStyle={styles.thumbContent}
      showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never" directionalLockEnabled decelerationRate="normal">
      {cameras.map((camera) => <Pressable key={camera.id} style={[styles.thumb, itemStyle, compact && styles.compactCameraChoice, compact && camera.id === selectedId && styles.compactCameraChoiceSelected]}
        accessibilityLabel={`Select ${camera.name}`} accessibilityState={{ selected: camera.id === selectedId }} onPress={() => onSelect(camera.id)}>
        {compact ? <><Ionicons name="videocam-outline" size={17} color={theme.colors.accentText} /><Text style={styles.compactCameraName} numberOfLines={1}>{camera.name}</Text></>
          : <CameraCenterTile camera={camera} compact selected={camera.id === selectedId} />}
      </Pressable>)}
    </ScrollView>
  </View>;
}

/** Keep two companion viewpoints beside the hero; larger collections swipe in pairs. */
function CameraSideRail({ cameras, selectedId, onSelect }: {
  cameras: readonly CameraCenterCamera[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return <View style={styles.sideRail} testID="camera-side-rail"><CameraPages cameras={cameras} perPage={2} renderPage={(page) => <View style={styles.railCards}>
    {page.map((camera) => <Pressable key={camera.id} style={styles.railPressable} accessibilityLabel={`Select ${camera.name}`}
      accessibilityState={{ selected: camera.id === selectedId }} onPress={() => onSelect(camera.id)}>
      <CameraCenterTile camera={camera} compact selected={camera.id === selectedId} />
    </Pressable>)}
  </View>} /></View>;
}

/** Expose an equal-sized overview without crowding every camera into one narrow row. */
function CameraWall({ cameras, selectedId, onSelect }: {
  cameras: readonly CameraCenterCamera[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return <CameraPages cameras={cameras} perPage={4} renderPage={(page) => <View style={styles.wall} testID="camera-wall">
    {[page.slice(0, 2), page.slice(2, 4)].filter((row) => row.length).map((row, index) => <View key={index} style={styles.wallRow}>
      {row.map((camera) => <Pressable key={camera.id} style={styles.wallItem} accessibilityLabel={`View ${camera.name}`}
        accessibilityState={{ selected: camera.id === selectedId }} onPress={() => onSelect(camera.id)}>
        <CameraCenterTile camera={camera} compact selected={camera.id === selectedId} />
      </Pressable>)}
      {row.length === 1 && page.length > 1 && <View style={styles.wallPlaceholder} />}
    </View>)}
  </View>} />;
}

/** A bounded, measured horizontal page strip accommodates extra cameras without arrow navigation. */
function CameraPages({ cameras, perPage, renderPage }: {
  cameras: readonly CameraCenterCamera[]; perPage: number; renderPage: (cameras: readonly CameraCenterCamera[]) => React.ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const [position, setPosition] = useState({ geometry: '', page: 0 });
  const count = Math.ceil(cameras.length / perPage);
  const geometry = `${width}:${count}`;
  const page = position.geometry === geometry ? Math.min(position.page, count - 1) : 0;
  const pageStyle = useMemo(() => StyleSheet.create({ page: { width, height: '100%' } }).page, [width]);
  /** Re-measure on rotation so pages fit the new usable width without changing camera selection. */
  function measure(event: LayoutChangeEvent): void { setWidth(event.nativeEvent.layout.width); }
  return <View style={styles.viewport} onLayout={measure} testID="camera-page-viewport">
    {count <= 1 || width <= 0 ? renderPage(cameras.slice(0, perPage)) : <>
      <ScrollView testID="camera-collection-pages" key={geometry} horizontal pagingEnabled style={[styles.viewport, styles.horizontalScroll]}
        showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never" directionalLockEnabled decelerationRate="fast"
        onMomentumScrollEnd={(event) => setPosition({ geometry, page: Math.round(event.nativeEvent.contentOffset.x / width) })}>
        {Array.from({ length: count }, (_, index) => <CameraPage key={index} active={index === page} style={pageStyle}>
          {renderPage(cameras.slice(index * perPage, (index + 1) * perPage))}
        </CameraPage>)}
      </ScrollView>
      <Text style={styles.pageLabel}>Swipe cameras · {Math.min(page + 1, count)} / {count}</Text>
    </>}
  </View>;
}

/** Offscreen pages remain visible while swiping but cannot receive keyboard, reader or accidental touch actions. */
function CameraPage({ active, style, children }: { active: boolean; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const updateInert = useCallback((node: View | null) => {
    if (Platform.OS !== 'web' || !node) return;
    const element = node as unknown as { setAttribute?: (name: string, value: string) => void; removeAttribute?: (name: string) => void };
    if (active) element.removeAttribute?.('inert'); else element.setAttribute?.('inert', '');
  }, [active]);
  return <View ref={updateInert} style={style} pointerEvents={active ? 'auto' : 'none'} aria-hidden={!active}
    accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>{children}</View>;
}

/** Keep navigation affordances honest: actions open places or controls, never invented media capabilities. */
function CameraAction({ label, icon, onPress, primary = false, accessibilityLabel }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean; accessibilityLabel: string;
}) {
  return <Pressable style={[styles.action, primary && styles.primaryAction]} onPress={onPress} accessibilityLabel={accessibilityLabel}>
    <Ionicons name={icon} size={19} color={primary ? theme.colors.bg0 : theme.colors.accentText} />
    <Text style={[styles.actionText, primary && styles.primaryActionText]}>{label}</Text>
  </Pressable>;
}

/** Access, loading and empty states allocate no previews or media resources. */
export function CameraCenterEmpty({ title, message, icon }: { title: string; message: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={styles.empty}>
    <Ionicons name={icon} size={34} color={theme.colors.accentText} />
    <Text style={styles.emptyTitle} accessibilityRole="header">{title}</Text>
    <Text style={styles.emptyMessage}>{message}</Text>
  </View>;
}
