import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../components/Pressable';
import type { Scene } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { sceneDeviceSummary, sceneIdentity, type CollectionDirectory, type SceneIdentity } from './collectionDescriptions';
import CinematicCardArtwork from '../../features/cinematic-artwork/CinematicCardArtwork';
import { routineArtwork, sceneArtwork } from '../../features/cinematic-artwork/artwork';

const IDENTITY_ICONS: Record<SceneIdentity, keyof typeof Ionicons.glyphMap> = {
  light: 'sunny-outline', rest: 'moon-outline', off: 'power-outline', climate: 'snow-outline', media: 'play-outline', security: 'shield-checkmark-outline', home: 'home-outline',
};

type SceneCardProps = {
  scene: Scene; roomName: string; active: boolean; compact: boolean;
  directory: CollectionDirectory; onRun: (id: string) => void; onOpen: (id: string) => void;
};

/** Give each scene an action-led composition, with a separate and equally reachable details control. */
export function SceneMoodCard({ scene, roomName, active, compact, directory, onRun, onOpen }: SceneCardProps) {
  const identity = sceneIdentity(scene, directory);
  const warm = identity === 'light';
  const cool = identity === 'climate' || identity === 'media' || identity === 'rest';
  return <View testID={`scene-tile-${scene.id}`} style={[styles.sceneCard, active && styles.sceneActive, compact && styles.sceneCompact]}>
    <CinematicCardArtwork artwork={sceneArtwork(scene)} testID={`scene-artwork-${scene.id}`} />
    <View style={styles.sceneHeader}>
      <View style={styles.roomLabel}><Ionicons name="location-outline" size={12} color={theme.colors.subtext} /><Text style={styles.roomText} numberOfLines={1}>{roomName}</Text></View>
      <View style={styles.sceneState}><View style={[styles.stateDot, active && styles.stateDotOn]} /><Text style={[styles.sceneStateText, active && styles.sceneStateTextOn]}>{active ? 'Last used' : 'Saved'}</Text></View>
    </View>
    <View style={styles.sceneMain}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.moodMark, warm && styles.moodWarm, cool && styles.moodCool, compact && styles.moodCompact]}>
        <View style={[styles.moodOrbit, warm && styles.orbitWarm, cool && styles.orbitCool]} />
        <Ionicons name={IDENTITY_ICONS[identity]} size={compact ? 27 : 38} color={warm ? theme.colors.ember : cool ? theme.colors.electric : theme.colors.accent} />
      </View>
      <View style={styles.sceneCopy}>
        <Text accessibilityRole="header" style={[styles.sceneName, compact && styles.sceneNameCompact]} numberOfLines={compact ? 1 : 2}>{scene.name}</Text>
        <Text style={styles.sceneDevices} numberOfLines={compact ? 1 : 2}>{sceneDeviceSummary(scene.actions, directory)}</Text>
        {!compact && <Text style={styles.sceneCount}>{scene.actions.length} {scene.actions.length === 1 ? 'action' : 'actions'} together</Text>}
      </View>
    </View>
    <View style={styles.sceneActions}>
      <Pressable accessibilityLabel={`Run ${scene.name}`} style={styles.runButton} onPress={() => onRun(scene.id)}>
        <Ionicons name="play" size={15} color={theme.colors.bg0} /><Text style={styles.runText}>Run scene</Text>
      </Pressable>
      <Pressable accessibilityLabel={`Details for ${scene.name}`} style={styles.detailButton} onPress={() => onOpen(scene.id)}>
        {!compact && <Text style={styles.detailText}>Details</Text>}<Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text} />
      </Pressable>
    </View>
  </View>;
}

type RoutineCardProps = {
  id: string; name: string; enabled: boolean; when: string; then: string; condition?: string | null;
  actionCount: number; conditionCount: number; compact: boolean; schedule?: boolean; readOnly?: boolean;
  onOpen: () => void; onToggle: () => void;
};

