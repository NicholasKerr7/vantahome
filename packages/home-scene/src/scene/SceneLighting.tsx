import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, MathUtils, Object3D } from 'three';
import { ROOM_POSITIONS, UPPER_ELEVATION, type HouseSceneProps } from './types';
import { resizeShadowMap } from './shadowQuality';
import { roomFillLights } from './roomLighting';
import { currentWeather } from '../environment/weatherPresentation';

/** Sculpt architecture with one shadow map; the exterior tour uses a natural sun/moon treatment. */
export function SceneLighting({ night, daylight, environment, view, floor, roomId, deviceStates, reducedMotion, shadowMapSize, cinematic = false }: Pick<HouseSceneProps, 'night' | 'daylight' | 'environment' | 'view' | 'floor' | 'roomId' | 'deviceStates' | 'reducedMotion'> & { shadowMapSize: number; cinematic?: boolean }) {
  const { scene } = useThree();
  const weather = currentWeather(environment, environment.now);
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
    // Decorative studio backdrop follows the v1 purple theme through daylight changes.
    day: new Color('#1D0C45'),
    overcast: new Color('#19132F'),
    twilight: new Color('#291149'),
    sun: new Color('#ffe7c7'),
    duskSun: new Color('#ffc082'),
    moon: new Color('#b5c9e7'),
    night: new Color('#110530'),
    mixed: new Color(),
  }), []);
  const amount = useRef(1 - daylight);
  const cloudAmount = useRef((weather?.cloudCover ?? 0) / 100);
  const full = view === 'exterior' || view === 'immersive';
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const cloudTarget = (weather?.cloudCover ?? 0) / 100;
    amount.current = reducedMotion ? 1 - daylight : MathUtils.damp(amount.current, 1 - daylight, 2, dt);
    cloudAmount.current = reducedMotion ? cloudTarget : MathUtils.damp(cloudAmount.current, cloudTarget, 1.2, dt);
    if (ambient.current) ambient.current.intensity = cinematic
      ? MathUtils.lerp(0.2 + cloudAmount.current * 0.1, 0.065, amount.current)
      : MathUtils.lerp(full ? 0.4 : 0.56, full ? 0.12 : 0.18, amount.current);
    if (hemisphere.current) hemisphere.current.intensity = MathUtils.lerp(cinematic ? 0.68 : full ? 0.48 : 0.64, cinematic ? 0.2 : 0.16, amount.current);
    if (fill.current) fill.current.intensity = MathUtils.lerp(cinematic ? 0.35 : 0.85, cinematic ? 0.13 : 0.2, amount.current);
    if (rim.current) rim.current.intensity = MathUtils.lerp(cinematic ? 0.55 : 1.15, cinematic ? 0.22 : 0.48, amount.current);
    if (key.current) {
      key.current.intensity = MathUtils.lerp(cinematic ? 3.4 : full ? 3.2 : 3.6, cinematic ? 0.65 : 0.2, amount.current)
        * (1 - cloudAmount.current * (cinematic ? 0.72 : 0.35));
      key.current.color.copy(colors.sun).lerp(colors.duskSun, Math.sin(amount.current * Math.PI) * (1 - cloudAmount.current));
      if (cinematic) key.current.color.lerp(colors.moon, amount.current);
    }
    scene.environmentIntensity = MathUtils.lerp(cinematic ? 0.62 : 0.4, cinematic ? 0.12 : 0.13, amount.current);
    // A deep backdrop separates pale architecture from the atmosphere at every real-world hour.
    // The tour owns its sky mesh and haze; it must not be covered by this studio color.
    if (!cinematic) scene.background = colors.mixed.copy(colors.day).lerp(colors.overcast, cloudAmount.current * 0.65).lerp(colors.twilight, Math.sin(amount.current * Math.PI) * 0.5).lerp(colors.night, amount.current);
  });
  return <>
    <ambientLight ref={ambient} intensity={0.56} />
    <hemisphereLight ref={hemisphere} args={['#c1e6ec', '#74695e', full ? 0.48 : 0.64]} />
    <directionalLight ref={key} position={[focus[0] - 12, focus[1] + (cinematic ? 18 : 26), focus[2] + 16]} target={shadowTarget} color="#fff0d4" intensity={3.8} castShadow shadow-camera-left={-shadowRadius} shadow-camera-right={shadowRadius} shadow-camera-top={shadowRadius} shadow-camera-bottom={-shadowRadius} shadow-camera-near={0.1} shadow-camera-far={110} shadow-bias={-0.0006} shadow-normalBias={0.04} />
    <directionalLight ref={fill} position={[20, 10, -18]} intensity={0.85} color="#9bcbd9" />
    <directionalLight ref={rim} position={[-18, 15, -24]} intensity={1.15} color={cinematic ? '#dae5ed' : '#bdffe1'} />
    {roomFillLights({ deviceStates, view, floor, night }).map(({ id, ...light }) => <pointLight key={id} {...light} />)}
  </>;
}
