import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BackSide, FogExp2, MathUtils, Mesh, MeshStandardMaterial, ShaderMaterial, Vector3 } from 'three';
import {
  createCinematicAtmosphereState, updateCinematicAtmosphereState, type CinematicWeather,
} from './cinematicAtmospherePalette';

const skyVertex = `
  varying vec3 skyDirection;
  void main() {
    skyDirection = position;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip.xyww;
  }
`;
const skyFragment = `
  uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor;
  uniform vec3 celestialDirection; uniform float sunVisibility; uniform float moonVisibility;
  varying vec3 skyDirection;
  void main() {
    vec3 direction = normalize(skyDirection);
    float elevation = max(direction.y, 0.0);
    vec3 sky = mix(horizon, zenith, pow(smoothstep(0.0, 0.82, elevation), 0.48));
    float alignment = max(dot(direction, celestialDirection), 0.0);
    float aureole = pow(alignment, 22.0) * 0.13 + pow(alignment, 180.0) * 0.19;
    float disc = smoothstep(0.99991, 0.99997, alignment);
    sky += sunColor * (aureole + disc * 1.6) * sunVisibility;
    sky += vec3(0.49, 0.66, 0.89) * (pow(alignment, 120.0) * 0.026 + disc * 0.72) * moonVisibility;
    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Replace the studio only for the tour: a quiet horizon, atmospheric depth, and grounded site. */
export function CinematicAtmosphere({ daylight, weather, reducedMotion }: {
  daylight: number;
  weather: CinematicWeather;
  reducedMotion: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const sky = useRef<Mesh>(null);
  const terrain = useRef<MeshStandardMaterial>(null);
  const visibleDaylight = useRef(daylight);
  const atmosphere = useMemo(createCinematicAtmosphereState, []);
  const fog = useMemo(() => new FogExp2('#e6dfc9', 0.0028), []);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      zenith: { value: atmosphere.zenith }, horizon: { value: atmosphere.horizon },
      sunColor: { value: atmosphere.sun }, celestialDirection: { value: new Vector3(-12, 18, 16).normalize() },
      sunVisibility: { value: 1 }, moonVisibility: { value: 0 },
    },
    vertexShader: skyVertex, fragmentShader: skyFragment,
  }), [atmosphere]);

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    scene.background = null;
    scene.fog = fog;
    return () => {
      if (scene.background === null) scene.background = previousBackground;
      if (scene.fog === fog) scene.fog = previousFog;
    };
  }, [scene, fog]);
  useEffect(() => () => { material.dispose(); }, [material]);

  useFrame(({ camera }, delta) => {
    visibleDaylight.current = reducedMotion ? daylight
      : MathUtils.damp(visibleDaylight.current, daylight, 2, Math.min(delta, 0.08));
    updateCinematicAtmosphereState(atmosphere, visibleDaylight.current, weather);
    material.uniforms.sunVisibility!.value = atmosphere.sunVisibility;
    material.uniforms.moonVisibility!.value = atmosphere.moonVisibility;
    fog.color.copy(atmosphere.horizon);
    fog.density = atmosphere.fogDensity;
    terrain.current?.color.copy(atmosphere.terrain);
    // A camera-centred shell has no distant seam or parallax and stays inside the far plane.
    sky.current?.position.copy(camera.position);
  });

  return <group name="cinematic-property-atmosphere">
    <mesh ref={sky} material={material} frustumCulled={false} renderOrder={-100}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
    <mesh name="cinematic-surrounding-terrain" position={[10, -0.495, -6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1200, 1200]} />
      <meshStandardMaterial ref={terrain} color="#879180" roughness={1} metalness={0} />
    </mesh>
  </group>;
}
