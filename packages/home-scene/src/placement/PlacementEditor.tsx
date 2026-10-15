import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { AUTHORED_DEVICES, getRoom, type DeviceDefinition } from '../data';
import { buildRuntimeDeviceDefinitions, clampDevicePlacement, devicePlacementHeightRange, getSimulationDeviceTemplate, replaceRuntimeDevices, type RuntimePlacedDevice, type SimulationDevicePlacement } from '../devicePlacement';
import { getModelUrl } from '../embeddedHost';
import { disposeRoomGeometry } from '../scene/roomPrivacy';
import { FIXTURE_LIBRARY, getDeviceFixtureGeometry } from '../scene/deviceGeometry';
import { useSceneFrameReady } from '../scene/useSceneFrameReady';
import { parsePlacementMessage, PLACEMENT_CHANNEL, type PlacementMessage } from './placementProtocol';
import { isPlacementKeepOut, preparePlacementModel } from './placementModels';
import './placement.css';

const PREVIEW_ID = 'placed-00000000-0000-4000-8000-000000000000';

/** Publish only placement events to the exact embedding parent or native bridge. */
function send(message: PlacementMessage): void {
  const host = (window as Window & { ReactNativeWebView?: { postMessage(value: string): void } }).ReactNativeWebView;
  if (host) host.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}

/** Recover a failed GPU or model load through the host's explicit retry surface. */
class PlacementBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void { send({ channel: PLACEMENT_CHANNEL, version: 1, type: 'error' }); }
  render(): ReactNode { return this.state.failed ? <p role="alert">The room preview could not load.</p> : this.props.children; }
}

/** Draw the complete curated fixture without allocating new model downloads for each device. */
function PreviewFixture({ device, selected = false }: { device: DeviceDefinition; selected?: boolean }) {
  const geometry = getDeviceFixtureGeometry(device);
  return <group position={device.position} rotation={device.rotation}>
    {geometry?.parts.map((part, index) => {
      const material = FIXTURE_LIBRARY.materials[part.material];
      return <mesh key={`${part.name}:${index}`} position={part.position} rotation={part.rotation} scale={part.size}>
        {part.shape === 'box' ? <boxGeometry /> : part.shape === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> : <sphereGeometry args={[0.5, 12, 8]} />}
        <meshStandardMaterial color={material?.color ?? '#ddd3ed'} roughness={material?.roughness ?? 0.5} metalness={material?.metalness ?? 0}
          emissive={selected ? '#672db1' : '#000000'} emissiveIntensity={selected ? 0.14 : 0} />
      </mesh>;
    })}
  </group>;
}

/** Clone only the chosen furnished room; release extracted geometry when the editor closes. */
function RoomModel({ placement, onPick }: { placement: SimulationDevicePlacement; onPick: (event: ThreeEvent<MouseEvent>) => void }) {
  const room = getRoom(placement.modelRoomId);
  const assets = useGLTF(room.outdoor ? [getModelUrl('landscape'), getModelUrl('exterior')] : [getModelUrl(room.floor)], false, false);
  const primaryScene = assets[0]!.scene;
  const exteriorScene = assets[1]?.scene;
  const model = useMemo(() => preparePlacementModel(exteriorScene ? [primaryScene, exteriorScene] : [primaryScene], room), [primaryScene, exteriorScene, room]);
  const ready = useCallback(() => send({ channel: PLACEMENT_CHANNEL, version: 1, type: 'rendered' }), []);
  useSceneFrameReady(model, ready);
  useEffect(() => () => { if (!room.outdoor) disposeRoomGeometry(model); }, [model, room.outdoor]);
  return <primitive object={model} onClick={(event: ThreeEvent<MouseEvent>) => {
    if (isPlacementKeepOut(event.object)) event.stopPropagation();
    else onPick(event);
  }} />;
}

