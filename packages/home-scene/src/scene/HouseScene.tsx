import { FULL_SCENE_ACCESS, canExploreInteriorLayout } from '../sceneAccess';
import { getRoom } from '../data';
import { disposeRoomGeometry, isolateRoomGeometry, prepareExteriorOverview, disposeExteriorOverview } from './roomPrivacy';
import { requiresRoomIsolation, scopeSceneDeviceStates } from './scenePresentationAccess';
import { getModelUrl } from '../embeddedHost';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { canPresentCinematic } from './cinematicPresentation';
import { createCinematicTourFrame } from './cinematicTour';
import { CinematicAtmosphere } from './CinematicAtmosphere';
import { prepareCinematicMaterials } from './cinematicMaterials';
import { currentWeather } from '../environment/weatherPresentation';
import './scene.css';

type ModelProps = Pick<HouseSceneProps, 'view' | 'roomId' | 'access' | 'deviceStates' | 'reducedMotion' | 'onReady' | 'cinematic'>;

/** Load a faithful Blender export and animate its preserved washing-machine part. */
function HouseModel({ view, roomId, access = FULL_SCENE_ACCESS, deviceStates, reducedMotion, onReady, cinematic = false }: ModelProps) {
  const model = view === 'ground' || view === 'upper' ? view : 'exterior';
  // Exports are uncompressed; avoid unused remote/WASM decoder initialization.
  const { scene } = useGLTF(getModelUrl(model), false, false);
  const drum = useRef<Object3D | null>(null);
  const markers = useRef<Group>(null);
  const canAnimate = usePageMotion(reducedMotion);
  const speed = useRef(0);
  const washer = readDevice(deviceStates, 'laundry-washer');
  const privateRoomId = requiresRoomIsolation(access, view) ? roomId : '';
  const exteriorOnly = view === 'exterior' && (cinematic || !canExploreInteriorLayout(access));
  const preparedScene = useMemo(() => {
    const copy = privateRoomId ? isolateRoomGeometry(scene, getRoom(privateRoomId))
      : exteriorOnly ? prepareExteriorOverview(scene) : scene.clone(true);
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
  }, [scene, model, exteriorOnly, privateRoomId]);

  useLayoutEffect(() => {
    if (!cinematic) return;
    const finish = prepareCinematicMaterials(preparedScene);
    return () => finish.dispose();
  }, [cinematic, preparedScene]);

  useEffect(() => () => {
    if (privateRoomId) disposeRoomGeometry(preparedScene);
    if (exteriorOnly) disposeExteriorOverview(preparedScene);
  }, [preparedScene, privateRoomId, exteriorOnly]);

  useEffect(() => {
    drum.current = preparedScene.getObjectByName('washer-drum') ?? null;
    onReady();
    return () => { drum.current = null; };
  }, [onReady, preparedScene]);

  useFrame((_, delta) => {
    if (!canAnimate.current || cinematic) return;
    const dt = Math.min(delta, 0.065);
    speed.current = MathUtils.damp(speed.current, washer.on ? washer.level * 0.09 : 0, 2.2, dt);
    drum.current?.rotateY(speed.current * dt);
    if (markers.current) markers.current.rotation.z += speed.current * dt;
  });

  return <>
    <primitive object={preparedScene} />
    {!cinematic && canExploreInteriorLayout(access) && model !== 'upper' && <group ref={markers} position={[13.16, 0.42, -15.103]}>
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
  const weather = currentWeather(props.environment, props.environment.now);
  const access = props.access ?? FULL_SCENE_ACCESS;
  const cinematic = canPresentCinematic(props.cinematic ?? false, access, props.reducedMotion, suspended);
  const view = cinematic ? 'exterior' : props.view;
  const tourFrame = useMemo(createCinematicTourFrame, []);
  const roomOnly = requiresRoomIsolation(access, view);
  const exteriorOnly = props.view === 'exterior' && !canExploreInteriorLayout(access);
  const bounds = roomOnly ? getRoom(props.roomId).bounds : undefined;
  const visibleStates = useMemo(() => scopeSceneDeviceStates(props.deviceStates, access), [props.deviceStates, access]);
  const visibleProps = { ...props, access, view, cinematic, deviceStates: visibleStates };
  // Reset animation history immediately on revocation instead of easing from a formerly visible reading.
  const presentationScope = `${access.deviceIds.join('|')}:${canExploreInteriorLayout(access)}`;
  return <Canvas className={`house-canvas ${view === 'immersive' ? 'is-immersive' : ''}`} shadows dpr={[1, quality.maxDpr]} camera={{ position: [28, 20, 16], fov: 42, near: 0.08, far: 500 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }} onCreated={({ gl }) => {
      gl.shadowMap.type = PCFSoftShadowMap;
      gl.domElement.tabIndex = 0;
      gl.domElement.setAttribute('role', 'img');
      gl.domElement.setAttribute('aria-label', 'Interactive furnished house. Drag to orbit, pinch or scroll to zoom. In immersive mode, drag or use arrow keys to look around.');
    }} fallback={null}>
      <AdaptiveQuality onChange={setQualityTier} />
      <VisibilityScheduling suspended={suspended} />
      <MaterialEnvironment />
      <SceneLighting key={`lighting:${presentationScope}`} cinematic={cinematic} daylight={props.daylight} environment={props.environment} night={props.night} view={view} floor={props.floor} roomId={props.roomId} deviceStates={visibleStates} reducedMotion={props.reducedMotion} shadowMapSize={quality.shadowMapSize} />
      <CameraRig roomOnly={requiresRoomIsolation(access, props.view)} exteriorOnly={exteriorOnly} view={props.view} floor={props.floor} roomId={props.roomId} reducedMotion={props.reducedMotion} suspended={suspended} tourFrame={tourFrame} tourAllowed={cinematic} />
      {cinematic && <CinematicAtmosphere daylight={props.daylight} weather={weather} reducedMotion={props.reducedMotion} />}
      {!cinematic && !roomOnly && props.view !== 'immersive' && <CinematicStage exterior={props.view === 'exterior'} />}
      <Suspense key={`model:${presentationScope}`} fallback={null}>
        <HouseModel access={access} roomId={props.roomId} view={view} cinematic={cinematic} deviceStates={visibleStates} reducedMotion={props.reducedMotion} onReady={props.onReady} />
        <HotspotLayout access={props.access} roomId={props.roomId} view={view}>
        {!cinematic && <Devices {...visibleProps} />}
        {!roomOnly && (view === 'exterior' || view === 'immersive') && <Landscape {...visibleProps} tourFrame={tourFrame} windSpeedKmh={weather?.windSpeedKmh ?? 0} windDirectionDeg={weather?.windDirectionDeg ?? 0} />}
        </HotspotLayout>
        {!roomOnly && (view === 'exterior' || view === 'immersive') && <SolarLightPools deviceStates={visibleStates} reducedMotion={props.reducedMotion} />}
        {!roomOnly && weather ? <WeatherEffects weather={weather} view={view} roomId={props.roomId} reducedMotion={props.reducedMotion} /> : null}
      </Suspense>
      {bounds && <mesh position={[(bounds[0] + bounds[1]) / 2, -0.08, (bounds[2] + bounds[3]) / 2]} receiveShadow>
        <boxGeometry args={[bounds[1] - bounds[0], 0.12, bounds[3] - bounds[2]]} /><meshStandardMaterial color="#b6aca0" roughness={0.7} />
      </mesh>}
      <mesh position={[8, -1.02, -8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial color="#02080c" transparent opacity={0.42} depthWrite={false} /></mesh>
    </Canvas>;
}

export type { HouseSceneProps } from './types';
