import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../components/Pressable';
import ThemedSwitch from '../../components/ThemedSwitch';
import type { AutomationFlow, AutomationRule, Room, Scene } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { collectionRows, useCollectionPagination } from './collectionPagination';

type Pagination = ReturnType<typeof useCollectionPagination>;

/** Explicit previous/next controls keep every item reachable without scrolling or gestures. */
function CollectionPager({ pagination, total, noun }: { pagination: Pagination; total: number; noun: string }) {
  const { page, pageCount, start, end, changePage } = pagination;
  return <View style={styles.pager}>
    <Text style={styles.pageCount} accessibilityLiveRegion="polite">
      {total ? `${start + 1}–${end} of ${total}` : `0 ${noun}`}
    </Text>
    <View style={styles.pageActions}>
      <Pressable accessibilityLabel={`Previous ${noun} page`} accessibilityState={{ disabled: page === 0 }} disabled={page === 0} style={[styles.pageButton, page === 0 && styles.disabled]} onPress={() => changePage(page - 1)}>
        <Ionicons name="arrow-back" size={18} color={theme.colors.text} />
      </Pressable>
      <Text style={styles.pageNumber}>{String(page + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</Text>
      <Pressable accessibilityLabel={`Next ${noun} page`} accessibilityState={{ disabled: page >= pageCount - 1 }} disabled={page >= pageCount - 1} style={[styles.pageButton, page >= pageCount - 1 && styles.disabled]} onPress={() => changePage(page + 1)}>
        <Ionicons name="arrow-forward" size={18} color={theme.colors.text} />
      </Pressable>
    </View>
  </View>;
}

type SceneCollectionProps = {
  scenes: readonly Scene[];
  rooms: readonly Room[];
  activeSceneId: string | null;
  onCreate: () => void;
  onClear: () => void;
  onOpen: (sceneId: string) => void;
  onRun: (sceneId: string) => void;
};

/** Present scenes as a numbered architectural collection while retaining direct run and edit access. */
export function EmbeddedScenes({ scenes, rooms, activeSceneId, onCreate, onClear, onOpen, onRun }: SceneCollectionProps) {
  const pagination = useCollectionPagination(scenes.length, 190, true);
  const pageScenes = scenes.slice(pagination.start, pagination.end);
  const activeScene = scenes.find((scene) => scene.id === activeSceneId);
  return <View style={styles.collection} testID="embedded-scenes-collection">
    <View style={styles.collectionHeader}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>ATMOSPHERE, ON DEMAND</Text>
        <Text style={styles.headline}>Your scenes<Text style={styles.headlineCount}> / {String(scenes.length).padStart(2, '0')}</Text></Text>
      </View>
      <Pressable accessibilityLabel="Create scene" style={styles.createButton} onPress={onCreate}>
        <Ionicons name="add" size={18} color={theme.colors.bg0} />
        <Text style={styles.createText}>Create</Text>
      </Pressable>
    </View>
    <View style={styles.contextRow}>
      <View style={[styles.statusDot, activeScene && styles.statusDotActive]} />
      <Text style={styles.contextText} numberOfLines={1}>{activeScene ? `${activeScene.name} is active` : 'A different rhythm for every room'}</Text>
      {activeSceneId ? <Pressable accessibilityLabel="Clear active scene" style={styles.clearButton} onPress={onClear}><Text style={styles.linkText}>Clear active</Text></Pressable> : null}
    </View>
    <View style={styles.collectionBody} onLayout={pagination.measure} testID="scene-page-area">
      {pageScenes.length ? collectionRows(pageScenes, pagination.columns).map((row, rowIndex) => <View key={row[0].id} testID={`scene-row-${rowIndex}`} style={[styles.tileRow, !pagination.largeText && styles.tileRowStandard]}>
        {row.map((scene, columnIndex) => {
          const active = scene.id === activeSceneId;
          const ordinal = pagination.start + rowIndex * pagination.columns + columnIndex + 1;
          const roomName = rooms.find((room) => room.id === scene.roomId)?.name ?? 'Home';
          return <View key={scene.id} testID={`scene-tile-${scene.id}`} style={[styles.sceneTile, active && styles.sceneTileActive]}>
            <View style={styles.tileTop}>
              <Text style={styles.ordinal}>{String(ordinal).padStart(2, '0')}</Text>
              <Text style={[styles.tileStatus, active && styles.tileStatusActive]}>{active ? 'ACTIVE' : 'READY'}</Text>
            </View>
            <View style={styles.tileCopy}>
              <Text style={styles.sceneName} numberOfLines={2}>{scene.name}</Text>
              <Text style={styles.sceneMeta} numberOfLines={1}>{roomName} · {scene.actions.length} actions</Text>
            </View>
            <View style={styles.tileActions}>
              <Pressable accessibilityLabel={`Run ${scene.name}`} style={styles.runButton} onPress={() => onRun(scene.id)}>
                <Ionicons name="play" size={13} color={theme.colors.accent} /><Text style={styles.runText}>Run scene</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Details for ${scene.name}`} style={styles.detailsButton} onPress={() => onOpen(scene.id)}>
                <Text style={styles.detailsText}>Details</Text><Ionicons name="arrow-forward" size={15} color={theme.colors.subtext} />
              </Pressable>
            </View>
          </View>;
        })}
        {row.length < pagination.columns ? <View style={styles.emptyTileSpace} /> : null}
      </View>) : <View style={styles.emptyState}>
        <Text style={styles.emptyNumber}>01</Text>
        <Text style={styles.emptyTitle}>Make room for a mood.</Text>
        <Text style={styles.emptyCopy}>Create your first scene to bring several devices together in one tap.</Text>
      </View>}
    </View>
    <CollectionPager pagination={pagination} total={scenes.length} noun="scenes" />
  </View>;
}

type AutomationCollectionProps = {
  flows: readonly AutomationFlow[];
  rules: readonly AutomationRule[];
  onNewFlow: () => void;
  onOpenFlow: (flowId: string) => void;
  onToggleFlow: (flowId: string) => void;
  onAddSchedule: () => void;
  onOpenSchedule: (ruleId: string) => void;
  onToggleSchedule: (ruleId: string) => void;
};

/** Keep routines in a calm, ruled list with independent editing and enable switches. */
export function EmbeddedAutomations({ flows, rules, onNewFlow, onOpenFlow, onToggleFlow, onAddSchedule, onOpenSchedule, onToggleSchedule }: AutomationCollectionProps) {
  const [tab, setTab] = useState<'flows' | 'schedules'>('flows');
  const showingFlows = tab === 'flows';
  const total = showingFlows ? flows.length : rules.length;
  const enabled = flows.filter((flow) => flow.enabled).length + rules.filter((rule) => rule.enabled).length;
  const pagination = useCollectionPagination(total, 102);

  /** Tab changes start at the first page so each collection has a predictable entry point. */
  function selectTab(next: typeof tab) {
    setTab(next);
    pagination.changePage(0);
  }

  return <View style={styles.collection} testID="embedded-automations-collection">
    <View style={styles.collectionHeader}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>THE EVERYDAY, CONSIDERED</Text>
        <Text style={styles.headline}>House routines</Text>
      </View>
      <View style={styles.enabledSummary}><Text style={styles.enabledCount}>{String(enabled).padStart(2, '0')}</Text><Text style={styles.enabledLabel}>ENABLED</Text></View>
    </View>
    <View style={styles.tabs} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityLabel={`Flows, ${flows.length}`} accessibilityState={{ selected: showingFlows }} style={[styles.tab, showingFlows && styles.tabActive]} onPress={() => selectTab('flows')}>
        <Text style={[styles.tabText, showingFlows && styles.tabTextActive]}>Flows</Text><Text style={styles.tabCount}>{flows.length}</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityLabel={`Schedules, ${rules.length}`} accessibilityState={{ selected: !showingFlows }} style={[styles.tab, !showingFlows && styles.tabActive]} onPress={() => selectTab('schedules')}>
        <Text style={[styles.tabText, !showingFlows && styles.tabTextActive]}>Schedules</Text><Text style={styles.tabCount}>{rules.length}</Text>
      </Pressable>
    </View>
    <View style={styles.listToolbar}>
      <Text style={styles.listLegend}>{showingFlows ? 'WHEN · IF · THEN' : 'TIME · ACTION'}</Text>
      <Pressable style={styles.addRoutineButton} onPress={showingFlows ? onNewFlow : onAddSchedule}>
        <Ionicons name="add" size={17} color={theme.colors.accent} /><Text style={styles.linkText}>{showingFlows ? 'New flow' : 'Add schedule'}</Text>
      </Pressable>
    </View>
    <View style={styles.collectionBody} onLayout={pagination.measure} testID="routine-page-area">
      {showingFlows ? flows.slice(pagination.start, pagination.end).map((flow, index) => <View style={styles.routineRow} key={flow.id} testID={`routine-row-${flow.id}`}>
        <Pressable accessibilityLabel={`Edit ${flow.name}`} style={styles.routineMain} onPress={() => onOpenFlow(flow.id)}>
          <Text style={styles.routineNumber}>{String(pagination.start + index + 1).padStart(2, '0')}</Text>
          <View style={styles.routineCopy}><Text style={styles.routineName} numberOfLines={2}>{flow.name}</Text><Text style={styles.routineMeta} numberOfLines={1}>{flow.triggers.length} triggers · {flow.conditions.length} conditions · {flow.actions.length} actions</Text></View>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.muted} />
        </Pressable>
        <View style={styles.routineState}><ThemedSwitch style={styles.routineSwitch} accessibilityLabel={`${flow.name} enabled`} value={flow.enabled} onValueChange={() => onToggleFlow(flow.id)} /><Text style={[styles.stateLabel, flow.enabled && styles.stateLabelOn]}>{flow.enabled ? 'ON' : 'OFF'}</Text></View>
      </View>) : rules.slice(pagination.start, pagination.end).map((rule) => <View style={styles.routineRow} key={rule.id} testID={`routine-row-${rule.id}`}>
        <Pressable accessibilityLabel={`Edit ${rule.name}`} style={styles.routineMain} onPress={() => onOpenSchedule(rule.id)}>
          <View style={styles.routineCopy}>
            <Text style={styles.scheduleTime}>{String(rule.trigger.hour).padStart(2, '0')}:{String(rule.trigger.minute).padStart(2, '0')}<Text style={styles.dailyLabel}>  DAILY</Text></Text>
            <Text style={styles.routineName} numberOfLines={1}>{rule.name}</Text>
            <Text style={styles.routineMeta} numberOfLines={1}>{rule.action.type === 'set-ac' ? `Set AC to ${rule.action.tempC}°C` : `Turn device ${rule.action.on ? 'on' : 'off'}`}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.muted} />
        </Pressable>
        <View style={styles.routineState}><ThemedSwitch style={styles.routineSwitch} accessibilityLabel={`${rule.name} enabled`} value={rule.enabled} onValueChange={() => onToggleSchedule(rule.id)} /><Text style={[styles.stateLabel, rule.enabled && styles.stateLabelOn]}>{rule.enabled ? 'ON' : 'OFF'}</Text></View>
      </View>)}
      {!total ? <View style={styles.emptyState}><Text style={styles.emptyNumber}>—</Text><Text style={styles.emptyTitle}>{showingFlows ? 'A little less to think about.' : 'Give your home a rhythm.'}</Text><Text style={styles.emptyCopy}>{showingFlows ? 'Connect a trigger to the actions you want your home to take.' : 'Choose a time and a device action for a daily routine.'}</Text></View> : null}
    </View>
    <CollectionPager pagination={pagination} total={total} noun={tab} />
  </View>;
}

const styles = StyleSheet.create({
  collection: { flex: 1, minHeight: 0, width: '100%', maxWidth: 1040, alignSelf: 'center', paddingTop: 18 },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: theme.colors.muted, fontSize: 9, fontWeight: '600', letterSpacing: 1.7, marginBottom: 8 },
  headline: { color: theme.colors.text, fontSize: 25, fontWeight: '500', letterSpacing: -0.9 },
  headlineCount: { color: theme.colors.muted, fontSize: 18, fontWeight: '400' },
  createButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12, backgroundColor: theme.colors.accent, borderRadius: 3 },
  createText: { color: theme.colors.bg0, fontSize: 12, fontWeight: '700' },
  contextRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.stroke },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.muted },
  statusDotActive: { backgroundColor: theme.colors.accent },
  contextText: { flex: 1, color: theme.colors.subtext, fontSize: 11 },
  clearButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 },
  linkText: { color: theme.colors.accent, fontSize: 12, fontWeight: '600' },
  collectionBody: { flex: 1, minHeight: 0, gap: 10 },
  tileRow: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 10 },
  tileRowStandard: { maxHeight: 244 },
  sceneTile: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingTop: 12, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 3 },
  sceneTileActive: { borderColor: theme.colors.accent },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ordinal: { color: theme.colors.muted, fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  tileStatus: { color: theme.colors.muted, fontSize: 9, fontWeight: '600', letterSpacing: 1.4 },
  tileStatusActive: { color: theme.colors.accent },
  tileCopy: { flex: 1, justifyContent: 'center', minHeight: 0, paddingVertical: 6 },
  sceneName: { color: theme.colors.text, fontSize: 20, fontWeight: '500', letterSpacing: -0.4 },
  sceneMeta: { color: theme.colors.subtext, fontSize: 11, marginTop: 6 },
  tileActions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.stroke },
  runButton: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  runText: { color: theme.colors.accent, fontSize: 12, fontWeight: '600' },
  detailsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailsText: { color: theme.colors.subtext, fontSize: 12 },
  emptyTileSpace: { flex: 1 },
  pager: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.stroke, marginTop: 12 },
  pageCount: { color: theme.colors.muted, fontSize: 11 },
  pageActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pageButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pageNumber: { color: theme.colors.subtext, fontSize: 10, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  disabled: { opacity: 0.3 },
  emptyState: { flex: 1, minHeight: 0, justifyContent: 'center', maxWidth: 380, paddingBottom: 12 },
  emptyNumber: { color: theme.colors.stroke, fontSize: 42, fontWeight: '300', marginBottom: 12 },
  emptyTitle: { color: theme.colors.text, fontSize: 21, fontWeight: '500', letterSpacing: -0.5 },
  emptyCopy: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20, marginTop: 10 },
  enabledSummary: { alignItems: 'flex-end', minWidth: 48 },
  enabledCount: { color: theme.colors.accent, fontSize: 28, fontWeight: '300', fontVariant: ['tabular-nums'] },
  enabledLabel: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1.2, marginTop: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.stroke, gap: 24 },
  tab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.colors.accent },
  tabText: { color: theme.colors.muted, fontSize: 15, fontWeight: '500' },
  tabTextActive: { color: theme.colors.text },
  tabCount: { color: theme.colors.muted, fontSize: 11 },
  listToolbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listLegend: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1.4 },
  addRoutineButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  routineRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.stroke, gap: 12 },
  routineMain: { flex: 1, minWidth: 0, minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  routineNumber: { color: theme.colors.muted, fontSize: 18, fontWeight: '300', minWidth: 24, fontVariant: ['tabular-nums'] },
  routineCopy: { flex: 1, minWidth: 0 },
  routineName: { color: theme.colors.text, fontSize: 16, fontWeight: '500', letterSpacing: -0.3 },
  routineMeta: { color: theme.colors.subtext, fontSize: 11, marginTop: 7 },
  routineState: { minWidth: 52, alignItems: 'center', justifyContent: 'center' },
  routineSwitch: { minHeight: 44, minWidth: 52 },
  stateLabel: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1, marginTop: 5 },
  stateLabelOn: { color: theme.colors.accent },
  scheduleTime: { color: theme.colors.accent, fontSize: 20, fontWeight: '400', fontVariant: ['tabular-nums'], marginBottom: 5 },
  dailyLabel: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1.4 },
});
