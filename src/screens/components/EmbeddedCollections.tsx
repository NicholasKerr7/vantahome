import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../components/Pressable';
import ScrollableCardPages from '../../components/ScrollableCardPages';
import type { Room, Scene } from '../../store/useHomeStore';
import type { Routine } from '../../store/routines';
import { theme } from '../../theme/theme';
import { useRoutineTimeZone } from '../../features/routines/useRoutineTimeZone';
import { ROUTINE_EXECUTION } from '../../features/routines/executionAvailability';
import { collectionRows, useCollectionPagination } from './collectionPagination';
import { RoutineCard, SceneMoodCard } from './CollectionCards';
import { describeFlow } from './collectionDescriptions';
import { useCollectionDirectory } from './useCollectionDirectory';
import { sceneScopeLabel } from '../../features/scenes/sceneScope';
import { useHomeStore } from '../../store/useHomeStore';
import { isModelHome } from '../../features/three-d-home/modelHomeScope';

type Pagination = ReturnType<typeof useCollectionPagination>;

/** Retain explicit previous/next controls alongside the directly scrollable cards. */
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
  onCreate: () => void; onEnd: (sceneId: string) => void; onOpen: (sceneId: string) => void; onRun: (sceneId: string) => void;
  onPresets?: () => void;
};

/** Arrange actionable mood cards in measured horizontal pages that stay inside the available viewport. */
export function EmbeddedScenes({ scenes, rooms, activeSceneId, onCreate, onEnd, onOpen, onRun, onPresets }: SceneCollectionProps) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.15;
  const pagination = useCollectionPagination(scenes.length, compact ? 194 : 234, true);
  const directory = useCollectionDirectory();
  const modelHome = useHomeStore(isModelHome);
  const lastUsedScene = scenes.find((scene) => scene.id === activeSceneId);
  return <View style={[styles.collection, compact && styles.collectionCompact]} testID="embedded-scenes-collection">
    <View style={styles.collectionHeader}>
      <View style={styles.headingCopy}>
        {!compact && <Text style={styles.eyebrow}>ONE TOUCH. A DIFFERENT FEELING.</Text>}
        <Text style={[styles.headline, compact && styles.headlineCompact]} numberOfLines={1}>Set the mood<Text style={styles.headlineCount}> / {scenes.length}</Text></Text>
      </View>
      {onPresets && <Pressable accessibilityLabel="Browse scene presets" style={styles.createButton} onPress={onPresets}><Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} /><Text style={styles.createText}>Presets</Text></Pressable>}
      <Pressable accessibilityLabel="Create scene" style={styles.createButton} onPress={onCreate}><Ionicons name="add" size={20} color={theme.colors.accent} />{!compact && <Text style={styles.createText}>New</Text>}</Pressable>
    </View>
    <View style={styles.contextRow}>
      <Text style={styles.contextText} numberOfLines={1}>Saved on this device · Review settings before running</Text>
      {lastUsedScene ? <Pressable accessibilityLabel="End last-used scene" style={styles.endButton} onPress={() => onEnd(lastUsedScene.id)}><Text style={styles.linkText}>End scene</Text></Pressable> : null}
    </View>
    <View style={styles.collectionBody} onLayout={pagination.measure} testID="scene-page-area">
      {scenes.length ? <ScrollableCardPages page={pagination.page} count={pagination.pageCount} onChange={pagination.changePage}
        resetKey={`${pagination.capacity}:${scenes.map((scene) => scene.id).join('|')}`} testID="scene-card-pages"
        renderPage={(page) => <View style={styles.collectionBody}>{collectionRows(scenes.slice(page * pagination.capacity, (page + 1) * pagination.capacity), pagination.columns).map((row, rowIndex) => <View key={row[0].id} testID={`scene-row-${rowIndex}`} style={[styles.cardRow, !pagination.largeText && styles.sceneRowStandard]}>
        {row.map((scene) => <SceneMoodCard key={scene.id} scene={scene} roomName={sceneScopeLabel(scene, rooms)} active={scene.id === activeSceneId} compact={compact || pagination.tight} directory={directory} modelHome={modelHome} onRun={onRun} onOpen={onOpen} onEnd={onEnd} />)}
        {row.length < pagination.columns && <View style={styles.emptyTileSpace} />}
      </View>)}</View>} /> : <View style={styles.emptyState}><Ionicons name="sparkles-outline" size={36} color={theme.colors.accent} /><Text style={styles.emptyTitle}>Make room for a mood.</Text><Text style={styles.emptyCopy}>Create your first scene to bring several devices together in one tap.</Text></View>}
    </View>
    <CollectionPager pagination={pagination} total={scenes.length} noun="scenes" />
  </View>;
}