type RoutineKeyEvent = { key: string; repeat?: boolean; preventDefault: () => void };

/** Keep the touch target separate from the fixed-size visual switch on native and web. */
function RoutineToggle({ name, enabled, readOnly, onToggle }: { name: string; enabled: boolean; readOnly: boolean; onToggle: () => void }) {
  const [focused, setFocused] = useState(false);

  /** RN Web handles Enter itself; switch-role Space needs its own single activation. */
  function handleSpace(event: RoutineKeyEvent) {
    if (readOnly || (event.key !== ' ' && event.key !== 'Spacebar')) return;
    event.preventDefault();
    if (!event.repeat) onToggle();
  }

  const webKeyboard = Platform.OS === 'web' ? { onKeyDown: handleSpace } : {};
  return <Pressable {...webKeyboard} accessibilityRole="switch" accessibilityLabel={`${name} enabled`} accessibilityState={{ checked: enabled, disabled: readOnly }} disabled={readOnly} aria-checked={enabled} onPress={onToggle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.routineSwitch, focused && styles.routineSwitchFocused, readOnly && styles.routineReadOnly]}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.switchTrack, enabled && styles.switchTrackOn]}>
      <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
    </View>
  </Pressable>;
}

/** Expose a real when/then path and independent enable state without making the whole card a toggle. */
export function RoutineCard({ id, name, enabled, when, then, condition, actionCount, conditionCount, compact, schedule = false, readOnly = false, onOpen, onToggle }: RoutineCardProps) {
  return <View testID={`routine-row-${id}`} style={[styles.routineCard, enabled && styles.routineActive, compact && styles.routineCompact]}>
    <CinematicCardArtwork artwork={routineArtwork({ name, when, then, schedule })} testID={`routine-artwork-${id}`} />
    <View style={styles.routineHeader}>
      <View style={styles.routineIdentity}><Ionicons name={schedule ? 'time-outline' : 'git-network-outline'} size={17} color={theme.colors.accent} /></View>
      <Text accessibilityRole="header" style={styles.routineName} numberOfLines={compact ? 1 : 2}>{name}</Text>
      <Pressable accessibilityLabel={`Edit ${name}`} accessibilityState={{ disabled: readOnly }} disabled={readOnly} onPress={onOpen} style={[styles.editButton, readOnly && styles.routineReadOnly]}><Ionicons name="create-outline" size={19} color={theme.colors.subtext} /></Pressable>
    </View>
    <View style={styles.routinePath}>
      <View style={styles.pathRail} pointerEvents="none" accessible={false}><View style={styles.pathDot} /><View style={styles.pathLine} /><View style={styles.pathDestination} /></View>
      <View style={styles.pathCopy}>
        <View style={styles.pathStep}><Text style={styles.pathLabel}>WHEN</Text><Text style={styles.pathValue} numberOfLines={1}>{when}</Text></View>
        <View style={styles.pathStep}><Text style={styles.pathLabel}>DO</Text><Text style={styles.pathValue} numberOfLines={1}>{then}</Text></View>
      </View>
    </View>
    {condition ? <Text style={styles.condition} numberOfLines={1}>Only if {condition}</Text> : null}
    <View style={styles.routineFooter}>
      <View style={styles.routineStateCopy}>
        <Text style={[styles.enabledText, enabled && styles.enabledTextOn]}>{enabled ? 'Enabled' : 'Paused'}</Text>
        <Text style={styles.routineCount} numberOfLines={1}>{schedule ? 'Daily schedule' : `${actionCount} ${actionCount === 1 ? 'action' : 'actions'}${conditionCount ? ` · ${conditionCount} ${conditionCount === 1 ? 'condition' : 'conditions'}` : ''}`}</Text>
      </View>
      <RoutineToggle readOnly={readOnly} name={name} enabled={enabled} onToggle={onToggle} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sceneCard: { flex: 1, minWidth: 0, minHeight: 0, padding: 16, borderRadius: 26, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke, overflow: 'hidden' },
  sceneActive: { borderColor: theme.colors.accent },
  sceneCompact: { padding: 12, borderRadius: 22 },
  sceneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  roomLabel: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  roomText: { flexShrink: 1, color: theme.colors.subtext, fontSize: 11, fontWeight: '500' },
  sceneState: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stateDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.muted },
  stateDotOn: { backgroundColor: theme.colors.accent },
  sceneStateText: { color: theme.colors.muted, fontSize: 10 },
  sceneStateTextOn: { color: theme.colors.accentText },
  sceneMain: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 10 },
  moodMark: { width: 72, height: 90, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent2, overflow: 'hidden' },
  moodWarm: { backgroundColor: theme.colors.card },
  moodCool: { backgroundColor: theme.colors.bg1 },
  moodCompact: { width: 48, height: 62, borderRadius: 24 },
  moodOrbit: { position: 'absolute', width: 110, height: 66, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: 55, transform: [{ rotate: '-35deg' }], opacity: 0.24 },
  orbitWarm: { borderColor: theme.colors.ember },
  orbitCool: { borderColor: theme.colors.electric },
  sceneCopy: { flex: 1, minWidth: 0 },
  sceneName: { color: theme.colors.text, fontSize: 27, fontWeight: '500', letterSpacing: -0.8 },
  sceneNameCompact: { fontSize: 22, letterSpacing: -0.5 },
  sceneDevices: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16, marginTop: 7 },
  sceneCount: { color: theme.colors.muted, fontSize: 10, marginTop: 7 },
  sceneActions: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  runButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.accent, borderRadius: 16, paddingHorizontal: 8 },
  runText: { color: theme.colors.bg0, fontSize: 13, fontWeight: '700' },
  detailButton: { minHeight: 46, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 16, backgroundColor: theme.colors.card2 },
  detailText: { color: theme.colors.text, fontSize: 12, fontWeight: '500' },
  routineReadOnly: { opacity: 0.35 },
  routineCard: { flex: 1, minWidth: 0, minHeight: 0, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, borderRadius: 24, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, overflow: 'hidden' },
  routineActive: { borderColor: theme.colors.accent2 },
  routineCompact: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 2 },
  routineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routineIdentity: { width: 30, height: 30, borderRadius: 11, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' },
  routineName: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  editButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  routinePath: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 3, marginBottom: 5 },
  pathRail: { width: 12, alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  pathDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: theme.colors.subtext },
  pathLine: { flex: 1, width: 1, minHeight: 7, backgroundColor: theme.colors.stroke },
  pathDestination: { width: 6, height: 6, borderRadius: 2, backgroundColor: theme.colors.accent },
  pathCopy: { flex: 1, minWidth: 0, justifyContent: 'space-around', gap: 6 },
  pathStep: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  pathLabel: { minWidth: 36, flexShrink: 0, color: theme.colors.muted, fontSize: 8, fontWeight: '600', letterSpacing: 0.8 },
  pathValue: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: 12, lineHeight: 18 },
  condition: { color: theme.colors.subtext, fontSize: 10, marginBottom: 6, marginLeft: 22 },
  routineFooter: { minHeight: 50, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.stroke, flexDirection: 'row', alignItems: 'center', gap: 8 },
  routineStateCopy: { flex: 1, minWidth: 0 },
  enabledText: { color: theme.colors.subtext, fontSize: 11, fontWeight: '500' },
  enabledTextOn: { color: theme.colors.accentText },
  routineCount: { color: theme.colors.muted, fontSize: 9, marginTop: 2 },
  routineSwitch: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 16 },
  routineSwitchFocused: { borderColor: theme.colors.accent },
  switchTrack: { width: 44, height: 26, padding: 3, borderRadius: 13, backgroundColor: theme.colors.stroke },
  switchTrackOn: { backgroundColor: theme.colors.accent2 },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.text, alignSelf: 'flex-start' },
  switchThumbOn: { alignSelf: 'flex-end' },
});
