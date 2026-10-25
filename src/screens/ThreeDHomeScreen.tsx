import { openSceneEndReview } from '../features/scenes/sceneEndNavigation';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../app/HomeNavigator';
import { consumeCameraLocation, openCameraViewer, resolveCameraDeviceId } from '../features/cameras/cameraNavigation';
import type { AssistantVoiceRequest } from '../features/home-assistant/useAssistantVoiceRequests';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../components/Pressable';
import SceneSurface from '../features/three-d-home/SceneSurface';
import PropertyArrival from '../features/home-access/PropertyArrival';
import type { SceneStatus, SceneSurfaceProps } from '../features/three-d-home/protocol';
import { simulationLoadFailureMessage, type SimulationSaveStatus } from '../features/three-d-home/simulationPersistence';
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
import { useSceneArrival } from '../features/arrival/ArrivalContext';
import { canEditSimulationDevice } from '../services/simulationDeviceEditing';
import { canManageSimulationDevices } from '../services/simulationDeviceRegistration';
import { openHomeFeature } from '../app/homeNavigation';
import { assistantAuthorizationFingerprint } from '../features/home-assistant/assistantContext';
import { assistantPreviewCommand } from '../features/home-assistant/assistantPreviewCommand';
import type { AssistantPreview } from '../features/home-assistant/useHomeConcierge';
import { scenePreviewCommandMessage, type ScenePreviewCommand, type ScenePreviewReport } from '../../packages/home-scene/src/scenePreviewProtocol';
import { useForegroundAssistantVoice } from '../features/home-voice/useForegroundAssistantVoice';

const HomeAssistantPanel = React.lazy(() => import('../features/home-assistant/HomeAssistantPanel'));
const HomeDeviceLibrary = React.lazy(() => import('../features/home-shell/HomeDeviceLibrary'));
const AccountSheet = React.lazy(() => import('../features/account/AccountSheet'));
const AccountPreferences = React.lazy(() => import('../features/account/AccountPreferences'));
const SimulationDeviceEditor = React.lazy(() => import('../features/devices/SimulationDeviceEditor'));

type SessionProps = Pick<SceneSurfaceProps, 'onChromeSnapshot' | 'chromeCommand' | 'allowChromePreferencesWhileSuspended' | 'onDeviceEdit' | 'onCameraWatch' | 'onSceneEndReview' | 'previewCommand' | 'onPreviewReport'> & {
  onRetry: () => void; onDevices: () => void; covered: boolean; onSceneStatus: (status: SceneStatus | 'loading') => void;
  unifiedArrival: boolean;
};

