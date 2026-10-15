import data from './weather-surfaces.json';
import type { WeatherKind } from './weather';

export type WeatherVector = [number, number, number];
export interface WeatherGroup {
  name: string;
  kind: 'rain' | 'splash' | 'runoff' | 'wet' | 'plant';
  phase: number;
  anchor: WeatherVector;
  tier: number;
}
export interface WeatherPose {
  position: WeatherVector;
  scale: WeatherVector;
  rotation: WeatherVector;
}

/** Generated groups contain batched particles; neither renderer updates individual drops. */
export const WEATHER_GROUPS = data.groups as WeatherGroup[];
export const ORIGINAL_WEATHER_FOLIAGE_NAMES = data.originalFoliageNames;

/** Resolve bounded native/Three poses using a map-calibrated downwind vector prepared on JS. */
export function weatherGroupPose(
  group: WeatherGroup,
  elapsed: number,
  weather: WeatherKind,
  windSpeed: number,
  windTravel: readonly [number, number],
  motion: boolean,
): WeatherPose {
  'worklet';
  const position: WeatherVector = [group.anchor[0], group.anchor[1], group.anchor[2]];
  const rotation: WeatherVector = [0, 0, 0];
  const scale: WeatherVector = [1, 1, 1];
  const intensity = weather === 'storm' ? 3 : weather === 'heavy' ? 2 : weather === 'light' ? 1 : 0;
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const wind = Number.isFinite(windSpeed) ? Math.max(0, Math.min(55, windSpeed)) : 0;

  if (group.kind === 'plant') {
    if (motion && wind > 0) {
      // Palm crowns pivot where fronds meet the stationary trunk; shrubs pivot at soil level.
      const gust = 0.6 + 0.25 * Math.sin(time * 0.73 + group.phase * 6.28)
        + 0.15 * Math.sin(time * 1.93 + group.phase * 11);
      const bend = Math.min(0.095, wind * 0.0017) * gust;
      rotation[0] = windTravel[1] * bend;
      rotation[2] = -windTravel[0] * bend;
    }
    return { position, scale, rotation };
  }

  if (intensity === 0 || (group.kind !== 'wet' && (!motion || group.tier > intensity))) {
    scale[0] = 0; scale[1] = 0; scale[2] = 0;
    return { position, scale, rotation };
  }
  if (group.kind === 'wet') return { position, scale, rotation };

  if (group.kind === 'rain') {
    const speed = intensity === 3 ? 15 : intensity === 2 ? 11 : 7;
    const phase = (time * speed / 6 + group.phase) % 1;
    const height = 6 * (1 - phase);
    // The streak reaches its authored landing point as horizontal drift tends to zero.
    const drift = height * wind / 650;
    position[0] -= windTravel[0] * drift;
    position[1] += height;
    position[2] -= windTravel[1] * drift;
  } else if (group.kind === 'splash') {
    const phase = (time * (intensity === 3 ? 2.6 : 1.8) + group.phase) % 1;
    position[1] += Math.sin(phase * Math.PI) * (intensity === 3 ? 0.14 : 0.08);
    // A short quiet interval makes each impact a distinct burst without changing batch anchors.
    if (phase > 0.74) { scale[0] = 0; scale[1] = 0; scale[2] = 0; }
  } else if (group.kind === 'runoff') {
    const phase = (time * 2.1 + group.phase) % 1;
    position[1] -= phase * 0.72;
  }
  return { position, scale, rotation };
}

/** One soft, slow sky flash per nineteen seconds; accessibility settings suppress it entirely. */
export function stormFlash(elapsed: number, weather: WeatherKind, motion: boolean): number {
  'worklet';
  if (!motion || weather !== 'storm' || elapsed < 0) return 0;
  const phase = elapsed % 19;
  if (phase < 5.5 || phase > 6.35) return 0;
  return Math.sin((phase - 5.5) / 0.85 * Math.PI) * 0.65;
}
