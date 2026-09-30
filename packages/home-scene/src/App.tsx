import { getFireIncident } from './fireSafetySimulation';
import { SafetyPreview, useSafetyPreviewClock } from './SafetyPreview';
import { getModelUrl, isEmbeddedScene, reportSceneStatus, type ModelName } from './embeddedHost';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { Home, Layers3, MoveUpRight, RotateCcw } from 'lucide-react';
import HouseScene from './scene/HouseScene';
import { QuickDeviceControls } from './QuickDeviceControls';
import { DeviceControlSheet } from './DeviceControlSheet';
import { useInlineInspectorVisibility } from './useInlineInspectorVisibility';
import { useOrientationPaused } from './DeviceViewport';
import { getDevice, getRoom, type DeviceId } from './data';
import { DashboardHeader, DashboardRooms, DashboardRoomBar, DashboardScenes, DashboardDock } from './DashboardChrome';
import { DashboardInspector } from './DashboardInspector';
import { DashboardLibrary, type DashboardLibraryView } from './DashboardLibrary';
import { useHomeStore } from './state';
import { useSimulationBridge } from './useSimulationBridge';
import { useLiveEnvironment, type LiveEnvironment } from './environment/useLiveEnvironment';
import { CinematicViewControl } from './CinematicViewControl';
import { ResetViewControl } from './ResetViewControl';
import { useCinematicStore } from './cinematicStore';
import { useHostPresentation } from './useHostPresentation';
import { useViewportManipulation } from './useViewportManipulation';
import './styles.css';
import './device-catalog.css';
import './dashboard.css';
import './cinematic-ui.css';

/** React to live operating-system motion changes without polling or duplicate listeners. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    setReduced(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);
  return reduced;
}

/** Contain graphics failures so the ordinary device controls remain usable. */
class SceneErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };

  /** Replace an unsuccessful WebGL tree with a useful recovery action. */
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }

  /** Let the host offer its dashboard fallback when graphics fail. */
  componentDidCatch(): void { reportSceneStatus('error'); }

  /** Keep the fallback independent of the graphics runtime. */
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <div className="scene-fallback" role="alert">
      <Layers3 size={32} aria-hidden="true" />
      <h3>The 3D view couldn’t load.</h3>
      <p>You can still explore every device using the room controls. Try the view again, or use a browser with WebGL enabled.</p>
      <button className="button button-primary" onClick={this.props.onRetry}><RotateCcw size={15} aria-hidden="true" />Retry 3D view</button>
    </div>;
  }
}

