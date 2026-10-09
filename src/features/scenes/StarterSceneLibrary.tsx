import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ModalCard from '../../components/ModalCard';
import Pressable from '../../components/Pressable';
import CinematicCardArtwork from '../cinematic-artwork/CinematicCardArtwork';
import { sceneArtwork } from '../cinematic-artwork/artwork';
import { theme } from '../../theme/theme';
import type { StarterScene } from './starterScenes';

type Props = { presets: readonly StarterScene[]; onChoose: (preset: StarterScene) => void; onClose: () => void };

/** A single cinematic starter at a time keeps review reachable on small phones without scrolling. */
export function StarterSceneLibrary({ presets, onChoose, onClose }: Props) {
  const [page, setPage] = useState(0);
  const preset = presets[Math.min(page, presets.length - 1)];
  if (!preset) return null;
  return <ModalCard visible animationType="none" colors={[theme.colors.bg0, theme.colors.glass]} onRequestClose={onClose} backdropAccessibilityLabel="Dismiss scene presets" backdropStyle={styles.backdrop} cardStyle={styles.card}>
    <View style={styles.heading}>
      <View style={styles.copy}><Text style={styles.eyebrow}>MADE FOR YOUR HOME</Text><Text accessibilityRole="header" style={styles.title}>Scene presets</Text></View>
      <Pressable accessibilityLabel="Close scene presets" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable>
    </View>
    <View style={styles.artwork}>
      <CinematicCardArtwork artwork={sceneArtwork({ name: preset.name, modelPreset: preset.id })} variant="scene-backdrop" />
      <View style={styles.artworkCopy}><Text style={styles.presetName}>{preset.name}</Text><Text style={styles.description}>{preset.description}</Text></View>
    </View>
    <Text style={styles.hint}>{preset.available ? `${preset.draft.actions.length} preview controls · Review, rename and adjust before saving.` : 'Requires the matching 3D preview devices and permission to control them.'}</Text>
    <View style={styles.footer}>
      <Pressable accessibilityLabel="Previous preset" disabled={page === 0} accessibilityState={{ disabled: page === 0 }} onPress={() => setPage(page - 1)} style={[styles.iconButton, page === 0 && styles.disabled]}><Ionicons name="chevron-back" size={20} color={theme.colors.text} /></Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.page}>{page + 1} / {presets.length}</Text>
      <Pressable accessibilityLabel="Next preset" disabled={page >= presets.length - 1} accessibilityState={{ disabled: page >= presets.length - 1 }} onPress={() => setPage(page + 1)} style={[styles.iconButton, page >= presets.length - 1 && styles.disabled]}><Ionicons name="chevron-forward" size={20} color={theme.colors.text} /></Pressable>
      <Pressable accessibilityLabel={`Review ${preset.name} preset`} disabled={!preset.available} accessibilityState={{ disabled: !preset.available }} onPress={() => onChoose(preset)} style={[styles.primary, !preset.available && styles.disabled]}><Text style={styles.primaryText}>Use preset</Text></Pressable>
    </View>
    <Text style={styles.localNote}>Saved on this device. Nothing runs until you tap Run scene.</Text>
  </ModalCard>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(7,2,20,0.8)' },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 16, borderRadius: 26, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: theme.colors.accent, fontSize: 9, letterSpacing: 1.4, fontWeight: '700' },
  title: { color: theme.colors.text, fontSize: 23, fontWeight: '700', marginTop: 3 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: theme.colors.bg1 },
  artwork: { height: 152, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
  artworkCopy: { padding: 14, gap: 4 }, presetName: { color: theme.colors.text, fontSize: 23, fontWeight: '700', textShadowColor: '#090315', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  description: { color: theme.colors.text, fontSize: 12, lineHeight: 17, textShadowColor: '#090315', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  hint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17 }, footer: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  page: { color: theme.colors.subtext, fontSize: 12 }, primary: { flex: 1, minHeight: 44, borderRadius: 16, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent },
  primaryText: { color: theme.colors.bg0, fontSize: 13, fontWeight: '700' }, disabled: { opacity: 0.4 },
  localNote: { color: theme.colors.subtext, fontSize: 10, lineHeight: 14 },
});
