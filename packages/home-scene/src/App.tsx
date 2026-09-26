import { getModelUrl, reportSceneStatus, type ModelName } from './embeddedHost';
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
import { useLiveEnvironment, type LiveEnvironment } from './environment/useLiveEnvironment';
import './styles.css';
import './device-catalog.css';
import './dashboard.css';

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
function HomeViewport({ environment, reducedMotion, onFullControls, sheetDeviceId, onCloseFullControls }: { environment: LiveEnvironment; reducedMotion: boolean; onFullControls: (id: DeviceId) => void; sheetDeviceId: DeviceId | null; onCloseFullControls: () => void }): ReactNode {
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
    quickTrigger.current = device.id;
    selectHotspotDevice(device.id);
    setQuickDeviceId((current) => inlineInspector ? null : current === device.id ? null : device.id);
    if (inlineInspector) requestAnimationFrame(() => document.getElementById('device-control-title')?.focus({ preventScroll: true }));
  }, [inlineInspector, selectHotspotDevice]);

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
  return <section id="house-preview" tabIndex={-1} className={`viewport ${night ? 'is-night' : ''}`} aria-label="Interactive furnished house preview">
    <div className="viewport-top"><div><span className="eyebrow">{view === 'exterior' ? 'THE WHOLE PICTURE' : view === 'immersive' ? 'A CLOSER LOOK' : `${floor.toUpperCase()} FLOOR`}</span><h1>{view === 'exterior' ? 'Seaview grounds' : room.name}<span className="title-dot">.</span></h1><p>{view === 'exterior' ? 'The full property, from arrival to home.' : room.area}</p></div><span className="view-tag"><span />LIVE PREVIEW</span></div>
    <div className="scene-container">
      <SceneErrorBoundary key={attempt} onRetry={retryScene}>
        <HouseScene daylight={lightingMode === 'auto' ? environment.daylight : Number(!night)} environment={environment} suspended={orientationPaused} view={view} floor={floor} roomId={roomId} night={night} deviceStates={deviceStates} selectedDevice={quickDeviceId ?? selectedDevice} quickDeviceId={quickDeviceId} hotspotControlMode={inlineInspector ? 'inspector' : 'quick'} reducedMotion={reducedMotion} onSelectDevice={openDeviceControls} onReady={onReady} />
        {!ready ? <div className="scene-loading" role="status"><span className="loading-orbit"><Home size={24} strokeWidth={1.4} aria-hidden="true" /></span><span>Preparing your home<span className="loading-dots">…</span></span></div> : null}
      </SceneErrorBoundary>
    </div>
    {!orientationPaused && quickDeviceId ? <QuickDeviceControls deviceId={quickDeviceId} onClose={closeQuickControls} onFullControls={openFullControls} /> : null}
    <div className="viewport-bottom"><span className="scene-instruction"><span className="mouse-indicator" />{view === 'immersive' ? 'Drag to look around · fixed viewpoint' : 'Drag to rotate · pinch to zoom · select a device'}</span><div className="view-controls" aria-label="House view"><button aria-pressed={view === 'exterior'} onClick={() => setView(view === 'exterior' ? floor : 'exterior')}><Home size={15} aria-hidden="true" /><span>Landscape</span></button><button aria-pressed={view === 'ground' || view === 'upper'} onClick={() => setView(floor)}><Layers3 size={15} aria-hidden="true" /><span>Floor plan</span></button><button aria-pressed={view === 'immersive'} onClick={() => setView(view === 'immersive' ? floor : 'immersive')}><MoveUpRight size={15} aria-hidden="true" /><span>{roomId === 'grounds' ? 'Gate view' : 'Immersive'}</span></button></div></div>
  </section>;
}

/** Compose a fixed dashboard while keeping the scene and simulation state mounted. */
export default function App(): ReactNode {
  const prefersReduced = usePrefersReducedMotion();
  const environment = useLiveEnvironment();
  const lightingMode = useHomeStore((state) => state.lightingMode);
  const syncAutomaticLighting = useHomeStore((state) => state.syncAutomaticLighting);
  // Apply dawn/dusk once per transition, leaving individual light overrides usable.
  useEffect(() => {
    if (lightingMode === 'auto') syncAutomaticLighting(environment.isNight);
  }, [environment.isNight, lightingMode, syncAutomaticLighting]);
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const persistenceError = useHomeStore((state) => state.persistenceError);
  const selectDevice = useHomeStore((state) => state.selectDevice);
  const reducedMotion = prefersReduced || motionDisabled;
  const orientationPaused = useOrientationPaused();
  const [library, setLibrary] = useState<DashboardLibraryView | null>(null);
  const [sheetDeviceId, setSheetDeviceId] = useState<DeviceId | null>(null);
  const sheetTrigger = useRef<HTMLElement | null>(null);
  const sheetHotspot = useRef<string | null>(null);

  /** Remember the actual opening control so every device sheet can return focus. */
  const openFullControls = useCallback((id: DeviceId) => {
    sheetTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetHotspot.current = sheetTrigger.current?.closest('#quick-device-controls') ? id : null;
    setLibrary(null);
    setSheetDeviceId(id);
  }, []);

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

  return <div className={`app-shell dashboard-shell ${reducedMotion ? 'reduce-motion' : ''}`}>
    <a className="skip-link" href="#house-preview">Skip to house controls</a>
    <DashboardHeader environment={environment} onSettings={() => setLibrary('settings')} />
    <DashboardRoomBar onRooms={() => setLibrary('rooms')} />
    <main id="home-workspace" className="workspace dashboard-workspace">
      <DashboardRooms onBrowse={() => setLibrary('rooms')} />
      <div className="center-column"><HomeViewport environment={environment} reducedMotion={reducedMotion} onFullControls={openFullControls} sheetDeviceId={sheetDeviceId} onCloseFullControls={closeFullControls} /><DashboardScenes /></div>
      <div id="room-controls" tabIndex={-1}><DashboardInspector onFullControls={openFullControls} onBrowseDevices={() => setLibrary('devices')} /></div>
    </main>
    <DashboardDock onRooms={() => setLibrary('rooms')} onDevices={() => setLibrary('devices')} />
    {!orientationPaused && library ? <DashboardLibrary environment={environment} onEnvironment={() => setLibrary('environment')} key={library} view={library} reducedMotion={reducedMotion} systemReducedMotion={prefersReduced} onClose={() => setLibrary(null)} onDevice={(id) => { selectDevice(id); openFullControls(id); }} /> : null}
    {!orientationPaused && sheetDeviceId ? <DeviceControlSheet deviceId={sheetDeviceId} onClose={closeFullControls} /> : null}
    {persistenceError ? <p className="storage-notice" role="status">Your browser couldn’t save these settings. The preview still works for this session.</p> : null}
  </div>;
}
