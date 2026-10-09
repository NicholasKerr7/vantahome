import React, { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../components/Pressable';
import SceneSurface from '../features/three-d-home/SceneSurface';
import PropertyArrival from '../features/home-access/PropertyArrival';
import type { SceneStatus, SceneSurfaceProps } from '../features/three-d-home/protocol';
import type { SimulationSaveStatus } from '../features/three-d-home/simulationPersistence';
import HomeWorkspace from '../features/home-shell/HomeWorkspace';
import HomePanelBoundary from '../features/home-shell/HomePanelBoundary';
import { theme } from '../theme/theme';
import { isThreeDHomeEnabled } from '../config/threeDHome';
import { useDeviceRoutines } from '../features/three-d-home/useDeviceRoutines';
import { useScenePresentationPaused } from '../features/home-shell/ScenePresentationContext';
import UnifiedHomeHeader from '../features/home-shell/UnifiedHomeHeader';
import type { HomeChromeCommand, HomeChromeSnapshot } from '../../packages/home-scene/src/homeChromeProtocol';
import { useHomeStore } from '../store/useHomeStore';
import { modelPresentationIdentity } from '../features/three-d-home/modelSceneAccess';
import { useRetainedScene } from '../features/three-d-home/useRetainedScene';
import ModelSimulationSetup from '../features/three-d-home/components/ModelSimulationSetup';
import { canPrepareModelSimulation } from '../services/modelSimulationSetup';

const HomeVoicePanel = React.lazy(() => import('../features/home-voice/HomeVoicePanel'));
const HomeDeviceLibrary = React.lazy(() => import('../features/home-shell/HomeDeviceLibrary'));
const AccountSheet = React.lazy(() => import('../features/account/AccountSheet'));
const AccountPreferences = React.lazy(() => import('../features/account/AccountPreferences'));

type SessionProps = Pick<SceneSurfaceProps, 'onChromeSnapshot' | 'chromeCommand' | 'allowChromePreferencesWhileSuspended'> & {
  onRetry: () => void; onDevices: () => void; covered: boolean; onSceneStatus: (status: SceneStatus | 'loading') => void;
};

/** Bound loading time while the surrounding home navigation always remains available. */
function SceneSession({ onRetry, onDevices, covered, onSceneStatus, onChromeSnapshot, chromeCommand, allowChromePreferencesWhileSuspended }: SessionProps) {
  const workspaceCovered = useScenePresentationPaused();
  const openDeviceRoutines = useDeviceRoutines();
  const [status, setStatus] = useState<SceneStatus | 'loading'>('loading');
  const [saveStatus, setSaveStatus] = useState<SimulationSaveStatus>('saving');
  /** Notify the native header without replacing the renderer's stable load callback. */
  const updateStatus = useCallback((next: SceneStatus) => { setStatus(next); onSceneStatus(next); }, [onSceneStatus]);
  useEffect(() => {
    if (status !== 'loading') return;
    const timeout = setTimeout(() => updateStatus('error'), 90_000);
    return () => clearTimeout(timeout);
  }, [status, updateStatus]);
  return <View style={styles.scene}>
    {status !== 'error' && <SceneSurface suspended={covered || workspaceCovered} onStatus={updateStatus} onSaveStatus={setSaveStatus} onDeviceRoutines={openDeviceRoutines}
      onChromeSnapshot={onChromeSnapshot} chromeCommand={chromeCommand} allowChromePreferencesWhileSuspended={allowChromePreferencesWhileSuspended && !workspaceCovered} />}
    {status === 'ready' && (saveStatus === 'error' || saveStatus === 'disconnected') && <View style={styles.saveNotice} accessibilityLiveRegion="polite">
      <Text style={styles.saveNoticeText}>{saveStatus === 'error'
        ? 'A change couldn’t be completed or saved. Review your controls and try again.'
        : 'Your app session changed. Reload the house to reconnect.'}</Text>
      {saveStatus === 'disconnected' && <Pressable onPress={onRetry} accessibilityLabel="Reconnect house controls" style={styles.retry}><Text style={styles.retryText}>Reconnect</Text></Pressable>}
    </View>}
    {status === 'loading' && <PropertyArrival active={!covered && !workspaceCovered} />}
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
  const identity = useHomeStore(modelPresentationIdentity);
  const accessCurrent = useHomeStore((state) => !(state.accountUserId || state.authenticatedUserId) || state.membershipReady);
  const needsModelSetup = useHomeStore(canPrepareModelSimulation);
  const focused = useIsFocused();
  const { active, retained, suspended } = useRetainedScene(focused && accessCurrent && !needsModelSetup);
  const [attempt, setAttempt] = useState(0);
  const [panel, setPanel] = useState<'voice' | 'devices' | 'account' | 'preferences' | null>(null);
  const [chrome, setChrome] = useState<{ key: string; snapshot: HomeChromeSnapshot } | null>(null);
  const [rendererStatus, setRendererStatus] = useState<{ key: string; status: SceneStatus | 'loading' } | null>(null);
  const [command, setCommand] = useState<{ key: string; request: NonNullable<SceneSurfaceProps['chromeCommand']> } | null>(null);
  const commandId = useRef(0);
  const sessionKey = `${identity}:${attempt}`;
  const currentSessionKey = useRef<string | null>(sessionKey);
  useLayoutEffect(() => {
    currentSessionKey.current = retained ? sessionKey : null;
    return () => { currentSessionKey.current = null; };
  }, [sessionKey, retained]);
  const sceneEnabled = isThreeDHomeEnabled();
  const sceneReady = rendererStatus?.key === sessionKey && rendererStatus.status === 'ready' && retained && sceneEnabled && accessCurrent && !needsModelSetup;
  const visibleChrome = accessCurrent && retained && chrome?.key === sessionKey && rendererStatus?.status !== 'error' ? chrome.snapshot : null;
  /** Scope late renderer updates to their originating home and renderer lifetime. */
  const updateChrome = useCallback((snapshot: HomeChromeSnapshot) => {
    if (currentSessionKey.current === sessionKey) setChrome({ key: sessionKey, snapshot });
  }, [sessionKey]);
  /** Old load callbacks cannot mark a replacement home ready. */
  const updateRendererStatus = useCallback((status: SceneStatus | 'loading') => {
    if (currentSessionKey.current === sessionKey) setRendererStatus({ key: sessionKey, status });
  }, [sessionKey]);
  /** Send only a fresh visible user action; closing a preference sheet and opening scene help share one commit. */
  const sendChromeCommand = useCallback((next: HomeChromeCommand) => {
    if (!sceneReady || !focused || suspended || !accessCurrent || modelPresentationIdentity(useHomeStore.getState()) !== identity) return;
    if (next.type === 'open-environment' || next.type === 'open-preferences') setPanel(null);
    setCommand({ key: sessionKey, request: { id: ++commandId.current, command: next } });
  }, [sceneReady, focused, suspended, accessCurrent, identity, sessionKey]);
  useEffect(() => {
    // Native modals are separate windows; close them before an access-recheck shield appears.
    if (!active || !focused || !accessCurrent) setPanel(null);
    if (suspended || !focused || !accessCurrent) setCommand(null);
  }, [active, focused, accessCurrent, suspended]);
  useEffect(() => {
    // A released WebView must re-establish readiness before its header sends any new action.
    if (!retained) {
      setRendererStatus(null); setChrome(null); setCommand(null);
      // A later remount has a distinct lifetime even when its home is unchanged.
      setAttempt((value) => value + 1);
    }
  }, [retained]);
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
    <HomeWorkspace section="home">
    <UnifiedHomeHeader scene={visibleChrome} ready={sceneReady && Boolean(visibleChrome)}
      onEnvironment={() => sendChromeCommand({ type: 'open-environment' })} onVoice={() => setPanel('voice')} onAccount={() => setPanel('account')} />
    {needsModelSetup ? (focused && active ? <ModelSimulationSetup /> : <View style={styles.scene} />) : retained && sceneEnabled ? <SceneSession key={sessionKey} covered={panel !== null || suspended || !accessCurrent} onRetry={() => setAttempt((value) => value + 1)} onDevices={() => setPanel('devices')}
      onSceneStatus={updateRendererStatus} onChromeSnapshot={updateChrome} chromeCommand={command?.key === sessionKey ? command.request : undefined}
      allowChromePreferencesWhileSuspended={panel === 'preferences' && focused && !suspended && accessCurrent} />
        : <View style={styles.scene}>{!sceneEnabled && <View style={styles.feedback}><Text style={styles.feedbackTitle}>House view is paused</Text><Text style={styles.feedbackText}>The home menu and device controls remain available.</Text></View>}</View>}
    </HomeWorkspace>
    {focused && active && accessCurrent && panel === 'account' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><AccountSheet onClose={() => setPanel(null)} onPreferences={() => setPanel('preferences')} /></Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'preferences' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}>
      <AccountPreferences scene={sceneReady ? visibleChrome : null} onSceneCommand={sendChromeCommand} onClose={() => setPanel(null)} onBack={() => setPanel('account')} />
    </Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'devices' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><HomeDeviceLibrary onClose={() => setPanel(null)} /></Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'voice' && <Modal transparent visible animationType="none" onRequestClose={() => setPanel(null)}>
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
