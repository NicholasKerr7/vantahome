import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, MathUtils, Object3D } from 'three';
import { ROOM_POSITIONS, UPPER_ELEVATION, type HouseSceneProps } from './types';

/** Blend studio ambience while keeping interior rooms comfortably readable. */
export function SceneLighting({ night, daylight, environment, view, floor, roomId, reducedMotion }: Pick<HouseSceneProps, 'night' | 'daylight' | 'environment' | 'view' | 'floor' | 'roomId' | 'reducedMotion'>) {
  const { scene } = useThree();
  const shadowTarget = useMemo(() => new Object3D(), []);
  const room = ROOM_POSITIONS[roomId] ?? ROOM_POSITIONS.living;
  const focus: [number, number, number] = view === 'exterior' ? [10, 0, -7]
    : view === 'immersive' ? [roomId === 'grounds' ? room.look[0] : room.center[0], room.floor === 'upper' ? UPPER_ELEVATION : 0, roomId === 'grounds' ? room.look[2] : room.center[1]]
    : [8.2, 0, -8];
  const shadowRadius = view === 'exterior' ? 50 : view === 'immersive' ? (roomId === 'grounds' ? 12 : 8) : 18;
  useEffect(() => {
    scene.add(shadowTarget);
    return () => { scene.remove(shadowTarget); };
  }, [scene, shadowTarget]);
  useEffect(() => {
    shadowTarget.position.set(...focus);
    shadowTarget.updateMatrixWorld();
  }, [shadowTarget, focus[0], focus[1], focus[2]]);
  const ambient = useRef<import('three').AmbientLight>(null);
  const key = useRef<import('three').DirectionalLight>(null);
  useEffect(() => {
    // The same light survives view changes; refresh its orthographic shadow projection.
    key.current?.shadow.camera.updateProjectionMatrix();
  }, [shadowRadius]);
  const colors = useMemo(() => ({ day: new Color('#b9c4b8'), overcast: new Color('#96a6a4'), twilight: new Color('#b2a99a'), sun: new Color('#fff0d4'), duskSun: new Color('#f4b878'), night: new Color('#182b2b'), mixed: new Color() }), []);
  const amount = useRef(1 - daylight);
  const cloudAmount = useRef((environment.weather?.cloudCover ?? 0) / 100);
  const full = view === 'exterior' || view === 'immersive';
  const upperY = full ? UPPER_ELEVATION : 0;
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const cloudTarget = (environment.weather?.cloudCover ?? 0) / 100;
    amount.current = reducedMotion ? 1 - daylight : MathUtils.damp(amount.current, 1 - daylight, 2, dt);
    cloudAmount.current = reducedMotion ? cloudTarget : MathUtils.damp(cloudAmount.current, cloudTarget, 1.2, dt);
    if (ambient.current) ambient.current.intensity = MathUtils.lerp(full ? 0.5 : 0.7, 0.28, amount.current);
    if (key.current) {
      key.current.intensity = MathUtils.lerp(full ? 2.6 : 3.1, 0.62, amount.current) * (1 - cloudAmount.current * 0.35);
      key.current.color.copy(colors.sun).lerp(colors.duskSun, Math.sin(amount.current * Math.PI) * (1 - cloudAmount.current));
    }
    scene.environmentIntensity = MathUtils.lerp(0.45, 0.18, amount.current);
    // The HTML viewport provides the vignette, while WebGL renders an opaque stage.
    scene.background = colors.mixed.copy(colors.day).lerp(colors.overcast, cloudAmount.current * 0.65).lerp(colors.twilight, Math.sin(amount.current * Math.PI) * 0.5).lerp(colors.night, amount.current);
  });
  return <>
    <ambientLight ref={ambient} intensity={1.15} />
    <hemisphereLight args={['#d8e5ed', '#a39c78', full ? 0.65 : 0.85]} />
    <directionalLight ref={key} position={[focus[0] - 12, focus[1] + 26, focus[2] + 16]} target={shadowTarget} color="#fff0d4" intensity={3.8} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-shadowRadius} shadow-camera-right={shadowRadius} shadow-camera-top={shadowRadius} shadow-camera-bottom={-shadowRadius} shadow-camera-near={0.1} shadow-camera-far={110} shadow-bias={-0.0006} shadow-normalBias={0.04} />
    <directionalLight position={[20, 10, -18]} intensity={night ? 0.6 : 1.25} color="#c3dfe7" />
    {(full || floor === 'ground') && <>
      <pointLight position={[7.6, 2.1, -9]} intensity={night ? 4 : 7} distance={9} color="#ffe6c2" />
      <pointLight position={[14.7, 2.1, -12.5]} intensity={night ? 4 : 8} distance={6} color="#fff2d7" />
      <pointLight position={[14.5, 2.1, -15.2]} intensity={5} distance={5} color="#edf6ed" />
    </>}
    {(full || floor === 'upper') && <group position={[0, upperY, 0]}>
      <pointLight position={[8.3, 2.1, -9.1]} intensity={night ? 5 : 9} distance={10} color="#ffe5be" />
      <pointLight position={[10, 2.2, -14]} intensity={night ? 5 : 8} distance={8} color="#ffdfb3" />
      <pointLight position={[12.5, 2.1, -4.2]} intensity={7} distance={7} color="#e9f4ed" />
    </group>}
  </>;
}
