import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, ShaderMaterial, Vector2 } from 'three';
import type { HouseView } from './types';
import { usePageMotion } from './usePageMotion';
import {
  PARCEL_POINTS, RAIN_CEILING, createWeatherAnchors, weatherLandingHeight,
  weatherMagnitude, weatherParticleCount, weatherSeed, windTravelDirection, type SceneWeather,
} from './weatherGeometry';

interface WeatherEffectsProps {
  weather: SceneWeather;
  view: HouseView;
  roomId: string;
  reducedMotion: boolean;
}

const MAX_PARTICLES = 460;
const parcelVectors = PARCEL_POINTS.map(([x, z]) => new Vector2(x, z));
const fragmentShader = `
  uniform vec2 parcel[4]; uniform float snow;
  varying vec2 worldGround; varying float visibility;
  bool insideParcel(vec2 p) {
    bool inside = false;
    for (int i = 0; i < 4; i++) {
      vec2 a = parcel[i]; vec2 b = parcel[(i + 3) % 4];
      if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
    }
    return inside;
  }
  void main() {
    if (!insideParcel(worldGround)) discard;
    gl_FragColor = vec4(mix(vec3(.67,.82,.87),vec3(.93,.96,.97),snow), visibility * mix(.27,.48,snow));
  }
`;
const vertexShader = `
  uniform float time; uniform float snow; uniform float windSpeed;
  uniform vec2 wind; attribute float phase; attribute float landing;
  varying vec2 worldGround; varying float visibility;
  void main() {
    float cycle = fract(phase + time * mix(.63,.095,snow));
    float span = ${RAIN_CEILING.toFixed(1)} - landing;
    float head = landing + (1.0-cycle) * span;
    float streakLength = mix(.25,.075,snow);
    vec3 point = vec3(position.x, head + position.y * streakLength, position.z);
    point.xz += wind * windSpeed * (.015 + position.y * .007);
    point.xz += vec2(sin(time*.38+phase*25.), cos(time*.3+phase*29.)) * snow * .14;
    worldGround = point.xz;
    visibility = smoothstep(0.,.09,cycle) * (1.-smoothstep(.91,1.,cycle));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(point,1.);
  }
`;

/** One inexpensive draw call produces site-bounded precipitation; roof envelopes stop indoor rain. */
function Precipitation({ weather, reducedMotion }: Pick<WeatherEffectsProps, 'weather' | 'reducedMotion'>) {
  const smallViewport = useThree((state) => state.size.width < 720);
  const canAnimate = usePageMotion(reducedMotion);
  const snowfall = weatherMagnitude(weather.snowfallCm, 30);
  const rain = weatherMagnitude(weather.precipitationMm, 50);
  const snow = snowfall > 0 && (rain === 0 || [71, 73, 75, 77, 85, 86].includes(weather.weatherCode));
  const particleCount = weatherParticleCount(Math.max(rain, snowfall), smallViewport);
  const [geometry, material] = useMemo(() => {
    const anchors = createWeatherAnchors(MAX_PARTICLES);
    const positions = new Float32Array(MAX_PARTICLES * 6);
    const phases = new Float32Array(MAX_PARTICLES * 2);
    const landings = new Float32Array(MAX_PARTICLES * 2);
    anchors.forEach(([x, z], index) => {
      positions.set([x, 0, z, x, 1, z], index * 6);
      phases.fill(weatherSeed(index + 950), index * 2, index * 2 + 2);
      landings.fill(weatherLandingHeight(x, z), index * 2, index * 2 + 2);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new BufferAttribute(phases, 1));
    geometry.setAttribute('landing', new BufferAttribute(landings, 1));
    const material = new ShaderMaterial({
      uniforms: {
        time: { value: 0 }, snow: { value: 0 }, windSpeed: { value: 0 },
        wind: { value: new Vector2() }, parcel: { value: parcelVectors },
      },
      vertexShader, fragmentShader, transparent: true, depthWrite: false, toneMapped: false,
    });
    return [geometry, material] as const;
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useEffect(() => {
    geometry.setDrawRange(0, particleCount * 2);
    material.uniforms.snow!.value = Number(snow);
    material.uniforms.windSpeed!.value = weatherMagnitude(weather.windSpeedKmh, 22);
    (material.uniforms.wind!.value as Vector2).set(...windTravelDirection(weather.windDirectionDeg));
  }, [geometry, material, particleCount, snow, weather.windDirectionDeg, weather.windSpeedKmh]);
  useFrame((_, delta) => {
    if (canAnimate.current && particleCount > 0) material.uniforms.time!.value += Math.min(delta, 0.06);
  });
  // Motion-sensitive visitors keep environmental lighting and status without moving or frozen streaks.
  if (reducedMotion || particleCount === 0) return null;
  return <lineSegments name="live-property-precipitation" geometry={geometry} material={material} frustumCulled={false} raycast={() => null} />;
}

/** Outdoor weather is absent from floor cutaways and all indoor immersive viewpoints. */
export function WeatherEffects(props: WeatherEffectsProps) {
  const outdoors = props.view === 'exterior' || (props.view === 'immersive' && ['grounds', 'utility'].includes(props.roomId));
  if (!outdoors) return null;
  return <Precipitation weather={props.weather} reducedMotion={props.reducedMotion} />;
}
