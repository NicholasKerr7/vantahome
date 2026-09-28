import React, { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../components/Pressable';
import type { AutomationFlow, AutomationRule, Room, Scene } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { collectionRows, useCollectionPagination } from './collectionPagination';
import { RoutineCard, SceneMoodCard } from './CollectionCards';
import { collectionTime, describeAction, describeFlow } from './collectionDescriptions';
import { useCollectionDirectory } from './useCollectionDirectory';

type Pagination = ReturnType<typeof useCollectionPagination>;

/** Explicit previous/next controls keep every item reachable without scrolling or gestures. */
function CollectionPager({ pagination, total, noun }: { pagination: Pagination; total: number; noun: string }) {
  const { page, pageCount, start, end, changePage } = pagination;
  return <View style={styles.pager}>
    <Text style={styles.pageCount} accessibilityLiveRegion="polite">{total ? `${start + 1}–${end} of ${total}` : `0 ${noun}`}</Text>
    <View style={styles.pageActions}>
      <Pressable accessibilityLabel={`Previous ${noun} page`} accessibilityState={{ disabled: page === 0 }} disabled={page === 0} style={[styles.pageButton, page === 0 && styles.disabled]} onPress={() => changePage(page - 1)}><Ionicons name="arrow-back" size={18} color={theme.colors.text} /></Pressable>
      <Text style={styles.pageNumber}>{page + 1} / {pageCount}</Text>
      <Pressable accessibilityLabel={`Next ${noun} page`} accessibilityState={{ disabled: page >= pageCount - 1 }} disabled={page >= pageCount - 1} style={[styles.pageButton, page >= pageCount - 1 && styles.disabled]} onPress={() => changePage(page + 1)}><Ionicons name="arrow-forward" size={18} color={theme.colors.text} /></Pressable>
    </View>
  </View>;
}

type SceneCollectionProps = {
  scenes: readonly Scene[]; rooms: readonly Room[]; activeSceneId: string | null;
  onCreate: () => void; onClear: () => void; onOpen: (sceneId: string) => void; onRun: (sceneId: string) => void;
};

/** Arrange scenes as actionable mood cards, with measured pagination instead of a scrolling gallery. */
export function EmbeddedScenes({ scenes, rooms, activeSceneId, onCreate, onClear, onOpen, onRun }: SceneCollectionProps) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.15;
  const pagination = useCollectionPagination(scenes.length, compact ? 194 : 234, true);
  const directory = useCollectionDirectory();
  const pageScenes = scenes.slice(pagination.start, pagination.end);
  const activeScene = scenes.find((scene) => scene.id === activeSceneId);
  return <View style={[styles.collection, compact && styles.collectionCompact]} testID="embedded-scenes-collection">
    <View style={styles.collectionHeader}>
      <View style={styles.headingCopy}>
        {!compact && <Text style={styles.eyebrow}>ONE TOUCH. A DIFFERENT FEELING.</Text>}
        <Text style={[styles.headline, compact && styles.headlineCompact]} numberOfLines={1}>Set the mood<Text style={styles.headlineCount}> / {scenes.length}</Text></Text>
      </View>
      <Pressable accessibilityLabel="Create scene" style={styles.createButton} onPress={onCreate}><Ionicons name="add" size={20} color={theme.colors.accent} />{!compact && <Text style={styles.createText}>New</Text>}</Pressable>
    </View>
    <View style={styles.contextRow}>
      <Text style={styles.contextText} numberOfLines={1}>{activeScene ? `Now active · ${activeScene.name}` : 'Choose a scene for your space'}</Text>
      {activeSceneId ? <Pressable accessibilityLabel="Clear active scene" style={styles.clearButton} onPress={onClear}><Text style={styles.linkText}>Clear</Text></Pressable> : null}
    </View>
    <View style={styles.collectionBody} onLayout={pagination.measure} testID="scene-page-area">
      {pageScenes.length ? collectionRows(pageScenes, pagination.columns).map((row, rowIndex) => <View key={row[0].id} testID={`scene-row-${rowIndex}`} style={[styles.cardRow, !pagination.largeText && styles.sceneRowStandard]}>
        {row.map((scene) => <SceneMoodCard key={scene.id} scene={scene} roomName={rooms.find((room) => room.id === scene.roomId)?.name ?? 'Home'} active={scene.id === activeSceneId} compact={compact || pagination.tight} directory={directory} onRun={onRun} onOpen={onOpen} />)}
        {row.length < pagination.columns && <View style={styles.emptyTileSpace} />}
      </View>) : <View style={styles.emptyState}><Ionicons name="sparkles-outline" size={36} color={theme.colors.accent} /><Text style={styles.emptyTitle}>Make room for a mood.</Text><Text style={styles.emptyCopy}>Create your first scene to bring several devices together in one tap.</Text></View>}
    </View>
    <CollectionPager pagination={pagination} total={scenes.length} noun="scenes" />
  </View>;
}

