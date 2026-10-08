import { getModelUrl } from '../embeddedHost';
import { FULL_SCENE_ACCESS, canViewSceneDevice } from '../sceneAccess';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Mesh, type Object3D } from 'three';
import siteLayout from '../site-layout.json';
import { getDevice } from '../data';
import { hotspotPresentation } from '../hotspotPresentation';
import { Hotspot } from './Hotspot';
import { getGatePosition } from './siteGeometry';
import { readDevice, type HouseSceneProps } from './types';
import { usePageMotion } from './usePageMotion';
import { prepareVegetationWind, type VegetationWind } from './vegetationWind';
import { prepareCinematicMaterials } from './cinematicMaterials';
import { presentationGateLevel } from './cinematicPresentation';
import type { CinematicTourFrame } from './cinematicTour';

type LandscapeProps = Pick<HouseSceneProps, 'access' | 'view' | 'roomId' | 'deviceStates' | 'selectedDevice' | 'quickDeviceId' | 'hotspotControlMode' | 'reducedMotion' | 'onSelectDevice' | 'cinematic'> & { windSpeedKmh?: number; windDirectionDeg?: number; tourFrame?: CinematicTourFrame };
const gateLayout = siteLayout.runtime.gate;

/** Clone cached GLTF objects so shadows and parenting remain local to this scene. */
function prepareLandscapeModel(source: Object3D): Object3D {
  const copy = source.clone(true);
  copy.traverse((node) => {
    if (node instanceof Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return copy;
}

/** Render the traced parcel and move the Blender gate leaf along its real track. */
export function Landscape({ access = FULL_SCENE_ACCESS, view, roomId, deviceStates, selectedDevice, quickDeviceId, hotspotControlMode = 'quick', reducedMotion, onSelectDevice, windSpeedKmh = 0, windDirectionDeg = 0, cinematic = false, tourFrame }: LandscapeProps) {
  const [{ scene: site }, { scene: leaf }] = useGLTF([
    getModelUrl('landscape'),
    getModelUrl('gate'),
  ], false, false);
  const preparedSite = useMemo(() => prepareLandscapeModel(site), [site]);
  const preparedLeaf = useMemo(() => prepareLandscapeModel(leaf), [leaf]);
  useLayoutEffect(() => {
    if (!cinematic) return;
    const siteFinish = prepareCinematicMaterials(preparedSite);
    const gateFinish = prepareCinematicMaterials(preparedLeaf);
    return () => { siteFinish.dispose(); gateFinish.dispose(); };
  }, [cinematic, preparedSite, preparedLeaf]);
  const wind = useRef<VegetationWind | null>(null);
  const canAnimate = usePageMotion(reducedMotion);
  useEffect(() => {
    const controller = prepareVegetationWind(preparedSite);
    wind.current = controller;
    return () => { controller.dispose(); wind.current = null; };
  }, [preparedSite]);
  const canViewGate = canViewSceneDevice(access, 'entry-gate');
  const gate = canViewGate ? readDevice(deviceStates, 'entry-gate') : { on: false, level: 0 };
  const carriage = useRef<Group>(null);
  const position = useRef(gate.level);
  const wasCinematic = useRef(cinematic);
  useLayoutEffect(() => {
    // Restore the actual, authorized gate state before the first interactive frame.
    if ((wasCinematic.current && !cinematic) || !canViewGate) {
      position.current = gate.level;
      carriage.current?.position.set(...getGatePosition(gate.level));
    }
    wasCinematic.current = cinematic;
  }, [cinematic, canViewGate, gate.level]);
  // R3F must not reapply the target transform on every control update; animation owns it.
  const initialPosition = useRef(getGatePosition(gate.level));
  const showHotspot = !cinematic && canViewGate && roomId === 'grounds' && (view === 'exterior' || view === 'immersive');
  const gateDevice = getDevice('entry-gate');
  const hotspot = gateDevice ? hotspotPresentation(gateDevice, gate) : null;

  useFrame((_, delta) => {
    if (document.hidden) return;
    wind.current?.update(delta, windSpeedKmh, windDirectionDeg, canAnimate.current);
    if (!carriage.current) return;
    const tourActive = cinematic && (tourFrame?.active ?? false);
    const targetLevel = presentationGateLevel(cinematic, tourActive, (tourFrame?.gateOpen ?? 0) * 100, gate.level);
    position.current = reducedMotion || tourActive ? targetLevel : MathUtils.damp(position.current, targetLevel, 2, Math.min(delta, 0.08));
    if (Math.abs(position.current - targetLevel) < 0.01) position.current = targetLevel;
    carriage.current.position.set(...getGatePosition(position.current));
  });

  return <group name="seaview-landscape">
    <primitive object={preparedSite} />
    <group ref={carriage} name="entry-gate-carriage" position={initialPosition.current} rotation={[0, gateLayout.rotationY, 0]} onClick={canViewGate && !cinematic ? (event) => { event.stopPropagation(); onSelectDevice('entry-gate'); } : undefined}>
      <primitive object={preparedLeaf} />
    </group>
    {showHotspot && hotspot && (
      <Hotspot
        id="entry-gate"
        label="Entry gate"
        icon="▥"
        position={[
          gateLayout.position[0],
          gateLayout.position[1] + gateLayout.height / 2 + 0.75,
          gateLayout.position[2],
        ]}
        on={hotspot.active}
        monitoring={hotspot.monitoring}
        stateLabel={hotspot.stateLabel}
        tone={hotspot.tone}
        selected={selectedDevice === 'entry-gate'}
        expanded={quickDeviceId === 'entry-gate'}
        controlMode={hotspotControlMode}
        onSelect={onSelectDevice}
      />
    )}
  </group>;
}
