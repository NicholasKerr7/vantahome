import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalCard from '../../components/ModalCard';
import Pressable from '../../components/Pressable';
import ScrollableCardPages from '../../components/ScrollableCardPages';
import { theme } from '../../theme/theme';
import type { SceneEndReviewItem, SceneEndReviewModel } from './sceneEndReview';
import { sceneEndStyles as styles } from './SceneEndReviewStyles';

export type SceneEndReviewProps = {
  review: SceneEndReviewModel | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onRetry: () => void;
  onRestore: () => void;
  onKeep: () => void;
  onClose: () => void;
};

/** Explain exactly which saved settings will change, with bounded detail pages and pinned decisions. */
export function SceneEndReview({ review, loading, error, busy, onRetry, onRestore, onKeep, onClose }: SceneEndReviewProps) {
  const { height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sizing = useMemo(() => StyleSheet.create({ card: {
    height: Math.min(fontScale > 1.3 ? 760 : 680, Math.max(260, height - insets.top - insets.bottom - 36)),
  } }), [height, insets.top, insets.bottom, fontScale]);
  const compact = height - insets.top - insets.bottom < 700;
  const items = review?.items ?? [];
  const restoreCount = items.filter((item) => item.disposition === 'restore').length;
  const skippedCount = items.length - restoreCount;
  const unavailable = !loading && Boolean(review?.unavailableReason);
  const ready = !loading && !busy && !error && Boolean(review);

  /** Dismissal cancels the review; it never changes devices or clears the last-used marker. */
  function dismiss() { if (!busy) onClose(); }

  return <ModalCard visible animationType="none" colors={[theme.colors.bg0, theme.colors.glass]}
    onRequestClose={dismiss} onBackdropPress={dismiss} backdropAccessibilityLabel="Cancel ending scene"
    overlayStyle={styles.overlay} cardStyle={[styles.card, sizing.card]}>
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View accessible={false} style={styles.identity}><Ionicons name="return-down-back-outline" size={24} color={theme.colors.accentText} /></View>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>YOUR HOME / SCENES</Text>
        <Text accessibilityRole="header" style={styles.title}>End scene</Text>
      </View>
      <Pressable accessibilityLabel="Close scene review" accessibilityState={{ disabled: busy }} disabled={busy} onPress={dismiss} style={styles.close}>
        <Ionicons name="close" size={24} color={theme.colors.subtext} />
      </Pressable>
    </View>
    <View style={styles.introduction}>
      <Text style={styles.sceneName} numberOfLines={1}>{review?.sceneName ?? 'Review previous settings'}</Text>
      <Text style={styles.copy}>Restore eligible settings from before this run, or keep your home as it is.</Text>
    </View>
    <View style={styles.body}>
      {loading ? <View style={styles.empty} accessibilityLiveRegion="polite"><ActivityIndicator color={theme.colors.accent} /><Text style={styles.emptyTitle}>Checking this run</Text><Text style={styles.emptyCopy}>Your devices stay as they are.</Text></View>
        : error ? <View style={styles.empty}><Ionicons name="refresh-outline" size={32} color={theme.colors.accent} /><Text style={styles.emptyTitle}>Review needs refreshing</Text><Text style={styles.emptyCopy} accessibilityRole="alert">{error}</Text><Pressable onPress={onRetry} accessibilityLabel="Refresh scene review" disabled={busy} accessibilityState={{ disabled: busy }} style={styles.retry}><Text style={styles.retryText}>Refresh review</Text></Pressable></View>
          : items.length > 0 && review ? <>
            <View style={styles.summary} accessibilityLiveRegion="polite">
              <Text style={styles.summaryText}>{restoreCount} to restore</Text><Text style={styles.summaryMuted}>{skippedCount} left unchanged</Text>
            </View>
            {unavailable && <Text style={styles.notice}>{review.unavailableReason}</Text>}
            <SceneEndPages key={`${review.runId ?? 'unrecorded'}:${review.revision ?? 'none'}`} items={items} compact={compact} />
          </> : <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={34} color={theme.colors.accentText} />
            <Text style={styles.emptyTitle}>Keep your current settings</Text>
            <Text style={styles.emptyCopy}>{review?.unavailableReason ?? 'No settings from this run can be restored.'}</Text>
            <Text style={styles.emptyCopy}>You can still end its last-used status. Your saved scene stays available.</Text>
          </View>}
    </View>
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <Text style={styles.confirmation} accessibilityLiveRegion="polite">{busy ? 'Applying your choice…' : 'Nothing changes until you confirm.'}</Text>
      {review?.canRestore && <Pressable onPress={onRestore} accessibilityLabel="Restore previous settings" disabled={!ready}
        accessibilityState={{ disabled: !ready, busy }} style={[styles.restore, !ready && styles.disabled]}>
        <Ionicons name="return-down-back-outline" size={18} color={theme.colors.bg0} /><Text style={styles.restoreText}>Restore previous settings</Text>
      </Pressable>}
      <Pressable onPress={onKeep} accessibilityLabel="End scene and keep current settings" accessibilityHint="Ends the last-used status. No device settings change."
        disabled={!ready} accessibilityState={{ disabled: !ready, busy }} style={[styles.keep, !ready && styles.disabled]}><Text style={styles.keepText}>Keep current settings</Text></Pressable>
    </View>
  </ModalCard>;
}

/** One device per swipe avoids squeezing a whole-home restoration into a small phone modal. */
function SceneEndPages({ items, compact }: { items: readonly SceneEndReviewItem[]; compact: boolean }) {
  const [page, setPage] = React.useState(0);
  const current = Math.min(page, items.length - 1);
  return <View style={styles.pages}>
    <ScrollableCardPages page={current} count={items.length} onChange={setPage} resetKey={items.map((item) => item.id).join('|')} testID="scene-end-pages"
      renderPage={(index) => <SceneEndDevice item={items[index]} compact={compact} />} />
    <View style={styles.pager}>
      <Pressable accessibilityLabel="Previous device review" disabled={current === 0} accessibilityState={{ disabled: current === 0 }} onPress={() => setPage(current - 1)} style={[styles.pageButton, current === 0 && styles.disabled]}><Ionicons name="chevron-back" size={20} color={theme.colors.text} /></Pressable>
      <Text style={styles.pageCount} accessibilityLiveRegion="polite">{current + 1} / {items.length} · Swipe to review</Text>
      <Pressable accessibilityLabel="Next device review" disabled={current === items.length - 1} accessibilityState={{ disabled: current === items.length - 1 }} onPress={() => setPage(current + 1)} style={[styles.pageButton, current === items.length - 1 && styles.disabled]}><Ionicons name="chevron-forward" size={20} color={theme.colors.text} /></Pressable>
    </View>
  </View>;
}

/** Keep skipped changes explicit, while comparing current and previous values for restorable settings. */
function SceneEndDevice({ item, compact }: { item: SceneEndReviewItem; compact: boolean }) {
  const restorable = item.disposition === 'restore';
  return <View testID={`scene-end-item-${item.id}`} style={[styles.device, compact && styles.deviceCompact]}>
    <ScrollView style={styles.deviceScroll} contentContainerStyle={styles.deviceContent} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
      <View style={styles.deviceHeader}><Text style={styles.roomName}>{item.roomName}</Text><Text style={[styles.disposition, !restorable && styles.dispositionSkip]}>{restorable ? 'RESTORE' : 'UNCHANGED'}</Text></View>
      <Text accessibilityRole="header" style={styles.deviceName}>{item.name}</Text>
      {item.reason && <Text style={styles.reason}>{item.reason}</Text>}
      {item.changes.map((change, index) => <View key={`${change.label}:${index}`} style={styles.change}>
        <Text style={styles.changeLabel}>{change.label}</Text>
        <View style={styles.comparison}>
          <View style={styles.valueCopy}><Text style={styles.valueLabel}>Current</Text><Text style={styles.currentValue}>{change.after}</Text></View>
          <Ionicons accessible={false} name={restorable ? 'arrow-forward' : 'remove-outline'} size={16} color={theme.colors.muted} />
          <View style={styles.valueCopy}><Text style={styles.valueLabel}>{restorable ? 'Restore to' : 'Before this run'}</Text><Text style={[styles.previousValue, !restorable && styles.skippedValue]}>{change.before}</Text></View>
        </View>
      </View>)}
    </ScrollView>
  </View>;
}
