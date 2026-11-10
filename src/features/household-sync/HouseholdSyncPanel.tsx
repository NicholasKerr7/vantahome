import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DeepAction } from '../../components/deep/DeepScreen';
import ModalCard from '../../components/ModalCard';
import ModalForm, { useModalViewportStyle } from '../../components/ModalForm';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { theme } from '../../theme/theme';
import { useHouseholdSync } from './useHouseholdSync';

type SyncModel = ReturnType<typeof useHouseholdSync>;
type SyncStatus = SyncModel['status'];

const STATUS_COPY: Record<SyncStatus, { title: string; detail: string }> = {
  checking: { title: 'Checking shared home…', detail: 'Verifying the latest household state.' },
  local: { title: 'Saved on this phone', detail: 'Simulation changes stay on each phone until the Owner enables sharing.' },
  connecting: { title: 'Connecting…', detail: 'Verifying the shared state before controls are ready.' },
  live: { title: 'Shared home is live', detail: 'Simulation changes are shared with household members within their existing access.' },
  syncing: { title: 'Saving your changes…', detail: 'Waiting for the shared home to confirm this update.' },
  offline: { title: 'Shared home is offline', detail: 'The last verified state may be out of date. Reconnect before trying again.' },
  conflict: { title: 'A newer update is available', detail: 'Reconnect to load the latest shared state before trying your change again.' },
  unavailable: { title: 'Shared home unavailable', detail: 'Verify your household access to check the shared simulation state.' },
};

