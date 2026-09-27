import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../app/AppNavigator';
import Pressable from '../components/Pressable';
import SceneSurface from '../features/three-d-home/SceneSurface';
import type { SceneStatus } from '../features/three-d-home/protocol';
import type { SimulationSaveStatus } from '../features/three-d-home/simulationPersistence';
import { theme } from '../theme/theme';
import { isRendererLabEnabled } from '../config/rendererLab';

const RendererLab = React.lazy(() => import('../features/renderer-lab/RendererLab'));

/** Bound loading time and let users recover without ever losing the dashboard return action. */
function SceneSession({ onRetry }: { onRetry: () => void }) {
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
        : 'Your app session changed. Reopen 3D Home to reconnect the simulation.'}</Text>
    </View>}
    {status === 'loading' && <View style={styles.feedback} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={theme.colors.accent} />
      <Text style={styles.feedbackTitle}>Preparing your 3D home…</Text>
      <Text style={styles.feedbackText}>Loading the furnished house and landscape.</Text>
    </View>}
    {status === 'error' && <View style={styles.feedback} accessibilityRole="alert">
      <Ionicons name="cube-outline" size={32} color={theme.colors.accent} />
      <Text style={styles.feedbackTitle}>The 3D view couldn’t load</Text>
      <Text style={styles.feedbackText}>Try again, or return to your dashboard.</Text>
      <Pressable style={styles.retry} onPress={onRetry} accessibilityLabel="Retry 3D Home">
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>}
  </View>;
}

/** Keep the original app authoritative while presenting an explicitly separate simulation. */
export default function ThreeDHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [attempt, setAttempt] = useState(0);
  const [showLab, setShowLab] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Brief inactive states (system overlays) need not discard the scene.
      if (state !== 'inactive') setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={() => showLab ? setShowLab(false) : navigation.goBack()} accessibilityLabel={showLab ? 'Back to 3D Home' : 'Back to dashboard'}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        <Text style={styles.backText}>{showLab ? '3D Home' : 'Dashboard'}</Text>
      </Pressable>
      <View style={styles.identity}>
        <Text style={styles.title}>{showLab ? 'Renderer preview' : '3D Home'}</Text>
        <Text style={styles.caption}>Simulation · no real device control</Text>
      </View>
      {!showLab && isRendererLabEnabled() && <Pressable style={styles.labButton} onPress={() => setShowLab(true)} accessibilityLabel="Open renderer preview">
        <Ionicons name="flask-outline" size={20} color={theme.colors.text} />
      </Pressable>}
    </View>
    {showLab ? <Suspense fallback={<View style={styles.labLoading}><ActivityIndicator color={theme.colors.accent} /></View>}>
      <RendererLab active={focused && active} />
    </Suspense> : focused && active ? <SceneSession key={attempt} onRetry={() => setAttempt((value) => value + 1)} /> : <View style={styles.scene} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  header: { minHeight: 58, paddingHorizontal: theme.spacing(2), paddingVertical: theme.spacing(1), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(1), borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, paddingRight: theme.spacing(1) },
  backText: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  labButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  labLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#101516' },
  identity: { flexShrink: 1, alignItems: 'flex-end' },
  title: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  caption: { color: theme.colors.subtext, fontSize: 10, marginTop: 2, textAlign: 'right' },
  scene: { flex: 1, overflow: 'hidden', backgroundColor: '#101516' },
  saveNotice: { position: 'absolute', bottom: 8, left: 12, right: 12, padding: 10, borderRadius: theme.radius.sm, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke },
  saveNoticeText: { color: theme.colors.text, fontSize: 12, textAlign: 'center' },
  feedback: { ...StyleSheet.absoluteFillObject, padding: theme.spacing(3), justifyContent: 'center', alignItems: 'center', gap: theme.spacing(2), backgroundColor: '#101516' },
  feedbackTitle: { color: theme.colors.text, fontWeight: '600', fontSize: 18, textAlign: 'center' },
  feedbackText: { color: theme.colors.subtext, fontSize: 14, textAlign: 'center' },
  retry: { borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(3), paddingVertical: theme.spacing(1.5), backgroundColor: theme.colors.accent2 },
  retryText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
});