type AutomationCollectionProps = {
  flows: readonly AutomationFlow[]; rules: readonly AutomationRule[];
  onNewFlow: () => void; onOpenFlow: (flowId: string) => void; onToggleFlow: (flowId: string) => void;
  onAddSchedule: () => void; onOpenSchedule: (ruleId: string) => void; onToggleSchedule: (ruleId: string) => void;
};

/** Make each routine's real trigger and outcome readable before opening its existing editor. */
export function EmbeddedAutomations({ flows, rules, onNewFlow, onOpenFlow, onToggleFlow, onAddSchedule, onOpenSchedule, onToggleSchedule }: AutomationCollectionProps) {
  const [tab, setTab] = useState<'flows' | 'schedules'>('flows');
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.15;
  const showingFlows = tab === 'flows';
  const total = showingFlows ? flows.length : rules.length;
  const enabled = flows.filter((flow) => flow.enabled).length + rules.filter((rule) => rule.enabled).length;
  const pagination = useCollectionPagination(total, compact ? 174 : 208, true);
  const directory = useCollectionDirectory();
  const items: readonly (AutomationFlow | AutomationRule)[] = showingFlows ? flows.slice(pagination.start, pagination.end) : rules.slice(pagination.start, pagination.end);

  /** Changing collections always starts at page one while retaining the existing editor callbacks. */
  function selectTab(next: typeof tab) {
    setTab(next);
    pagination.changePage(0);
  }

  return <View style={[styles.collection, compact && styles.collectionCompact]} testID="embedded-automations-collection">
    <View style={styles.collectionHeader}>
      <View style={styles.headingCopy}>
        {!compact && <Text style={styles.eyebrow}>{enabled} ENABLED · BUILT AROUND YOU</Text>}
        <Text style={[styles.headline, compact && styles.headlineCompact]} numberOfLines={1}>Your routines</Text>
      </View>
      <Pressable accessibilityLabel={showingFlows ? 'New flow' : 'Add schedule'} style={styles.createButton} onPress={showingFlows ? onNewFlow : onAddSchedule}><Ionicons name="add" size={20} color={theme.colors.accent} />{!compact && <Text style={styles.createText}>New</Text>}</Pressable>
    </View>
    <View style={styles.tabs} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityLabel={`Flows, ${flows.length}`} accessibilityState={{ selected: showingFlows }} style={[styles.tab, showingFlows && styles.tabActive]} onPress={() => selectTab('flows')}><Ionicons name="git-network-outline" size={15} color={showingFlows ? theme.colors.accent : theme.colors.subtext} /><Text style={[styles.tabText, showingFlows && styles.tabTextActive]}>Flows</Text><Text style={styles.tabCount}>{flows.length}</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityLabel={`Schedules, ${rules.length}`} accessibilityState={{ selected: !showingFlows }} style={[styles.tab, !showingFlows && styles.tabActive]} onPress={() => selectTab('schedules')}><Ionicons name="time-outline" size={16} color={!showingFlows ? theme.colors.accent : theme.colors.subtext} /><Text style={[styles.tabText, !showingFlows && styles.tabTextActive]}>Schedules</Text><Text style={styles.tabCount}>{rules.length}</Text></Pressable>
    </View>
    <View style={styles.collectionBody} onLayout={pagination.measure} testID="routine-page-area">
      {collectionRows(items, pagination.columns).map((row, rowIndex) => <View key={row[0].id} testID={`routine-card-row-${rowIndex}`} style={[styles.cardRow, !pagination.largeText && styles.routineRowStandard]}>
        {row.map((item) => {
          const isFlow = 'triggers' in item;
          const summary = isFlow ? describeFlow(item, directory) : { when: `Daily at ${collectionTime(item.trigger.hour, item.trigger.minute)}`, then: describeAction(item.action, directory), condition: null };
          return <RoutineCard key={item.id} id={item.id} name={item.name} enabled={item.enabled} when={summary.when} then={summary.then} condition={summary.condition} actionCount={isFlow ? item.actions.length : 1} conditionCount={isFlow ? item.conditions.length : 0} compact={compact || pagination.tight} schedule={!isFlow} onOpen={() => isFlow ? onOpenFlow(item.id) : onOpenSchedule(item.id)} onToggle={() => isFlow ? onToggleFlow(item.id) : onToggleSchedule(item.id)} />;
        })}
        {row.length < pagination.columns && <View style={styles.emptyTileSpace} />}
      </View>)}
      {!total && <View style={styles.emptyState}><Ionicons name={showingFlows ? 'git-network-outline' : 'time-outline'} size={36} color={theme.colors.accent} /><Text style={styles.emptyTitle}>{showingFlows ? 'A little less to think about.' : 'Give your home a rhythm.'}</Text><Text style={styles.emptyCopy}>{showingFlows ? 'Connect a trigger to the actions you want your home to take.' : 'Choose a time and a device action for a daily routine.'}</Text></View>}
    </View>
    <CollectionPager pagination={pagination} total={total} noun={tab} />
  </View>;
}