/** Format a verified receipt without presenting an absent or invalid time as recent. */
function verifiedTime(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return 'Not yet verified';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Not yet verified';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Keep the simulation boundary and local-only definitions visible before and after enabling. */
function SharingScope() {
  return <View style={styles.scope}>
    <View style={styles.scopeHeading}>
      <Ionicons name="cube-outline" size={17} color={theme.colors.accentText} />
      <Text style={styles.scopeTitle}>Simulation only</Text>
    </View>
    <Text style={styles.detail}>Shares simulated device states. No hub or physical equipment is connected.</Text>
    <Text style={styles.detail}>Scene, routine and profile definitions stay local. Existing member permissions still apply.</Text>
  </View>;
}

/** Review the exact current-phone baseline before the Owner enables a previously local home. */
function SharingReview({ model }: { model: SyncModel }) {
  const viewportStyle = useModalViewportStyle();
  const review = model.review;
  if (!review || !model.owner || !model.available || !model.scopeKey) return null;
  const canEnable = model.status === 'local' && !model.busy && !model.error;
  return <ModalCard visible animationType="none" onRequestClose={model.cancelReview}
    backdropAccessibilityLabel="Close shared home review" colors={[theme.colors.glass, theme.colors.bg0]}
    cardStyle={[styles.sheet, viewportStyle]}>
    <ModalForm footer={<View style={styles.reviewActions}>
      <DeepAction label="Not now" disabled={model.busy} onPress={model.cancelReview} />
      <DeepAction label={model.busy ? 'Enabling…' : 'Enable sharing'} primary
        disabled={!canEnable} onPress={() => void model.enable()} />
    </View>}>
      <View style={styles.reviewContent}>
        <Text accessibilityRole="header" style={styles.title}>Share this home’s simulation?</Text>
        <View style={styles.identity}>
          <Text style={styles.label}>HOME</Text>
          <Text selectable style={styles.homeName}>{review.homeName}</Text>
          <Text style={styles.value}>{review.deviceCount} simulated {review.deviceCount === 1 ? 'device' : 'devices'}</Text>
        </View>
        <Text style={styles.value}>Start with the saved device state on this phone.</Text>
        <Text style={styles.detail}>Other phones will adopt this shared state. Their previous local caches are retained.</Text>
        <Text style={styles.detail}>This starts sharing only if it is still disabled for this home. An existing shared home is never replaced.</Text>
        <SharingScope />
        {model.error && <Text accessibilityRole="alert" style={styles.error}>{model.error}</Text>}
      </View>
    </ModalForm>
  </ModalCard>;
}

/** Present verified sync status with contained overflow and explicit, owner-only enablement. */
export function HouseholdSyncPanel() {
  const model = useHouseholdSync();
  const smoothScrolling = useDecorativeMotion(true);
  const scoped = model.available && Boolean(model.scopeKey);
  const status = scoped ? model.status : 'unavailable';
  const copy = STATUS_COPY[status];
  const busy = model.busy || status === 'checking' || status === 'connecting' || status === 'syncing';
  const canReview = scoped && model.owner && status === 'local' && !model.error;
  const recovering = status === 'offline' || status === 'conflict' || status === 'unavailable' || Boolean(model.error);

  return <View style={styles.panel} testID="household-sync-panel">
    <View style={styles.header}>
      <View style={styles.headerIcon}><Ionicons name="cloud-outline" size={24} color={theme.colors.accentText} /></View>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Shared home</Text>
        <Text style={styles.detail}>One simulation, together.</Text>
      </View>
    </View>
    <ScrollView style={[styles.content, smoothScrolling && styles.smoothScroll]} contentContainerStyle={styles.contentBody}
      showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
      <View style={styles.statusCard}>
        <View style={styles.statusHeading}>
          <Ionicons name={status === 'live' ? 'checkmark-circle-outline' : recovering ? 'cloud-offline-outline' : 'cloud-outline'}
            size={20} color={recovering ? theme.colors.warningText : theme.colors.accentText} />
          <Text accessibilityLiveRegion="polite" style={[styles.statusTitle, recovering && styles.warning]}>{copy.title}</Text>
        </View>
        {scoped && <Text selectable style={styles.value}>{model.homeName}</Text>}
        <Text style={styles.detail}>{!model.available
          ? 'Connect your household account to share simulated device states.'
          : copy.detail}</Text>
        {scoped && <Text style={styles.receipt}>{status === 'local'
          ? `${model.deviceCount} simulated ${model.deviceCount === 1 ? 'device' : 'devices'} on this phone`
          : `Last verified · ${verifiedTime(model.lastSyncedAt)}`}</Text>}
      </View>
      {scoped && model.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{model.error}</Text>}
      <SharingScope />
      {scoped && status === 'local' && !model.owner && <Text style={styles.detail}>Only the home’s Owner can enable sharing. Reconnect after they have enabled it.</Text>}
    </ScrollView>
    {scoped && <View style={styles.actions}>
      {canReview && <DeepAction label={model.busy ? 'Checking…' : 'Review sharing'} icon="arrow-forward-outline" primary
        disabled={busy} onPress={() => void model.reviewEnable()} />}
      <DeepAction label={busy ? 'Checking…' : 'Reconnect'} icon="refresh-outline"
        accessibilityLabel="Reconnect shared home" disabled={busy} onPress={() => void model.refresh()} />
    </View>}
    <SharingReview model={model} />
  </View>;
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: theme.colors.card2 },
  heading: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: theme.colors.text, fontSize: 21, lineHeight: 27, fontWeight: '500' },
  content: { flex: 1, minHeight: 0, ...Platform.select({ web: { overscrollBehavior: 'contain' as const, scrollBehavior: 'auto' as const } }) },
  smoothScroll: { flexShrink: 1, ...Platform.select({ web: { scrollBehavior: 'smooth' as const } }) },
  contentBody: { gap: 14, paddingBottom: 4 },
  statusCard: { padding: 15, gap: 9, backgroundColor: theme.colors.card2, borderRadius: theme.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.stroke },
  statusHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusTitle: { flex: 1, minWidth: 0, color: theme.colors.accentText, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  warning: { color: theme.colors.warningText },
  value: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  detail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  receipt: { color: theme.colors.subtext, fontSize: 11, lineHeight: 17, fontVariant: ['tabular-nums'] },
  scope: { gap: 7 },
  scopeHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scopeTitle: { color: theme.colors.accentText, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  error: { color: theme.colors.alarmText, fontSize: 12, lineHeight: 18 },
  actions: { flexShrink: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 20, borderWidth: 1, borderColor: theme.colors.stroke },
  reviewContent: { gap: 15 },
  reviewActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
  identity: { gap: 6 },
  label: { color: theme.colors.accentText, fontSize: 10, lineHeight: 16, letterSpacing: 1.3, fontWeight: '600' },
  homeName: { color: theme.colors.text, fontSize: 20, lineHeight: 27, fontWeight: '500' },
});