/** Bound loading time while the surrounding home navigation always remains available. */
function SceneSession({ onRetry, onDevices, covered, onSceneStatus, onChromeSnapshot, chromeCommand, allowChromePreferencesWhileSuspended, unifiedArrival, onDeviceEdit, onCameraWatch, onSceneEndReview, previewCommand, onPreviewReport }: SessionProps) {
  const workspaceCovered = useScenePresentationPaused();
  const openDeviceRoutines = useDeviceRoutines();
  const [status, setStatus] = useState<SceneStatus | 'loading'>('loading');
  const [saveStatus, setSaveStatus] = useState<SimulationSaveStatus>('saving');
  const loadFailure = simulationLoadFailureMessage(saveStatus);
  /** Notify the native header without replacing the renderer's stable load callback. */
  const updateStatus = useCallback((next: SceneStatus) => { setStatus(next); }, []);
  // Release the unified arrival shield so cache recovery stays reachable. Keep the
  // renderer mounted: another surface may restore the same validated baseline.
  useEffect(() => { onSceneStatus(loadFailure ? 'error' : status); }, [loadFailure, status, onSceneStatus]);
  useEffect(() => {
    if (status !== 'loading' || loadFailure) return;
    const timeout = setTimeout(() => updateStatus('error'), 90_000);
    return () => clearTimeout(timeout);
  }, [status, updateStatus, loadFailure]);
  return <View style={styles.scene}>
    {status !== 'error' && <SceneSurface suspended={covered || workspaceCovered} onStatus={updateStatus} onSaveStatus={setSaveStatus} onDeviceRoutines={openDeviceRoutines}
      onChromeSnapshot={onChromeSnapshot} chromeCommand={chromeCommand} onDeviceEdit={onDeviceEdit} onCameraWatch={onCameraWatch} onSceneEndReview={onSceneEndReview} previewCommand={previewCommand} onPreviewReport={onPreviewReport} allowChromePreferencesWhileSuspended={allowChromePreferencesWhileSuspended && !workspaceCovered} />}
    {(loadFailure || (status === 'ready' && (saveStatus === 'error' || saveStatus === 'disconnected'))) && <View style={styles.saveNotice} accessibilityLiveRegion="polite">
      <Text style={styles.saveNoticeText}>{loadFailure ?? (saveStatus === 'error'
        ? 'A change couldn’t be completed or saved. Review your controls and try again.'
        : 'Your app session changed. Reload the house to reconnect.')}</Text>
      {(loadFailure || saveStatus === 'disconnected') && <Pressable accessibilityRole="button" onPress={onRetry} accessibilityLabel="Reconnect house controls" style={styles.retry}><Text style={styles.retryText}>{loadFailure ? 'Retry loading' : 'Reconnect'}</Text></Pressable>}
    </View>}
    {status === 'loading' && !unifiedArrival && !loadFailure && <PropertyArrival active={!covered && !workspaceCovered} />}
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
export default function ThreeDHomeScreen({ route }: { route?: RouteProp<HomeStackParamList, 'Home'> } = {}) {
  const navigation = useNavigation();
  const identity = useHomeStore(modelPresentationIdentity);
  const assistantIdentity = useHomeStore(assistantAuthorizationFingerprint);
  const authenticated = useHomeStore((state) => Boolean(state.authenticatedUserId && state.membershipReady));
  const accessCurrent = useHomeStore((state) => !(state.accountUserId || state.authenticatedUserId) || state.membershipReady);
  const needsModelSetup = useHomeStore(canPrepareModelSimulation);
  const focused = useIsFocused();
  const { active, retained, suspended } = useRetainedScene(focused && accessCurrent && !needsModelSetup);
  const [attempt, setAttempt] = useState(0);
  const [panel, setPanel] = useState<'voice' | 'devices' | 'account' | 'preferences' | null>(null);
  const [editing, setEditing] = useState<{ key: string; deviceId: string } | null>(null);
  const editingAllowed = useHomeStore(canManageSimulationDevices);
  const [chrome, setChrome] = useState<{ key: string; snapshot: HomeChromeSnapshot } | null>(null);
  const [rendererStatus, setRendererStatus] = useState<{ key: string; status: SceneStatus | 'loading' } | null>(null);
  const [command, setCommand] = useState<{ key: string; request: NonNullable<SceneSurfaceProps['chromeCommand']> } | null>(null);
  const commandId = useRef(0);
  const previewId = useRef(0);
  const voiceId = useRef(0);
  const [selectedRoom, setSelectedRoom] = useState<{ key: string; roomId: string | null } | null>(null);
  const [previewCommand, setPreviewCommand] = useState<{ key: string; command: ScenePreviewCommand } | null>(null);
  const [previewSession, setPreviewSession] = useState<{ key: string; id: number; accepted: boolean } | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [voiceRequest, setVoiceRequest] = useState<AssistantVoiceRequest | null>(null);
  const sessionKey = `${identity}:${attempt}`;
  const currentSessionKey = useRef<string | null>(sessionKey);
  useLayoutEffect(() => {
    currentSessionKey.current = retained ? sessionKey : null;
    return () => { currentSessionKey.current = null; };
  }, [sessionKey, retained]);
  const sceneEnabled = isThreeDHomeEnabled();
  const sceneReady = rendererStatus?.key === sessionKey && rendererStatus.status === 'ready' && retained && sceneEnabled && accessCurrent && !needsModelSetup;
  const previewing = previewSession?.key === sessionKey;
  const assistantRoomId = selectedRoom?.key === sessionKey ? selectedRoom.roomId : null;
  /** Wake phrases enter the scoped Ask workflow; they never call the direct-command executor. */
  const receiveSpokenQuestion = useCallback((question: string, sessionToken: number) => {
    setVoiceRequest({ id: ++voiceId.current, question, sessionToken, roomId: assistantRoomId, expiresAt: Date.now() + 15_000 }); setPanel('voice');
  }, [assistantRoomId]);
  const voice = useForegroundAssistantVoice({
    scopeKey: `${assistantIdentity}:${assistantRoomId ?? 'all'}`,
    allowed: authenticated && focused && active && accessCurrent && !needsModelSetup && !previewing && !editing && (panel === null || panel === 'voice'),
    onQuestion: receiveSpokenQuestion,
  });
  const consumeSpokenQuestion = useCallback(() => setVoiceRequest(null), []);
  /** Keep hands-free requests bound to the room explicitly selected in Ask. */
  const changeAssistantRoom = useCallback((roomId: string | null) => {
    voice.stop(); setVoiceRequest(null); setSelectedRoom({ key: sessionKey, roomId });
  }, [sessionKey, voice.stop]);
  const editorVisible = editing?.key === sessionKey && editingAllowed && focused && active && accessCurrent;
  const visibleChrome = accessCurrent && retained && chrome?.key === sessionKey && rendererStatus?.status !== 'error' ? chrome.snapshot : null;
  /** The loading film may reveal verified controls while graphics are still preparing. */
  const openControls = useCallback(() => setPanel('devices'), []);
  const unifiedArrival = useSceneArrival(
    needsModelSetup || !sceneEnabled ? 'available'
      : rendererStatus?.key === sessionKey && rendererStatus.status === 'error' ? 'error'
      : sceneReady ? 'ready' : 'loading',
    sessionKey, focused, openControls,
  );
  /** Scope late renderer updates to their originating home and renderer lifetime. */
  const updateChrome = useCallback((snapshot: HomeChromeSnapshot) => {
    if (currentSessionKey.current === sessionKey) setChrome({ key: sessionKey, snapshot });
  }, [sessionKey]);
  /** Old load callbacks cannot mark a replacement home ready. */
  const updateRendererStatus = useCallback((status: SceneStatus | 'loading') => {
    if (currentSessionKey.current === sessionKey) setRendererStatus({ key: sessionKey, status });
  }, [sessionKey]);
  /** Resolve a renderer identifier against the current verified registry, never against message-supplied metadata. */
  const openDeviceEditor = useCallback((modelDeviceId: string) => {
    const state = useHomeStore.getState();
    if (currentSessionKey.current !== sessionKey || !sceneReady || !focused || suspended || !accessCurrent
      || panel || editing || modelPresentationIdentity(state) !== identity) return;
    const device = state.devices.find((candidate) => candidate.modelDeviceId === modelDeviceId);
    if (device && canEditSimulationDevice(state, device.id)) setEditing({ key: sessionKey, deviceId: device.id });
  }, [sessionKey, sceneReady, focused, suspended, accessCurrent, panel, editing, identity]);
  /** Resolve a trusted camera navigation request without invoking any device command. */
  const watchCamera = useCallback((modelDeviceId: string) => {
    const state = useHomeStore.getState();
    if (currentSessionKey.current !== sessionKey || !sceneReady || !focused || suspended || !accessCurrent
      || panel || editing || previewing || modelPresentationIdentity(state) !== identity) return;
    const deviceId = resolveCameraDeviceId(state, modelDeviceId);
    if (deviceId) openCameraViewer(navigation.dispatch, deviceId);
  }, [sessionKey, sceneReady, focused, suspended, accessCurrent, panel, editing, previewing, identity, navigation]);
  /** End opens a native review only while this exact property and foreground access are current. */
  const reviewSceneEnd = useCallback((sceneId: string) => {
    if (currentSessionKey.current !== sessionKey || !sceneReady || !focused || suspended || !accessCurrent
      || panel || editing || previewing || modelPresentationIdentity(useHomeStore.getState()) !== identity) return;
    openSceneEndReview(navigation.dispatch, sceneId);
  }, [sessionKey, sceneReady, focused, suspended, accessCurrent, panel, editing, previewing, identity, navigation]);
  useEffect(() => {
    // The one-use token waits for this same renderer to resume; a stale route never replays it.
    if (!sceneReady || !visibleChrome || !focused || suspended || !accessCurrent || panel || editing || previewing) return;
    const deviceId = consumeCameraLocation(route?.params?.cameraLocationToken);
    if (deviceId) setCommand({ key: sessionKey, request: { id: ++commandId.current, command: { type: 'locate-camera', deviceId } } });
  }, [route?.params?.cameraLocationToken, sceneReady, focused, suspended, accessCurrent, panel, editing, previewing, sessionKey, visibleChrome]);
  /** Keep the retained property camera and controls when the editor is cancelled or saved. */
  const closeDeviceEditor = useCallback(() => setEditing(null), []);
  /** Start only a current, validated display proposal and keep its assistant mounted behind the preview. */
  const openAssistantPreview = useCallback((proposal: AssistantPreview) => {
    if (!sceneReady || !focused || suspended || panel !== 'voice' || !accessCurrent) return;
    const request = assistantPreviewCommand(proposal, ++previewId.current);
    if (!request) { setPreviewNotice('This proposal is no longer current. Ask for a fresh scene.'); return; }
    voice.stop(); setPreviewNotice(null);
    setPreviewSession({ key: sessionKey, id: request.id, accepted: false });
    setPreviewCommand({ key: sessionKey, command: request });
  }, [sceneReady, focused, suspended, panel, accessCurrent, sessionKey, voice.stop]);
  /** Scope all presentation reports to this document; they never write device or household data. */
  const receivePreviewReport = useCallback((report: ScenePreviewReport) => {
    if (currentSessionKey.current !== sessionKey || !accessCurrent) return;
    if (report.type === 'selection') {
      const room = report.modelRoomId === null ? null : useHomeStore.getState().rooms.find((candidate) => candidate.modelRoomId === report.modelRoomId);
      setSelectedRoom({ key: sessionKey, roomId: report.modelRoomId === null ? null : room?.id ?? `unavailable:${report.modelRoomId}` });
      return;
    }
    if (!previewSession || previewSession.key !== sessionKey || previewSession.id !== report.id) return;
    setPreviewSession(report.status === 'active' ? { ...previewSession, accepted: true } : null);
    if (report.status !== 'active') setPreviewNotice(report.status === 'closed' ? 'Preview closed. Your device settings are unchanged.'
      : report.status === 'expired' ? 'The preview expired. Ask for a fresh proposal.'
        : report.status === 'stale' ? 'A setting or access changed. Ask for a fresh proposal.' : 'This preview is unavailable. Your settings are unchanged.');
  }, [sessionKey, accessCurrent, previewSession]);
  useEffect(() => {
    if (previewSession && (panel !== 'voice' || !sceneReady || previewSession.key !== sessionKey)) {
      setPreviewSession(null);
      setPreviewCommand({ key: sessionKey, command: scenePreviewCommandMessage(++previewId.current, null) });
    }
  }, [previewSession, panel, sceneReady, sessionKey]);
  useEffect(() => {
    if (!previewSession || previewSession.accepted) return;
    const id = previewSession.id;
    const timeout = setTimeout(() => {
      setPreviewSession((current) => current?.id === id ? null : current);
      setPreviewCommand({ key: sessionKey, command: scenePreviewCommandMessage(++previewId.current, null) });
      setPreviewNotice('The 3D preview could not open. Your device settings are unchanged.');
    }, 5_000);
    return () => clearTimeout(timeout);
  }, [previewSession, sessionKey]);
  useEffect(() => {
    setPreviewSession(null); setPreviewCommand(null); setPreviewNotice(null); setVoiceRequest(null);
  }, [assistantIdentity]);
  useEffect(() => useHomeStore.subscribe((state) => {
    // Stop private audio synchronously with authority changes, before React commits the new shield.
    if (assistantAuthorizationFingerprint(state) !== assistantIdentity) { voice.stop(); setVoiceRequest(null); }
  }), [assistantIdentity, voice.stop]);
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
    if (!active || !focused || !accessCurrent) { setPreviewSession(null); setPreviewCommand(null); setVoiceRequest(null); }
  }, [active, focused, accessCurrent, suspended]);
  useEffect(() => {
    // An old editor must never reappear after a home change, permission loss or background visit.
    if (!editorVisible) setEditing(null);
  }, [editorVisible]);
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
      voiceActive={voice.enabled} onEnvironment={() => sendChromeCommand({ type: 'open-environment' })} onVoice={() => setPanel('voice')} onAccount={() => setPanel('account')} />
    {needsModelSetup ? (focused && active ? <ModelSimulationSetup /> : <View style={styles.scene} />) : retained && sceneEnabled ? <SceneSession key={sessionKey} unifiedArrival={unifiedArrival} covered={(panel !== null && !previewing) || editorVisible || suspended || !accessCurrent} onRetry={() => setAttempt((value) => value + 1)} onDevices={openControls}
      onSceneStatus={updateRendererStatus} onChromeSnapshot={updateChrome} chromeCommand={command?.key === sessionKey ? command.request : undefined}
      previewCommand={previewCommand?.key === sessionKey ? previewCommand.command : undefined} onPreviewReport={receivePreviewReport}
      onDeviceEdit={openDeviceEditor} onCameraWatch={watchCamera} onSceneEndReview={reviewSceneEnd}
      allowChromePreferencesWhileSuspended={panel === 'preferences' && focused && !suspended && accessCurrent} />
        : <View style={styles.scene}>{!sceneEnabled && <View style={styles.feedback}><Text style={styles.feedbackTitle}>House view is paused</Text><Text style={styles.feedbackText}>The home menu and device controls remain available.</Text></View>}</View>}
    </HomeWorkspace>
    {editorVisible && editing && <HomePanelBoundary onClose={closeDeviceEditor}><Suspense fallback={<LoadingFeature />}>
      <SimulationDeviceEditor deviceId={editing.deviceId} onClose={closeDeviceEditor} onSaved={closeDeviceEditor} savedActionLabel="Back to 3D Home" />
    </Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'account' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><AccountSheet onClose={() => setPanel(null)} onPreferences={() => setPanel('preferences')} /></Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'preferences' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}>
      <AccountPreferences scene={sceneReady ? visibleChrome : null} onSceneCommand={sendChromeCommand} onClose={() => setPanel(null)} onBack={() => setPanel('account')} />
    </Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'devices' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><HomeDeviceLibrary onClose={() => setPanel(null)} /></Suspense></HomePanelBoundary>}
    {focused && active && accessCurrent && panel === 'voice' && <HomePanelBoundary onClose={() => setPanel(null)}><Suspense fallback={<LoadingFeature />}><HomeAssistantPanel modal onClose={() => setPanel(null)}
          initialRoomId={assistantRoomId} onRoomChange={changeAssistantRoom} onPreview={openAssistantPreview} previewing={previewing} previewNotice={previewNotice}
          voice={voice} voiceRequest={voiceRequest} onVoiceRequestConsumed={consumeSpokenQuestion}
          onReviewScene={(token) => { setPanel(null); openHomeFeature(navigation.dispatch, 'Scenes', { assistantDraftToken: token }); }} /></Suspense></HomePanelBoundary>
    }
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
  saveNotice: { position: 'absolute', bottom: 8, left: 12, right: 12, padding: 10, gap: 8, borderRadius: theme.radius.sm, backgroundColor: theme.colors.bg0, borderWidth: 1, borderColor: theme.colors.stroke },
  saveNoticeText: { color: theme.colors.text, fontSize: 12, textAlign: 'center' },
  feedback: { ...StyleSheet.absoluteFillObject, padding: theme.spacing(3), justifyContent: 'center', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.bg0 },
  feedbackTitle: { color: theme.colors.text, fontWeight: '600', fontSize: 18, textAlign: 'center' },
  feedbackText: { color: theme.colors.subtext, fontSize: 14, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(3), paddingVertical: 10, backgroundColor: theme.colors.accent2 },
  retryText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
});
