import { getModelUrl } from '../embeddedHost';
import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Mesh, type Object3D } from 'three';
import siteLayout from '../site-layout.json';
import { Hotspot } from './Hotspot';
import { getGatePosition } from './siteGeometry';
import { readDevice, type HouseSceneProps } from './types';
import { usePageMotion } from './usePageMotion';
import { prepareVegetationWind, type VegetationWind } from './vegetationWind';

type LandscapeProps = Pick<HouseSceneProps, 'view' | 'roomId' | 'deviceStates' | 'selectedDevice' | 'quickDeviceId' | 'hotspotControlMode' | 'reducedMotion' | 'onSelectDevice'> & { windSpeedKmh?: number; windDirectionDeg?: number };
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
export function Landscape({ view, roomId, deviceStates, selectedDevice, quickDeviceId, hotspotControlMode = 'quick', reducedMotion, onSelectDevice, windSpeedKmh = 0, windDirectionDeg = 0 }: LandscapeProps) {
  const [{ scene: site }, { scene: leaf }] = useGLTF([
    getModelUrl('landscape'),
    getModelUrl('gate'),
  ], false, false);
  const preparedSite = useMemo(() => prepareLandscapeModel(site), [site]);
  const preparedLeaf = useMemo(() => prepareLandscapeModel(leaf), [leaf]);
  const wind = useRef<VegetationWind | null>(null);
  const canAnimate = usePageMotion(reducedMotion);
  useEffect(() => {
    const controller = prepareVegetationWind(preparedSite);
    wind.current = controller;
    return () => { controller.dispose(); wind.current = null; };
  }, [preparedSite]);
  const gate = readDevice(deviceStates, 'entry-gate');
  const carriage = useRef<Group>(null);
  const position = useRef(gate.level);
  // R3F must not reapply the target transform on every control update; animation owns it.
  const initialPosition = useRef(getGatePosition(gate.level));
  const showHotspot = roomId === 'grounds' && (view === 'exterior' || view === 'immersive');
  const stateLabel = gate.level === 0 ? 'closed' : gate.level === 100 ? 'fully open' : `${gate.level}% open`;

  useFrame((_, delta) => {
    if (document.hidden) return;
    wind.current?.update(delta, windSpeedKmh, windDirectionDeg, canAnimate.current);
    if (!carriage.current) return;
    position.current = reducedMotion ? gate.level : MathUtils.damp(position.current, gate.level, 2, Math.min(delta, 0.08));
    if (Math.abs(position.current - gate.level) < 0.01) position.current = gate.level;
    carriage.current.position.set(...getGatePosition(position.current));
  });

  return <group name="seaview-landscape">
    <primitive object={preparedSite} />
    <group ref={carriage} name="entry-gate-carriage" position={initialPosition.current} rotation={[0, gateLayout.rotationY, 0]} onClick={(event) => { event.stopPropagation(); onSelectDevice('entry-gate'); }}>
      <primitive object={preparedLeaf} />
    </group>
    {showHotspot && <Hotspot id="entry-gate" label="Entry gate" icon="▥" position={[gateLayout.position[0], gateLayout.position[1] + gateLayout.height / 2 + 0.75, gateLayout.position[2]]} on={gate.level > 0} stateLabel={stateLabel} selected={selectedDevice === 'entry-gate'} expanded={quickDeviceId === 'entry-gate'} controlMode={hotspotControlMode} onSelect={onSelectDevice} />}
  </group>;
}