/** Show the home with persistent, accessible scene controls and loading feedback. */
function HomeViewport({ environment, reducedMotion, onFullControls, sheetDeviceId, onCloseFullControls, covered }: { environment: LiveEnvironment; reducedMotion: boolean; onFullControls: (id: DeviceId) => void; sheetDeviceId: DeviceId | null; onCloseFullControls: () => void; covered: boolean }): ReactNode {
  const viewportRef = useViewportManipulation();
  const showcase = useCinematicStore((state) => state.showcase);
  const setShowcase = useCinematicStore((state) => state.setShowcase);
  const orientationPaused = useOrientationPaused();
  const view = useHomeStore((state) => state.view);
  const floor = useHomeStore((state) => state.floor);
  const roomId = useHomeStore((state) => state.roomId);
  const night = useHomeStore((state) => state.night);
  const lightingMode = useHomeStore((state) => state.lightingMode);
  const deviceStates = useHomeStore((state) => state.deviceStates);
  const selectedDevice = useHomeStore((state) => state.selectedDevice);
  const setView = useHomeStore((state) => state.setView);
  const selectHotspotDevice = useHomeStore((state) => state.selectHotspotDevice);
  const inlineInspector = useInlineInspectorVisibility(selectedDevice);
  const [readyModel, setReadyModel] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [quickDeviceId, setQuickDeviceId] = useState<DeviceId | null>(null);
  const quickTrigger = useRef<DeviceId | null>(null);

  /** Resolve the current hotspot because the 3D HTML layer can replace its DOM node. */
  const restoreHotspotFocus = useCallback(() => {
    const hotspot = quickTrigger.current ? document.querySelector<HTMLElement>(`[data-device-hotspot="${quickTrigger.current}"]`) : null;
    (hotspot ?? document.querySelector('canvas'))?.focus({ preventScroll: true });
  }, []);

  /** Select the dashboard device, or open quick controls when it is out of reach. */
  const openDeviceControls = useCallback((id: string) => {
    const device = getDevice(id);
    if (!device) return;
    setShowcase(false);
    quickTrigger.current = device.id;
    selectHotspotDevice(device.id);
    setQuickDeviceId((current) => inlineInspector ? null : current === device.id ? null : device.id);
    if (inlineInspector) requestAnimationFrame(() => document.getElementById('device-control-title')?.focus({ preventScroll: true }));
  }, [inlineInspector, selectHotspotDevice, setShowcase]);

  /** Restore the opening hotspot only for an explicit dismiss, not an outside tap. */
  const closeQuickControls = useCallback((restoreFocus = true) => {
    setQuickDeviceId(null);
    if (restoreFocus) requestAnimationFrame(restoreHotspotFocus);
  }, [restoreHotspotFocus]);

  /** Expand the hotspot panel into the shared full-control sheet. */
  const openFullControls = useCallback((id: DeviceId) => {
    setQuickDeviceId(null);
    onFullControls(id);
  }, [onFullControls]);

  // Floor cutaways have distinct views; exterior picks can cross floors in place.
  useEffect(() => { setQuickDeviceId(null); }, [view]);
  // Keyboard-started playback dismisses the non-modal quick panel just like an outside tap.
  useEffect(() => { if (showcase) setQuickDeviceId(null); }, [showcase]);
  // Dismiss transient controls while retaining the mounted scene and its camera.
  useEffect(() => {
    if (!orientationPaused) return;
    setQuickDeviceId(null);
  }, [orientationPaused]);
  useEffect(() => {
    if (quickDeviceId && selectedDevice !== quickDeviceId) setQuickDeviceId(null);
  }, [quickDeviceId, selectedDevice]);
  // Transfer transient controls only when rotation makes the inspector visible.
  const wasInlineInspector = useRef(inlineInspector);
  useEffect(() => {
    const becameVisible = inlineInspector && !wasInlineInspector.current;
    wasInlineInspector.current = inlineInspector;
    if (!becameVisible || (!quickDeviceId && !sheetDeviceId)) return;
    setQuickDeviceId(null);
    if (sheetDeviceId) onCloseFullControls();
    requestAnimationFrame(() => document.getElementById('device-control-title')?.focus({ preventScroll: true }));
  }, [inlineInspector, quickDeviceId, sheetDeviceId, onCloseFullControls]);
  // Immersive and exterior share one asset; device updates never reset loading.
  const modelId = view === 'ground' || view === 'upper' ? view : 'exterior';
  const readinessId = `${attempt}:${modelId}`;
  const ready = readyModel === readinessId;
  const onReady = useCallback(() => { setReadyModel(readinessId); reportSceneStatus('ready'); }, [readinessId]);
  const retryScene = useCallback(() => {
    // Failed GLTF requests are cached across remounts; retry each view with a fresh request.
    for (const model of ['exterior', 'ground', 'upper', 'landscape', 'gate'] as ModelName[]) {
      useGLTF.clear(getModelUrl(model));
    }
    setAttempt((value) => value + 1);
  }, []);
  const room = getRoom(roomId);
  return <section ref={viewportRef} id="house-preview" tabIndex={-1} className={`viewport ${night ? 'is-night' : ''} ${showcase ? 'is-cinematic' : ''}`} aria-label="Interactive furnished house preview">
    <div className="viewport-top"><div className="viewport-identity"><span className="eyebrow"><span className="viewport-live-mark" />{view === 'exterior' ? 'PROPERTY VIEW' : view === 'immersive' ? 'ROOM VIEW' : `${floor.toUpperCase()} FLOOR`}</span><h1>{view === 'exterior' ? 'Seaview grounds' : room.name}</h1><p>{view === 'exterior' ? 'The full property, from arrival to home.' : room.area}</p></div><div className="viewport-camera-controls" role="group" aria-label="Camera controls"><ResetViewControl unavailable={orientationPaused || !ready} /><CinematicViewControl reducedMotion={reducedMotion} immersive={view === 'immersive'} unavailable={orientationPaused || !ready} /></div></div>
    <div className="scene-container">
      <SceneErrorBoundary key={attempt} onRetry={retryScene}>
        <HouseScene daylight={lightingMode === 'auto' ? environment.daylight : Number(!night)} environment={environment} suspended={orientationPaused || covered} view={view} floor={floor} roomId={roomId} night={night} deviceStates={deviceStates} selectedDevice={quickDeviceId ?? selectedDevice} quickDeviceId={quickDeviceId} hotspotControlMode={inlineInspector ? 'inspector' : 'quick'} reducedMotion={reducedMotion} onSelectDevice={openDeviceControls} onReady={onReady} />
        {!ready ? <div className="scene-loading" role="status"><span className="loading-orbit"><Home size={24} strokeWidth={1.4} aria-hidden="true" /></span><span>Preparing your home<span className="loading-dots">…</span></span></div> : null}
      </SceneErrorBoundary>
    </div>
    {!orientationPaused && quickDeviceId ? <QuickDeviceControls deviceId={quickDeviceId} onClose={closeQuickControls} onFullControls={openFullControls} /> : null}
    <div className="viewport-bottom"><span className="scene-instruction"><span className="mouse-indicator" />{view === 'immersive' ? 'Drag to look around · fixed viewpoint' : 'Drag to rotate · pinch to zoom · select a device'}</span><div className="view-controls" aria-label="House view"><button aria-pressed={view === 'exterior'} onClick={() => setView(view === 'exterior' ? floor : 'exterior')}><Home size={15} aria-hidden="true" /><span>Landscape</span></button><button aria-pressed={view === 'ground' || view === 'upper'} onClick={() => setView(floor)}><Layers3 size={15} aria-hidden="true" /><span>Floor plan</span></button><button aria-pressed={view === 'immersive'} onClick={() => setView(view === 'immersive' ? floor : 'immersive')}><MoveUpRight size={15} aria-hidden="true" /><span>{roomId === 'grounds' ? 'Gate view' : 'Immersive'}</span></button></div></div>
  </section>;
}