/** Provide a demand-rendered room canvas with touch orbit, surface picking and a visible placement anchor. */
function PlacementCanvas({ placement, devices, disabled, onChange }: { placement: SimulationDevicePlacement; devices: RuntimePlacedDevice[]; disabled: boolean; onChange: (value: SimulationDevicePlacement) => void }) {
  const room = getRoom(placement.modelRoomId);
  const [left, right, back, front] = room.bounds!;
  const span = Math.max(right - left, front - back);
  const x = room.center[0]; const z = room.center[1];
  const draft = buildRuntimeDeviceDefinitions([{ id: PREVIEW_ID, name: 'Placement preview', placement }])[0];
  const existing = useMemo(() => buildRuntimeDeviceDefinitions(devices).filter((device) => device.roomId === room.id), [devices, room.id]);
  const floor = room.outdoor ? -0.34 : 0;
  /** Use actual hit positions for surfaces; shared validation handles wall and ceiling snapping. */
  function pick(event: ThreeEvent<MouseEvent>): void {
    event.stopPropagation();
    if (disabled || event.delta > 5) return;
    const next = clampDevicePlacement({ ...placement, position: [event.point.x, placement.mount === 'surface' ? event.point.y + 0.015 : placement.position[1], event.point.z] });
    if (next) onChange(next);
  }
  return <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [x + span * 0.55, span * 1.05, z + span * 0.85], fov: 43, near: 0.1, far: 160 }}
    onCreated={({ gl }) => { gl.domElement.setAttribute('aria-label', 'Furnished room placement preview. Tap a surface to place. Drag to orbit and pinch to zoom.'); gl.domElement.setAttribute('role', 'img'); }}>
    <color attach="background" args={['#120c23']} />
    <ambientLight intensity={1.45} />
    <directionalLight position={[x + 5, 12, z + 6]} intensity={2.8} />
    <directionalLight position={[x - 5, 5, z - 4]} color="#b495ff" intensity={1.2} />
    <OrbitControls target={[x, 0.75, z]} enableDamping={false} minDistance={1.8} maxDistance={span * 2.8} maxPolarAngle={Math.PI * 0.46} />
    <Suspense fallback={null}><RoomModel placement={placement} onPick={pick} /></Suspense>
    {!room.outdoor && <mesh position={[x, floor - 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} onClick={pick}>
      <planeGeometry args={[right - left, front - back]} /><meshStandardMaterial color="#75647d" roughness={1} />
    </mesh>}
    {existing.map((device) => <PreviewFixture key={device.id} device={device} />)}
    {draft && <PreviewFixture device={draft} selected />}
    <mesh position={[placement.position[0], floor + 0.018, placement.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.24, 0.31, 48]} /><meshBasicMaterial color="#ce9bff" depthTest={false} transparent opacity={0.95} />
    </mesh>
    <mesh position={[placement.position[0], (placement.position[1] + floor) / 2, placement.position[2]]}>
      <cylinderGeometry args={[0.009, 0.009, Math.max(0.01, placement.position[1] - floor), 6]} /><meshBasicMaterial color="#b46bff" transparent opacity={0.6} />
    </mesh>
  </Canvas>;
}

