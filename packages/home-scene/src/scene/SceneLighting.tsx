import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, MathUtils, Object3D } from 'three';
import { ROOM_POSITIONS, UPPER_ELEVATION, type HouseSceneProps } from './types';
import { resizeShadowMap } from './shadowQuality';

/** Sculpt warm rooms against a cool studio setting without extra shadow maps or postprocessing. */
export function SceneLighting({ night, daylight, environment, view, floor, roomId, reducedMotion, shadowMapSize }: Pick<HouseSceneProps, 'night' | 'daylight' | 'environment' | 'view' | 'floor' | 'roomId' | 'reducedMotion'> & { shadowMapSize: number }) {
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
  const hemisphere = useRef<import('three').HemisphereLight>(null);
  const fill = useRef<import('three').DirectionalLight>(null);
  const rim = useRef<import('three').DirectionalLight>(null);
  useLayoutEffect(() => {
    if (key.current) resizeShadowMap(key.current.shadow, shadowMapSize);
  }, [shadowMapSize]);
  useEffect(() => {
    // The same light survives view changes; refresh its orthographic shadow projection.
    key.current?.shadow.camera.updateProjectionMatrix();
  }, [shadowRadius]);
  const colors = useMemo(() => ({
    day: new Color('#0d1a20'),
    overcast: new Color('#101b23'),
    twilight: new Color('#142128'),
    sun: new Color('#ffe7c7'),
    duskSun: new Color('#ffc082'),
    night: new Color('#080d12'),
    mixed: new Color(),
  }), []);
  const amount = useRef(1 - daylight);
  const cloudAmount = useRef((environment.weather?.cloudCover ?? 0) / 100);
  const full = view === 'exterior' || view === 'immersive';
  const upperY = full ? UPPER_ELEVATION : 0;
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const cloudTarget = (environment.weather?.cloudCover ?? 0) / 100;
    amount.current = reducedMotion ? 1 - daylight : MathUtils.damp(amount.current, 1 - daylight, 2, dt);
    cloudAmount.current = reducedMotion ? cloudTarget : MathUtils.damp(cloudAmount.current, cloudTarget, 1.2, dt);
    if (ambient.current) ambient.current.intensity = MathUtils.lerp(full ? 0.4 : 0.56, full ? 0.12 : 0.18, amount.current);
    if (hemisphere.current) hemisphere.current.intensity = MathUtils.lerp(full ? 0.48 : 0.64, 0.16, amount.current);
    if (fill.current) fill.current.intensity = MathUtils.lerp(0.85, 0.2, amount.current);
    if (rim.current) rim.current.intensity = MathUtils.lerp(1.15, 0.48, amount.current);
    if (key.current) {
      key.current.intensity = MathUtils.lerp(full ? 3.2 : 3.6, 0.2, amount.current) * (1 - cloudAmount.current * 0.35);
      key.current.color.copy(colors.sun).lerp(colors.duskSun, Math.sin(amount.current * Math.PI) * (1 - cloudAmount.current));
    }
    scene.environmentIntensity = MathUtils.lerp(0.4, 0.13, amount.current);
    // A deep backdrop separates pale architecture from the atmosphere at every real-world hour.
    scene.background = colors.mixed.copy(colors.day).lerp(colors.overcast, cloudAmount.current * 0.65).lerp(colors.twilight, Math.sin(amount.current * Math.PI) * 0.5).lerp(colors.night, amount.current);
  });
  return <>
    <ambientLight ref={ambient} intensity={0.56} />
    <hemisphereLight ref={hemisphere} args={['#c1e6ec', '#74695e', full ? 0.48 : 0.64]} />
    <directionalLight ref={key} position={[focus[0] - 12, focus[1] + 26, focus[2] + 16]} target={shadowTarget} color="#fff0d4" intensity={3.8} castShadow shadow-camera-left={-shadowRadius} shadow-camera-right={shadowRadius} shadow-camera-top={shadowRadius} shadow-camera-bottom={-shadowRadius} shadow-camera-near={0.1} shadow-camera-far={110} shadow-bias={-0.0006} shadow-normalBias={0.04} />
    <directionalLight ref={fill} position={[20, 10, -18]} intensity={0.85} color="#9bcbd9" />
    <directionalLight ref={rim} position={[-18, 15, -24]} intensity={1.15} color="#bdffe1" />
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