/** Compose a fixed dashboard while keeping the scene and simulation state mounted. */
export default function App(): ReactNode {
  const embedded = isEmbeddedScene();
  const hostSuspended = useHostPresentation();
  const { hydrated: simulationHydrated, syncError: simulationSyncError } = useSimulationBridge();
  useSafetyPreviewClock(!embedded && simulationHydrated);
  const prefersReduced = usePrefersReducedMotion();
  const environment = useLiveEnvironment();
  const lightingMode = useHomeStore((state) => state.lightingMode);
  const syncAutomaticLighting = useHomeStore((state) => state.syncAutomaticLighting);
  // Apply dawn/dusk once per transition, leaving individual light overrides usable.
  useEffect(() => {
    if (!simulationHydrated || lightingMode !== 'auto') return;
    // Reopening an embedded scene preserves pole overrides until the next dawn or dusk.
    if (!isEmbeddedScene() || useHomeStore.getState().night !== environment.isNight) syncAutomaticLighting(environment.isNight);
  }, [environment.isNight, lightingMode, simulationHydrated, syncAutomaticLighting]);
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const persistenceError = useHomeStore((state) => state.persistenceError);
  const emergencyVisible = useHomeStore((state) => {
    const incident = getFireIncident(state.deviceStates);
    return incident.active && !incident.acknowledged;
  });
  const selectDevice = useHomeStore((state) => state.selectDevice);
  const reducedMotion = prefersReduced || motionDisabled;
  const orientationPaused = useOrientationPaused();
  const [library, setLibrary] = useState<DashboardLibraryView | null>(null);
  const [sheetDeviceId, setSheetDeviceId] = useState<DeviceId | null>(null);
  const [documentHidden, setDocumentHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const setShowcase = useCinematicStore((state) => state.setShowcase);
  const sheetTrigger = useRef<HTMLElement | null>(null);
  const sheetHotspot = useRef<string | null>(null);

  /** Remember the actual opening control so every device sheet can return focus. */
  const openFullControls = useCallback((id: DeviceId) => {
    setShowcase(false);
    sheetTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetHotspot.current = sheetTrigger.current?.closest('#quick-device-controls') ? id : null;
    setLibrary(null);
    setSheetDeviceId(id);
  }, [setShowcase]);

  /** Restore a live trigger, with a scene fallback when a browser card was removed. */
  const closeFullControls = useCallback(() => {
    setSheetDeviceId(null);
    requestAnimationFrame(() => {
      const hotspot = sheetHotspot.current ? document.querySelector<HTMLElement>(`[data-device-hotspot="${sheetHotspot.current}"]`) : null;
      const trigger = sheetTrigger.current;
      const target = hotspot ?? (trigger?.isConnected && trigger.checkVisibility() ? trigger : document.querySelector<HTMLCanvasElement>('canvas'));
      target?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!orientationPaused) return;
    setLibrary(null);
    setSheetDeviceId(null);
  }, [orientationPaused]);

  // Cinematic playback never competes with dialogs or an accessibility motion preference.
  useEffect(() => {
    if (library || sheetDeviceId || reducedMotion || orientationPaused) setShowcase(false);
  }, [library, sheetDeviceId, reducedMotion, orientationPaused, setShowcase]);

  // Pause CSS transitions and camera playback while the WebView is backgrounded.
  useEffect(() => {
    const updateVisibility = () => {
      setDocumentHidden(document.hidden);
      if (document.hidden) setShowcase(false);
    };
    document.addEventListener('visibilitychange', updateVisibility);
    updateVisibility();
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [setShowcase]);

  // Dismiss lower dialogs once when a new incident needs attention, keeping its banner reachable.
  useEffect(() => {
    if (emergencyVisible) { setLibrary(null); setSheetDeviceId(null); setShowcase(false); }
  }, [emergencyVisible, setShowcase]);

  const graphicsCovered = hostSuspended || library !== null || sheetDeviceId !== null || emergencyVisible;
  return <div data-rendering={graphicsCovered || orientationPaused || documentHidden ? 'paused' : 'active'} className={`app-shell dashboard-shell ${embedded ? 'is-embedded' : ''} ${reducedMotion ? 'reduce-motion' : ''} ${documentHidden ? 'is-backgrounded' : ''}`}>
    <a className="skip-link" href="#house-preview">Skip to house controls</a>
    <DashboardHeader embedded={embedded} environment={environment} onSettings={() => setLibrary('settings')} onEnvironment={() => setLibrary('environment')} />
    <DashboardRoomBar onRooms={() => setLibrary('rooms')} />
    <main id="home-workspace" className="workspace dashboard-workspace">
      <DashboardRooms onBrowse={() => setLibrary('rooms')} />
      <div className="center-column"><HomeViewport environment={environment} reducedMotion={reducedMotion} onFullControls={openFullControls} sheetDeviceId={sheetDeviceId} onCloseFullControls={closeFullControls} covered={graphicsCovered} /><DashboardScenes /></div>
      <div id="room-controls" tabIndex={-1}><DashboardInspector onFullControls={openFullControls} onBrowseDevices={() => setLibrary('devices')} /></div>
    </main>
    <DashboardDock onRooms={() => setLibrary('rooms')} onDevices={() => setLibrary('devices')} />
    {!orientationPaused && library ? <DashboardLibrary environment={environment} onEnvironment={() => setLibrary('environment')} key={library} view={library} reducedMotion={reducedMotion} systemReducedMotion={prefersReduced} onClose={() => setLibrary(null)} onDevice={(id) => { selectDevice(id); openFullControls(id); }} /> : null}
    {!orientationPaused && sheetDeviceId ? <DeviceControlSheet deviceId={sheetDeviceId} onClose={closeFullControls} /> : null}
    {!embedded ? <SafetyPreview /> : null}
    {simulationSyncError || persistenceError ? <p className="storage-notice" role="status">{simulationSyncError ? "Your saved simulation couldn’t sync. Changes in this view may not be saved." : "Your browser couldn’t save these settings. The preview still works for this session."}</p> : null}
  </div>;
}
