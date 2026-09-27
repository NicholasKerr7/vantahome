import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Object3D, SpotLight } from 'three';
import { DEVICES, type DeviceDefinition } from '../data';
import type { DeviceState } from '../state';
import { readDevice } from './types';
import { readLabLightState } from '../lightAppearance';

interface SolarLightPoolsProps {
  deviceStates: Record<string, DeviceState>;
  reducedMotion: boolean;
}

const SOLAR_LIGHTS = DEVICES.filter((device) => device.model === 'solar-streetlight');

/** Cast a soft inward pool in the selected LED color, without extra shadow maps. */
function SolarLightPool({
  device,
  state,
  reducedMotion,
}: {
  device: DeviceDefinition;
  state: DeviceState;
  reducedMotion: boolean;
}) {
  const lamp = useRef<SpotLight>(null);
  const target = useMemo(() => {
    const aim = new Object3D();
    aim.position.set(0, 0.02, -0.95);
    return aim;
  }, []);
  const appearance = readLabLightState(device, state);
  const intensity = appearance.on ? appearance.brightness * 0.8 : 0;
  const initialIntensity = useRef(intensity);
  useFrame((_, delta) => {
    if (!lamp.current || document.hidden) return;
    lamp.current.intensity = reducedMotion
      ? intensity
      : MathUtils.damp(lamp.current.intensity, intensity, 4, Math.min(delta, 0.08));
  });
  return (
    <group position={device.position} rotation={device.rotation}>
      <primitive object={target} />
      <spotLight
        ref={lamp}
        name={`${device.id}-downlight`}
        position={[0, 3.868, -0.45]}
        target={target}
        color={appearance.colorHex}
        intensity={initialIntensity.current}
        angle={0.88}
        penumbra={1}
        distance={9}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}

/** Match all four physical solar LEDs to their shared dashboard power and dimmer state. */
export function SolarLightPools({ deviceStates, reducedMotion }: SolarLightPoolsProps) {
  return (
    <group name="solar-corner-light-pools">
      {SOLAR_LIGHTS.map((device) => (
        <SolarLightPool
          key={device.id}
          device={device}
          state={readDevice(deviceStates, device.id)}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}
