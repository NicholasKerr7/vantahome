import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import ModalCard from '../../components/ModalCard';
import Pressable from '../../components/Pressable';
import { ROUTINE_EXECUTION } from '../routines/executionAvailability';
import { theme } from '../../theme/theme';

const STEPS = [
  { title: 'Your preview is ready', body: ROUTINE_EXECUTION.detail, note: 'Your existing routines remain saved. This guide does not enable background execution.' },
  { title: 'Prepare a local home hub', body: 'The planned connection uses Vanta Bridge with Home Assistant on a hub at your property.', note: 'Hub discovery and secure pairing are still being built. No hub credentials are needed in this preview.' },
  { title: 'Link, review, then activate', body: 'Once pairing is available, each model device will need a verified link to its real device. Review your routines before transferring execution to the hub.', note: 'The app and hub must never run the same routine independently. Activation will require a verified handoff and connection status.' },
] as const;

/** Explain the future hub handoff in short pages without representing setup as a live connection. */
export function HubPreparation({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep navigation visible when the copy grows with Dynamic Type or a shorter viewport.
  const sizing = useMemo(() => StyleSheet.create({ card: { maxHeight: Math.max(180, height - insets.top - insets.bottom - 36) } }), [height, insets.top, insets.bottom]);
  const step = STEPS[page];
  return <ModalCard visible onRequestClose={onClose} animationType="none" colors={[theme.colors.bg0, theme.colors.card]} cardStyle={[styles.card, sizing.card]} backdropAccessibilityLabel="Close hub preparation">
    <View style={styles.header}>
      <Text style={styles.eyebrow}>HOME HUB / PREPARATION</Text>
      <Pressable accessibilityLabel="Close preparation guide" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable>
    </View>
    <ScrollView key={page} style={styles.copy} contentContainerStyle={styles.copyContent} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>
      <Text style={styles.note}>{step.note}</Text>
    </ScrollView>
    <View style={styles.footer}>
      <Pressable accessibilityLabel="Previous preparation step" disabled={page === 0} accessibilityState={{ disabled: page === 0 }} onPress={() => setPage(page - 1)} style={[styles.iconButton, page === 0 && styles.disabled]}><Ionicons name="arrow-back" size={20} color={theme.colors.text} /></Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.page}>{page + 1} / {STEPS.length}</Text>
      <Pressable accessibilityLabel={page === STEPS.length - 1 ? 'Finish preparation guide' : 'Next preparation step'} onPress={page === STEPS.length - 1 ? onClose : () => setPage(page + 1)} style={styles.next}><Text style={styles.nextText}>{page === STEPS.length - 1 ? 'Done' : 'Next'}</Text></Pressable>
    </View>
  </ModalCard>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: 20, gap: 16, borderRadius: 26, borderWidth: 1, borderColor: theme.colors.stroke },
  copy: { flexShrink: 1, minHeight: 0 },
  copyContent: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { flex: 1, color: theme.colors.muted, fontSize: 10, letterSpacing: 1.2 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: theme.colors.card2 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
  body: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
  note: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 6 },
  page: { color: theme.colors.muted, fontSize: 12 },
  next: { minWidth: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 14, backgroundColor: theme.colors.accent },
  nextText: { color: theme.colors.bg0, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.35 },
});