const styles = StyleSheet.create({
  collection: { flex: 1, minHeight: 0, width: '100%', maxWidth: 1040, alignSelf: 'center', paddingTop: 12 },
  collectionCompact: { paddingTop: 4 },
  collectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 8, minHeight: 52 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: theme.colors.muted, fontSize: 8, fontWeight: '600', letterSpacing: 1.3, marginBottom: 7 },
  headline: { color: theme.colors.text, fontSize: 24, fontWeight: '500', letterSpacing: -0.8 },
  headlineCompact: { fontSize: 21 },
  headlineCount: { color: theme.colors.muted, fontSize: 14, fontWeight: '400' },
  createButton: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 16 },
  createText: { color: theme.colors.text, fontSize: 12, fontWeight: '600' },
  contextRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  contextText: { flex: 1, color: theme.colors.subtext, fontSize: 11 },
  clearButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  linkText: { color: theme.colors.accent, fontSize: 12, fontWeight: '600' },
  collectionBody: { flex: 1, minHeight: 0, gap: 10 },
  cardRow: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 10 },
  sceneRowStandard: { maxHeight: 280 },
  routineRowStandard: { maxHeight: 250 },
  emptyTileSpace: { flex: 1 },
  pager: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  pageCount: { color: theme.colors.muted, fontSize: 11 },
  pageActions: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pageButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: theme.colors.card2 },
  pageNumber: { color: theme.colors.subtext, fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'center' },
  disabled: { opacity: 0.3 },
  emptyState: { flex: 1, minHeight: 0, justifyContent: 'center', maxWidth: 380, gap: 10, paddingBottom: 8 },
  emptyTitle: { color: theme.colors.text, fontSize: 21, fontWeight: '500', letterSpacing: -0.5 },
  emptyCopy: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.stroke, gap: 4, marginBottom: 12 },
  tab: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.colors.accent },
  tabText: { color: theme.colors.subtext, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: theme.colors.text },
  tabCount: { color: theme.colors.muted, fontSize: 10 },
});