/** Edit a geometry-only draft; this document has no access to saved device state or command transport. */
export default function PlacementEditor() {
  const [draft, setDraft] = useState<SimulationDevicePlacement | null>(null);
  const [devices, setDevices] = useState<RuntimePlacedDevice[]>([]);
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    /** Accept configuration only from the embedding host, never another page or nested iframe. */
    function accept(input: unknown) {
      const message = parsePlacementMessage(input);
      if (message?.type !== 'configure') return;
      replaceRuntimeDevices(message.devices);
      setDraft(message.placement); setDevices(message.devices); setDisabled(message.disabled);
    }
    function native(event: Event) { accept((event as CustomEvent<unknown>).detail); }
    function web(event: MessageEvent<unknown>) { if (event.source === window.parent && window.parent !== window) accept(event.data); }
    window.addEventListener(PLACEMENT_CHANNEL, native); window.addEventListener('message', web);
    send({ channel: PLACEMENT_CHANNEL, version: 1, type: 'ready' });
    return () => { window.removeEventListener(PLACEMENT_CHANNEL, native); window.removeEventListener('message', web); replaceRuntimeDevices([]); };
  }, []);
  const change = useCallback((value: SimulationDevicePlacement) => {
    setDraft(value); send({ channel: PLACEMENT_CHANNEL, version: 1, type: 'change', placement: value });
  }, []);
  /** Use the same snapping for touch picking and keyboard/screen-reader position buttons. */
  function adjust(dx = 0, dz = 0, dy = 0, angle = 0): void {
    if (!draft || disabled) return;
    const next = clampDevicePlacement({ ...draft, position: [draft.position[0] + dx, draft.position[1] + dy, draft.position[2] + dz], rotationY: draft.rotationY + angle });
    if (next) change(next);
  }
  if (!draft) return <main className="placement-editor placement-wait" aria-live="polite">Preparing your room…</main>;
  const template = getSimulationDeviceTemplate(draft.templateId)!;
  const heights = devicePlacementHeightRange(draft.templateId, draft.modelRoomId)!;
  const existing = [...AUTHORED_DEVICES, ...buildRuntimeDeviceDefinitions(devices)];
  const nearby = existing.some((device) => device.roomId === draft.modelRoomId && Math.hypot(device.position[0] - draft.position[0], device.position[2] - draft.position[2]) < (device.dimensions[0] + 0.2) / 2 && Math.abs(device.position[1] - draft.position[1]) < 0.35);
  const hint = draft.mount === 'ceiling' ? 'Tap to position · ceiling height stays aligned' : draft.mount === 'wall' ? 'Tap near a wall · automatically faces into the room' : draft.mount === 'surface' ? 'Tap a table or console · adjust height if needed' : 'Tap the grounds to position your path light';
  return <main className="placement-editor">
    <div className="placement-caption"><span className="placement-live">LIVE PLACEMENT</span><strong>{template.name}</strong><span>{getRoom(draft.modelRoomId).name}</span></div>
    <div className="placement-canvas"><PlacementBoundary><PlacementCanvas key={draft.modelRoomId} placement={draft} devices={devices} disabled={disabled} onChange={change} /></PlacementBoundary></div>
    <div className="placement-tools">
      <p className={nearby ? 'placement-hint placement-warning' : 'placement-hint'} aria-live="polite">{nearby ? 'Close to another fixture — check clearance before saving.' : hint}</p>
      <div className="placement-buttons" role="group" aria-label="Adjust device position">
        <button type="button" aria-label="Move device left" disabled={disabled} onClick={() => adjust(-0.15)}>←</button>
        <button type="button" aria-label="Move device backward" disabled={disabled} onClick={() => adjust(0, -0.15)}>↑</button>
        <button type="button" aria-label="Move device forward" disabled={disabled} onClick={() => adjust(0, 0.15)}>↓</button>
        <button type="button" aria-label="Move device right" disabled={disabled} onClick={() => adjust(0.15)}>→</button>
        {draft.mount !== 'wall' && <button type="button" aria-label="Rotate device 15 degrees" disabled={disabled} onClick={() => adjust(0, 0, 0, Math.PI / 12)}>↻</button>}
        {heights[0] !== heights[1] && <><button type="button" aria-label="Lower device" disabled={disabled} onClick={() => adjust(0, 0, -0.05)}>−</button><button type="button" aria-label="Raise device" disabled={disabled} onClick={() => adjust(0, 0, 0.05)}>+</button></>}
      </div>
      <output className="placement-measure">Height {draft.position[1].toFixed(2)} m · {Math.round(draft.rotationY * 180 / Math.PI)}° · Drag to orbit, pinch to zoom</output>
    </div>
  </main>;
}
