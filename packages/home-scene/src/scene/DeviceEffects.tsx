import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Group, InstancedMesh, MathUtils, Object3D, type ShaderMaterial } from 'three';
import type { DeviceDefinition } from '../data';
import type { DeviceState } from '../state';
import { readDeviceSetting } from '../deviceCapabilities';
import { irrigationJetPoint } from './weatherGeometry';
import { advanceTelevisionDisplay, createTelevisionUniforms } from './televisionDisplay';

interface EffectProps {
  device: DeviceDefinition;
  state: DeviceState;
  reducedMotion: boolean;
  canAnimate: RefObject<boolean>;
}

/** Keep the preserved television visibly responsive without external video downloads. */
export function TelevisionDisplay({
  state,
  reducedMotion,
  canAnimate,
}: Omit<EffectProps, 'device'>) {
  const material = useRef<ShaderMaterial & { uniforms: ReturnType<typeof createTelevisionUniforms> }>(null);
  // React Three Fiber may copy uniform props; animate the mounted material's actual uniforms.
  const [uniforms] = useState(() => createTelevisionUniforms(state.on));
  useFrame((_, delta) => {
    if (material.current) advanceTelevisionDisplay(material.current.uniforms, state, delta, reducedMotion, canAnimate.current);
  });
  return (
    <mesh position={[0, 0.3475, 0.024]}>
      <planeGeometry args={[1.235, 0.695]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        toneMapped={false}
        vertexShader={`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`
      varying vec2 vUv; uniform float time; uniform float power; uniform vec3 warm; uniform vec3 cool;
      void main(){float ridge=sin(vUv.x*6.+time)*.13+.39;float mountain=smoothstep(ridge-.014,ridge+.014,vUv.y);
      float sun=1.-smoothstep(.12,.125,distance(vUv,vec2(.72+sin(time)*.06,.7)));
      vec3 sky=mix(cool,warm,vUv.y*.76);vec3 terrain=mix(vec3(.065,.18,.16),vec3(.16,.32,.24),vUv.y);
      gl_FragColor=vec4(mix(vec3(.003,.004,.005),mix(terrain,sky,mountain)+sun*vec3(.32,.20,.06),power),1.);
      #include <colorspace_fragment>
      }`}
      />
    </mesh>
  );
}

/** Small, local effects communicate operating state without cluttering the whole house. */
function OperatingEffect({ device, state, canAnimate }: EffectProps) {
  const effect = useRef<Group>(null);
  const time = useRef(0);
  const {
    kind,
    dimensions: [, height, depth],
  } = device;
  useFrame((_, delta) => {
    if (!effect.current || !state.on || !canAnimate.current) return;
    time.current += Math.min(delta, 0.06);
    effect.current.children.forEach((child, index) => {
      const phase = (time.current * 0.45 + index * 0.27) % 1;
      if (kind === 'coffee') {
        child.position.y = height * 0.7 + phase * 0.35;
        child.scale.setScalar(0.5 + phase);
      }
      if (kind === 'speaker') {
        const scale =
          (0.5 + phase * 1.5) *
          Math.max(
            0.12,
            Number(readDeviceSetting(device, state, 'volume')) / 50,
          );
        child.scale.set(scale, scale, 1);
        child.position.z = depth / 2 + 0.02 + phase * 0.25;
      }
      if (kind === 'ac') {
        child.position.z = depth / 2 + 0.08 + phase * 0.9;
        child.position.y = 0.03 - phase * 0.4;
      }
      if (kind === 'dryer')
        child.rotation.z = time.current * (1 + state.level * 0.04);
    });
  });
  if (!state.on) return null;
  if (kind === 'coffee')
    return (
      <group ref={effect}>
        {[0, 1, 2].map((index) => (
          <mesh
            key={index}
            position={[
              0.045 * (index - 1),
              height * 0.8 + index * 0.08,
              depth / 2 + 0.035,
            ]}
          >
            <sphereGeometry args={[0.022, 8, 6]} />
            <meshBasicMaterial
              color="#e8e6df"
              transparent
              opacity={0.18}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    );
  if (kind === 'speaker')
    return (
      <group ref={effect}>
        {[0, 1, 2].map((index) => (
          <mesh
            key={index}
            position={[0, height * 0.5, depth / 2 + 0.03 + index * 0.08]}
          >
            <ringGeometry args={[0.08, 0.087, 24]} />
            <meshBasicMaterial
              color="#bad8bd"
              transparent
              opacity={0.2}
              depthWrite={false}
              side={2}
            />
          </mesh>
        ))}
      </group>
    );
  if (kind === 'ac')
    return (
      <group ref={effect}>
        {[-1, 0, 1].map((index) => (
          <mesh
            key={index}
            position={[index * 0.22, -0.12, depth / 2 + 0.32]}
            rotation={[Math.PI / 3, 0, 0]}
          >
            <cylinderGeometry args={[0.005, 0.012, 0.19, 6]} />
            <meshBasicMaterial
              color="#b6e0d7"
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    );
  if (kind === 'dryer')
    return (
      <group position={[0, 0.4, 0.426]}>
        <group ref={effect}>
          <group>
            {[0, 1, 2].map((index) => (
              <mesh
                key={index}
                position={[
                  Math.cos((index * Math.PI * 2) / 3) * 0.075,
                  Math.sin((index * Math.PI * 2) / 3) * 0.075,
                  0,
                ]}
                rotation={[0, 0, index * 2]}
              >
                <boxGeometry args={[0.055, 0.035, 0.006]} />
                <meshStandardMaterial
                  color={index === 0 ? '#e3d8bf' : '#789284'}
                />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    );
  return null;
}

/** Pressure-shaped jets and pooled droplets show irrigation without one mesh per water drop. */
function IrrigationEffect({ device, state, reducedMotion, canAnimate }: EffectProps) {
  const root = useRef<Group>(null);
  const droplets = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);
  const transform = useMemo(() => new Object3D(), []);
  const nozzleHeight = device.dimensions[1] * 0.96;
  const streams = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    for (let jet = 0; jet < 4; jet++) {
      const angle = jet * Math.PI / 2;
      for (let segment = 0; segment < 24; segment++) {
        for (const progress of [segment / 24, (segment + 1) / 24]) {
          const [distance, height] = irrigationJetPoint(progress, state.level, nozzleHeight);
          positions.push(Math.cos(angle) * distance, height, Math.sin(angle) * distance);
        }
      }
    }
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    return geometry;
  }, [nozzleHeight, state.level]);
  useEffect(() => () => streams.dispose(), [streams]);
  useFrame((_, delta) => {
    if (!canAnimate.current || !droplets.current || !root.current) return;
    elapsed.current += Math.min(delta, 0.06);
    root.current.rotation.y = elapsed.current * 0.18;
    for (let index = 0; index < 64; index++) {
      const jet = Math.floor(index / 16);
      const progress = (index % 16 / 16 + elapsed.current * 0.75) % 1;
      const [distance, height] = irrigationJetPoint(progress, state.level, nozzleHeight);
      const angle = jet * Math.PI / 2;
      transform.position.set(Math.cos(angle) * distance, height, Math.sin(angle) * distance);
      const size = 0.011 + progress * 0.009;
      transform.scale.set(size, size * (1.35 - progress * 0.35), size);
      transform.updateMatrix();
      droplets.current.setMatrixAt(index, transform.matrix);
    }
    droplets.current.instanceMatrix.needsUpdate = true;
    droplets.current.visible = true;
  });
  return <group ref={root} name="irrigation-water-jets">
    <lineSegments geometry={streams} raycast={() => null}>
      <lineBasicMaterial color="#bce0e3" transparent opacity={reducedMotion ? 0.3 : 0.2} depthWrite={false} />
    </lineSegments>
    {!reducedMotion && <instancedMesh ref={droplets} args={[undefined, undefined, 64]} visible={false} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[1, 5, 4]} />
      <meshBasicMaterial color="#cce9ee" transparent opacity={0.64} depthWrite={false} />
    </instancedMesh>}
  </group>;
}

/** Mount frame callbacks only for devices that have an actual operating effect. */
export function DeviceEffects(props: EffectProps) {
  if (props.device.kind === 'tv')
    return (
      <TelevisionDisplay
        state={props.state}
        reducedMotion={props.reducedMotion}
        canAnimate={props.canAnimate}
      />
    );
  if (
    !props.state.on ||
    !['coffee', 'speaker', 'ac', 'dryer', 'sprinkler'].includes(
      props.device.kind,
    )
  )
    return null;
  if (
    props.device.kind === 'speaker' &&
    readDeviceSetting(props.device, props.state, 'muted')
  )
    return null;
  if (props.device.kind === 'sprinkler') return <IrrigationEffect {...props} />;
  return <OperatingEffect {...props} />;
}
