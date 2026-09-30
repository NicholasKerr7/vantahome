import { getModelUrl } from '../embeddedHost';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ACESFilmicToneMapping, Group, MathUtils, Mesh, PCFSoftShadowMap, type Object3D } from 'three';
import { CameraRig } from './CameraRig';
import { CinematicStage } from './CinematicStage';
import { Devices } from './Devices';
import { HotspotLayout } from './HotspotLayout';
import { Landscape } from './Landscape';
import { MaterialEnvironment } from './MaterialEnvironment';
import { SceneLighting } from './SceneLighting';
import { SolarLightPools } from './SolarLightPools';
import { WeatherEffects } from './WeatherEffects';
import siteLayout from '../site-layout.json';
import { readDevice, type HouseSceneProps } from './types';
import { usePageMotion } from './usePageMotion';
import { AdaptiveQuality } from './AdaptiveQuality';
import { RENDER_QUALITY, type RenderQualityTier } from './renderQuality';
import { bindSceneVisibilityScheduling } from './visibilityScheduling';
import './scene.css';

type ModelProps = Pick<HouseSceneProps, 'view' | 'deviceStates' | 'reducedMotion' | 'onReady'>;

/** Load a faithful Blender export and animate its preserved washing-machine part. */
function HouseModel({ view, deviceStates, reducedMotion, onReady }: ModelProps) {
  const model = view === 'ground' || view === 'upper' ? view : 'exterior';
  // Exports are uncompressed; avoid unused remote/WASM decoder initialization.
  const { scene } = useGLTF(getModelUrl(model), false, false);
  const drum = useRef<Object3D | null>(null);
  const markers = useRef<Group>(null);
  const canAnimate = usePageMotion(reducedMotion);
  const speed = useRef(0);
  const washer = readDevice(deviceStates, 'laundry-washer');
  const preparedScene = useMemo(() => {
    const copy = scene.clone(true);
    // Replace the original presentation lawn only in the complete house view.
    const oldSite = copy.getObjectByName(siteLayout.runtime.replaceExistingGroup);
    if (model === 'exterior' && oldSite) oldSite.visible = false;
    copy.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return copy;
  }, [scene, model]);

  useEffect(() => {
    drum.current = preparedScene.getObjectByName('washer-drum') ?? null;
    onReady();
    return () => { drum.current = null; };
  }, [onReady, preparedScene]);

  useFrame((_, delta) => {
    if (!canAnimate.current) return;
    const dt = Math.min(delta, 0.065);
    speed.current = MathUtils.damp(speed.current, washer.on ? washer.level * 0.09 : 0, 2.2, dt);
    drum.current?.rotateY(speed.current * dt);
    if (markers.current) markers.current.rotation.z += speed.current * dt;
  });

  return <>
    <primitive object={preparedScene} />
    {model !== 'upper' && <group ref={markers} position={[13.16, 0.42, -15.103]}>
      {[0, 1, 2].map((index) => <group key={index} rotation={[0, 0, index * Math.PI * 2 / 3]}><mesh position={[0.068, 0, 0]} rotation={[0, 0, 0.3]}><boxGeometry args={[0.054, 0.035, 0.009]} /><meshStandardMaterial color={index === 0 ? '#ded5bb' : '#70958b'} roughness={0.85} /></mesh></group>)}
    </group>}
  </>;
}

/** Keep covered scenes fresh on demand and stop rendering only when the document is hidden. */
function VisibilityScheduling({ suspended }: { suspended: boolean }) {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(
    () => bindSceneVisibilityScheduling(document, suspended, setFrameloop, invalidate),
    [invalidate, setFrameloop, suspended],
  );
  return null;
}

/** Render the furnished house with accessible hotspots and synchronized devices. */
export default function HouseScene({ suspended = false, ...props }: HouseSceneProps & { suspended?: boolean }) {
  const [qualityTier, setQualityTier] = useState<RenderQualityTier>('high');
  const quality = RENDER_QUALITY[qualityTier];
  return <Canvas className={`house-canvas ${props.view === 'immersive' ? 'is-immersive' : ''}`} shadows dpr={[1, quality.maxDpr]} camera={{ position: [28, 20, 16], fov: 42, near: 0.08, far: 500 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }} onCreated={({ gl }) => {
      gl.shadowMap.type = PCFSoftShadowMap;
      gl.domElement.tabIndex = 0;
      gl.domElement.setAttribute('role', 'img');
      gl.domElement.setAttribute('aria-label', 'Interactive furnished house. Drag to orbit, pinch or scroll to zoom. In immersive mode, drag or use arrow keys to look around.');
    }} fallback={null}>
      <AdaptiveQuality onChange={setQualityTier} />
      <VisibilityScheduling suspended={suspended} />
      <MaterialEnvironment />
      <SceneLighting daylight={props.daylight} environment={props.environment} night={props.night} view={props.view} floor={props.floor} roomId={props.roomId} deviceStates={props.deviceStates} reducedMotion={props.reducedMotion} shadowMapSize={quality.shadowMapSize} />
      <CameraRig view={props.view} floor={props.floor} roomId={props.roomId} reducedMotion={props.reducedMotion} suspended={suspended} />
      {props.view !== 'immersive' && <CinematicStage exterior={props.view === 'exterior'} />}
      <Suspense fallback={null}>
        <HouseModel view={props.view} deviceStates={props.deviceStates} reducedMotion={props.reducedMotion} onReady={props.onReady} />
        <HotspotLayout roomId={props.roomId} view={props.view}>
        <Devices {...props} />
        {(props.view === 'exterior' || props.view === 'immersive') && <Landscape {...props} windSpeedKmh={props.environment.weather?.windSpeedKmh ?? 0} windDirectionDeg={props.environment.weather?.windDirectionDeg ?? 0} />}
        </HotspotLayout>
        {(props.view === 'exterior' || props.view === 'immersive') && <SolarLightPools deviceStates={props.deviceStates} reducedMotion={props.reducedMotion} />}
        {props.environment.weather ? <WeatherEffects weather={props.environment.weather} view={props.view} roomId={props.roomId} reducedMotion={props.reducedMotion} /> : null}
      </Suspense>
      <mesh position={[8, -1.02, -8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial color="#02080c" transparent opacity={0.42} depthWrite={false} /></mesh>
    </Canvas>;
}

export type { HouseSceneProps } from './types';
