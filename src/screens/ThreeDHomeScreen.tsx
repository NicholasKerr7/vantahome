import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../app/AppNavigator';
import { openHomeFeature } from '../app/homeNavigation';
import Pressable from '../components/Pressable';
import { useCommandActivityLauncher } from '../components/command-feedback/CommandActivityContext';
import SceneSurface from '../features/three-d-home/SceneSurface';
import type { SceneStatus } from '../features/three-d-home/protocol';
import type { SimulationSaveStatus } from '../features/three-d-home/simulationPersistence';
import HomeMenu from '../features/home-shell/HomeMenu';
import HomePanelBoundary from '../features/home-shell/HomePanelBoundary';
import type { HomeDestination } from '../features/home-shell/homeDestinations';
import { theme } from '../theme/theme';
import { isRendererLabEnabled } from '../config/rendererLab';
import { isThreeDHomeEnabled } from '../config/threeDHome';

const RendererLab = React.lazy(() => import('../features/renderer-lab/RendererLab'));
const HomeVoicePanel = React.lazy(() => import('../features/home-voice/HomeVoicePanel'));
const HomeDeviceLibrary = React.lazy(() => import('../features/home-shell/HomeDeviceLibrary'));

/** Bound loading time while the surrounding home navigation always remains available. */
function SceneSession({ onRetry, onDevices }: { onRetry: () => void; onDevices: () => void }) {
  const [status, setStatus] = useState<SceneStatus | 'loading'>('loading');
  const [saveStatus, setSaveStatus] = useState<SimulationSaveStatus>('saving');
  useEffect(() => {
    if (status !== 'loading') return;
    const timeout = setTimeout(() => setStatus('error'), 90_000);
    return () => clearTimeout(timeout);
  }, [status]);
  return <View style={styles.scene}>
    {status !== 'error' && <SceneSurface onStatus={setStatus} onSaveStatus={setSaveStatus} />}
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

/** Start in the house, with all original app features reachable through one menu. */
export default function ThreeDHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const commandActivity = useCommandActivityLauncher();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [attempt, setAttempt] = useState(0);
  const [showLab, setShowLab] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'voice' | 'devices' | null>(null);
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
  useEffect(() => {
    if (!focused || !showLab) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setShowLab(false); return true; });
    return () => subscription.remove();
  }, [focused, showLab]);

  /** Preserve existing route contracts while removing the old dashboard from the journey. */
  function openDestination(destination: HomeDestination) {
    setPanel(null);
    switch (destination) {
      case 'scenes': openHomeFeature(navigation.dispatch, 'Scenes'); break;
      case 'automations': openHomeFeature(navigation.dispatch, 'Automations'); break;
      case 'settings': openHomeFeature(navigation.dispatch, 'Settings'); break;
      case 'integrations': navigation.navigate('Integrations'); break;
      case 'cameras': navigation.navigate('Cameras'); break;
      case 'notifications': navigation.navigate('Notifications'); break;
      case 'rooms': navigation.navigate('ManageRooms'); break;
      case 'devices': navigation.navigate('Room', { showAll: true }); break;
      case 'household': navigation.navigate('Profile'); break;
      case 'audit': navigation.navigate('AuditLog'); break;
      case 'activity': commandActivity?.open(); break;
      case 'renderer': setShowLab(true); break;
    }
  }

  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
    <View style={styles.header}>
      <Pressable style={styles.iconButton} onPress={() => showLab ? setShowLab(false) : setPanel('menu')}
        accessibilityLabel={showLab ? 'Back to 3D Home' : 'Open home menu'}>
        <Ionicons name={showLab ? 'arrow-back' : 'grid-outline'} size={21} color={theme.colors.accent} />
      </Pressable>
      <View style={styles.identity}>
        <Text style={styles.title}>{showLab ? 'Renderer preview' : 'Home'}</Text>
        <Text style={styles.caption}>Simulation · no real device control</Text>
      </View>
      <Pressable style={styles.iconButton} onPress={() => setPanel('voice')} accessibilityLabel="Open voice control"><Ionicons name="mic-outline" size={21} color={theme.colors.accent} /></Pressable>
      <Pressable style={styles.iconButton} onPress={() => setPanel('devices')} accessibilityLabel="Open house device library"><Ionicons name="options-outline" size={21} color={theme.colors.text} /></Pressable>
    </View>
    {showLab ? <HomePanelBoundary onClose={() => setShowLab(false)}><Suspense fallback={<LoadingFeature />}><RendererLab active={focused && active} /></Suspense></HomePanelBoundary>
      : focused && active && sceneEnabled ? <SceneSession key={attempt} onRetry={() => setAttempt((value) => value + 1)} onDevices={() => setPanel('devices')} />
        : <View style={styles.scene}>{!sceneEnabled && <View style={styles.feedback}><Text style={styles.feedbackTitle}>House view is paused</Text><Text style={styles.feedbackText}>The home menu and device controls remain available.</Text></View>}</View>}
    {focused && active && panel === 'menu' && <HomeMenu onClose={() => setPanel(null)} onSelect={openDestination} rendererAvailable={isRendererLabEnabled()} activityAvailable={Boolean(commandActivity)} />}
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
  header: { minHeight: 56, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  identity: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  caption: { color: theme.colors.subtext, fontSize: 9, marginTop: 3 },
  scene: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  featureLoading: { padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg0 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,9,5,0.78)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  voiceWrap: { width: '100%', maxWidth: 520, maxHeight: '100%' },
  saveNotice: { position: 'absolute', bottom: 8, left: 12, right: 12, padding: 10, gap: 8, borderRadius: theme.radius.sm, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke },
  saveNoticeText: { color: theme.colors.text, fontSize: 12, textAlign: 'center' },
  feedback: { ...StyleSheet.absoluteFillObject, padding: theme.spacing(3), justifyContent: 'center', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.bg0 },
  feedbackTitle: { color: theme.colors.text, fontWeight: '600', fontSize: 18, textAlign: 'center' },
  feedbackText: { color: theme.colors.subtext, fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(3), paddingVertical: 10, backgroundColor: theme.colors.accent2 },
  retryText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
});
