import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../components/Pressable';
import CinematicSurface from '../components/CinematicSurface';
import SceneSurface from '../features/three-d-home/SceneSurface';
import type { SceneStatus } from '../features/three-d-home/protocol';
import type { SimulationSaveStatus } from '../features/three-d-home/simulationPersistence';
import HomeWorkspace from '../features/home-shell/HomeWorkspace';
import HomePanelBoundary from '../features/home-shell/HomePanelBoundary';
import { theme } from '../theme/theme';
import { isThreeDHomeEnabled } from '../config/threeDHome';
import { useDeviceRoutines } from '../features/three-d-home/useDeviceRoutines';
import { useScenePresentationPaused } from '../features/home-shell/ScenePresentationContext';

const HomeVoicePanel = React.lazy(() => import('../features/home-voice/HomeVoicePanel'));
const HomeDeviceLibrary = React.lazy(() => import('../features/home-shell/HomeDeviceLibrary'));

/** Bound loading time while the surrounding home navigation always remains available. */
function SceneSession({ onRetry, onDevices, covered }: { onRetry: () => void; onDevices: () => void; covered: boolean }) {
  const workspaceCovered = useScenePresentationPaused();
  const openDeviceRoutines = useDeviceRoutines();
  const [status, setStatus] = useState<SceneStatus | 'loading'>('loading');
  const [saveStatus, setSaveStatus] = useState<SimulationSaveStatus>('saving');
  useEffect(() => {
    if (status !== 'loading') return;
    const timeout = setTimeout(() => setStatus('error'), 90_000);
    return () => clearTimeout(timeout);
  }, [status]);
  return <View style={styles.scene}>
    {status !== 'error' && <SceneSurface suspended={covered || workspaceCovered} onStatus={setStatus} onSaveStatus={setSaveStatus} onDeviceRoutines={openDeviceRoutines} />}
    {status === 'ready' && (saveStatus === 'error' || saveStatus === 'disconnected') && <View style={styles.saveNotice} accessibilityLiveRegion="polite">
      <Text style={styles.saveNoticeText}>{saveStatus === 'error'
        ? 'Changes work for this session, but couldn’t be saved on this device.'
        : 'Your app session changed. Reload the house to reconnect.'}</Text>
      {saveStatus === 'disconnected' && <Pressable onPress={onRetry} accessibilityLabel="Reconnect house controls" style={styles.retry}><Text style={styles.retryText}>Reconnect</Text></Pressable>}
    </View>}
    {status === 'loading' && <View style={styles.feedback} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={theme.colors.accent} />
      <Text style={styles.feedbackTitle}>Preparing your home…</Text>
      <Text style={styles.feedbackText}>Loading the furnished house and landscape.</Text>
    </View>}
    {status === 'error' && <View style={styles.feedback} accessibilityRole="alert">
      <Ionicons name="cube-outline" size={32} color={theme.colors.accent} />
      <Text style={styles.feedbackTitle}>The 3D view couldn’t load</Text>
      <Text style={styles.feedbackText}>Your device controls and home menu are still available.</Text>
      <Pressable style={styles.retry} onPress={onRetry} accessibilityLabel="Retry 3D Home"><Text style={styles.retryText}>Try again</Text></Pressable>
      <Pressable style={styles.retry} onPress={onDevices} accessibilityLabel="Open device library"><Text style={styles.retryText}>Open devices</Text></Pressable>
    </View>}
  </View>;
}

/** Keep the property central while primary navigation remains visible beside or below it. */
export default function ThreeDHomeScreen() {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [attempt, setAttempt] = useState(0);
  const [panel, setPanel] = useState<'voice' | 'devices' | null>(null);
  const sceneEnabled = isThreeDHomeEnabled();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Brief system overlays retain graphics; actual backgrounding releases them and the mic.
      if (state !== 'inactive') {
        setActive(state === 'active');
        if (state !== 'active') setPanel(null);
      }
    });
    return () => subscription.remove();
  }, []);
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
    <HomeWorkspace section="home">
    <CinematicSurface style={styles.header}>
      <View style={styles.brandIcon}><Ionicons name="cube-outline" size={21} color={theme.colors.accent} /></View>
      <View style={styles.identity}>
        <Text style={styles.title}>VANTA<Text style={styles.brandTail}>HOME</Text></Text>
        <Text style={styles.caption}>Simulation · no real device control</Text>
      </View>
      <Pressable style={[styles.iconButton, styles.voiceButton]} onPress={() => setPanel('voice')} accessibilityLabel="Open voice control"><Ionicons name="mic-outline" size={19} color={theme.colors.accent} /></Pressable>
    </CinematicSurface>
    {focused && active && sceneEnabled ? <SceneSession key={attempt} covered={panel !== null} onRetry={() => setAttempt((value) => value + 1)} onDevices={() => setPanel('devices')} />
        : <View style={styles.scene}>{!sceneEnabled && <View style={styles.feedback}><Text style={styles.feedbackTitle}>House view is paused</Text><Text style={styles.feedbackText}>The home menu and device controls remain available.</Text></View>}</View>}
    </HomeWorkspace>
    {focused && active && panel === 'devices' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><HomeDeviceLibrary onClose={() => setPanel(null)} /></Suspense></HomePanelBoundary>}
    {focused && active && panel === 'voice' && <Modal transparent visible animationType="none" onRequestClose={() => setPanel(null)}>
      <SafeAreaView style={styles.modalOverlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.voiceWrap}>
        <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><HomeVoicePanel onClose={() => setPanel(null)} /></Suspense></HomePanelBoundary>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>}
  </SafeAreaView>;
}

/** Give optional native panels a lightweight, themed loading state. */
function LoadingFeature() {
  return <View style={styles.featureLoading}><ActivityIndicator color={theme.colors.accent} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  header: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  brandIcon: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  voiceButton: { borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
  identity: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.text, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  brandTail: { fontWeight: '300', color: theme.colors.accent },
  caption: { color: theme.colors.subtext, fontSize: 9, marginTop: 5 },
  scene: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  featureLoading: { padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg0 },
  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlayStrong, justifyContent: 'center', alignItems: 'center', padding: 14 },
  voiceWrap: { width: '100%', maxWidth: 520, maxHeight: '100%' },
  saveNotice: { position: 'absolute', bottom: 8, left: 12, right: 12, padding: 10, gap: 8, borderRadius: theme.radius.sm, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke },
  saveNoticeText: { color: theme.colors.text, fontSize: 12, textAlign: 'center' },
  feedback: { ...StyleSheet.absoluteFillObject, padding: theme.spacing(3), justifyContent: 'center', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.bg0 },
  feedbackTitle: { color: theme.colors.text, fontWeight: '600', fontSize: 18, textAlign: 'center' },
  feedbackText: { color: theme.colors.subtext, fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(3), paddingVertical: 10, backgroundColor: theme.colors.accent2 },
  retryText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
});
