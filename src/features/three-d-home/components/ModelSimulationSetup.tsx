import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DEVICES, ROOMS } from '../../../../packages/home-scene/src/data';
import CinematicSurface from '../../../components/CinematicSurface';
import Pressable from '../../../components/Pressable';
import { theme } from '../../../theme/theme';
import { useModelSimulationSetup } from '../useModelSimulationSetup';

/** Explain the owner-only, simulation-only setup before its explicit account write. */
export default function ModelSimulationSetup() {
  const { available, busy, error, prepare } = useModelSimulationSetup();
  const { height } = useWindowDimensions();
  const compact = height < 800;
  if (!available) return null;
  return <ScrollView style={styles.root} contentContainerStyle={[styles.content, compact && styles.compactContent]} bounces={false}
    overScrollMode="never" decelerationRate="normal" showsVerticalScrollIndicator={false}>
    <CinematicSurface style={[styles.card, compact && styles.compactCard]}>
      <View style={[styles.icon, compact && styles.compactIcon]}><Ionicons name="cube-outline" size={compact ? 22 : 28} color={theme.colors.accent} /></View>
      <Text style={styles.eyebrow}>YOUR HOME · YOUR ACCESS</Text>
      <Text style={[styles.title, compact && styles.compactTitle]}>Your home, in 3D</Text>
      <Text style={[styles.description, compact && styles.compactDescription]}>Add the furnished property, then invite your household and choose each person’s rooms.</Text>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>{ROOMS.length} modeled spaces</Text>
        <Text style={styles.summaryText}>{DEVICES.length} virtual devices</Text>
      </View>
      <Text style={[styles.boundary, compact && styles.compactBoundary]}>Simulation only. Controls stay on this device. Connect real equipment separately when your hub is ready.</Text>
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      <Pressable style={[styles.action, busy && styles.disabled]} onPress={prepare} disabled={busy}
        accessibilityLabel="Prepare my 3D simulation" accessibilityState={{ busy, disabled: busy }}>
        {busy ? <ActivityIndicator color={theme.colors.text} /> : <Ionicons name="sparkles-outline" size={18} color={theme.colors.text} />}
        <Text style={styles.actionText}>{busy ? 'Preparing your home…' : error ? 'Retry setup' : 'Prepare my 3D home'}</Text>
      </Pressable>
      <Text style={styles.footnote}>Adds virtual rooms and devices to this home.</Text>
    </CinematicSurface>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 510, padding: 22, gap: 14, borderRadius: theme.radius.lg },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card2 },
  eyebrow: { color: theme.colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '600' },
  description: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryText: { color: theme.colors.text, fontSize: 12, fontWeight: '600' },
  boundary: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  error: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.accent2 },
  actionText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.65 },
  footnote: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  // Keep the normal SE-sized flow within the viewport; scrolling remains for enlarged text or error details.
  compactContent: { padding: 12 },
  compactCard: { padding: 16, gap: 10 },
  compactIcon: { width: 36, height: 36, borderRadius: 12 },
  compactTitle: { fontSize: 22, lineHeight: 28 },
  compactDescription: { fontSize: 13, lineHeight: 19 },
  compactBoundary: { fontSize: 12, lineHeight: 17 },
});