type AutomationCollectionProps = {
  routines: readonly Routine[]; deviceName?: string; onClearFilter?: () => void; canManage?: boolean; error?: string | null;
  onCreate: () => void; onOpen: (routineId: string) => void; onToggle: (routineId: string) => void;
};

/** Keep daily schedules and advanced routines together, using their shared normalized identity. */
export function EmbeddedAutomations({ routines, deviceName, onClearFilter, canManage = true, error, onCreate, onOpen, onToggle }: AutomationCollectionProps) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.15;
  const timeZoneLabel = useRoutineTimeZone();
  const enabled = routines.filter((routine) => routine.enabled).length;
  const pagination = useCollectionPagination(routines.length, compact ? 174 : 208, true);
  const directory = useCollectionDirectory();
  return <View style={[styles.collection, compact && styles.collectionCompact]} testID="embedded-automations-collection">
    <View style={styles.collectionHeader}>
      <View style={styles.headingCopy}>
        {!compact && <Text style={styles.eyebrow}>{enabled} ENABLED · BUILT AROUND YOU</Text>}
        <Text style={[styles.headline, compact && styles.headlineCompact]} numberOfLines={1}>{deviceName ?? 'Your routines'}<Text style={styles.headlineCount}> / {routines.length}</Text></Text>
      </View>
      <Pressable accessibilityLabel="New routine" accessibilityState={{ disabled: !canManage }} disabled={!canManage} style={[styles.createButton, !canManage && styles.disabled]} onPress={onCreate}><Ionicons name="add" size={20} color={theme.colors.accent} />{!compact && <Text style={styles.createText}>New</Text>}</Pressable>
    </View>
    <View style={styles.runtimeStatus}><View style={styles.runtimeDot} /><View style={styles.runtimeCopy}><Text style={styles.runtimeText}>{ROUTINE_EXECUTION.summary}</Text><Text style={styles.runtimeText}>{timeZoneLabel}</Text><Text style={styles.runtimeText} accessibilityRole={error ? "alert" : undefined}>{error ?? (canManage ? ROUTINE_EXECUTION.storage : "View only · Ask your household owner to make changes")}</Text></View>{onClearFilter && <Pressable accessibilityLabel="All routines" onPress={onClearFilter} style={styles.allRoutinesButton}><Text style={styles.linkText}>All routines</Text></Pressable>}</View>
    <View style={styles.collectionBody} onLayout={pagination.measure} testID="routine-page-area">
      {routines.length > 0 && <ScrollableCardPages page={pagination.page} count={pagination.pageCount} onChange={pagination.changePage}
        resetKey={`${pagination.capacity}:${routines.map((routine) => routine.id).join('|')}`} testID="routine-card-pages"
        renderPage={(page) => <View style={styles.collectionBody}>{collectionRows(routines.slice(page * pagination.capacity, (page + 1) * pagination.capacity), pagination.columns).map((row, rowIndex) => <View key={row[0].id} testID={`routine-card-row-${rowIndex}`} style={[styles.cardRow, !pagination.largeText && styles.routineRowStandard]}>
        {row.map((routine) => {
          const summary = describeFlow(routine, directory);
          const daily = routine.triggers.length === 1 && routine.triggers[0].type === 'time' && routine.conditions.length === 0;
          return <RoutineCard readOnly={!canManage} key={routine.id} id={routine.id} name={routine.name} enabled={routine.enabled} when={summary.when} then={summary.then} condition={summary.condition} actionCount={routine.actions.length} conditionCount={routine.conditions.length} compact={compact || pagination.tight} schedule={daily} onOpen={() => onOpen(routine.id)} onToggle={() => onToggle(routine.id)} />;
        })}
        {row.length < pagination.columns && <View style={styles.emptyTileSpace} />}
      </View>)}</View>} />}
      {!routines.length && <View style={styles.emptyState}><Ionicons name="git-network-outline" size={36} color={theme.colors.accent} /><Text style={styles.emptyTitle}>A little less to think about.</Text><Text style={styles.emptyCopy}>Choose when your home should act, any conditions, and what it should do.</Text></View>}
    </View>
    <CollectionPager pagination={pagination} total={routines.length} noun="routines" />
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
  endButton: { minHeight: 48, minWidth: 76, justifyContent: 'center', alignItems: 'flex-end' },
  linkText: { color: theme.colors.accentText, fontSize: 12, fontWeight: '600' },
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
  runtimeStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingBottom: 6 },
  allRoutinesButton: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  runtimeCopy: { flex: 1, minWidth: 0 },
  runtimeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.ember },
  runtimeText: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15 },
});
