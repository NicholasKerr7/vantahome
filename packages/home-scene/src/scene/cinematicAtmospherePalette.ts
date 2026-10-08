import { Color, MathUtils } from 'three';
import type { SceneWeather } from './weatherGeometry';

export type CinematicWeather = Pick<SceneWeather, 'cloudCover' | 'precipitationMm'> | null | undefined;

export interface CinematicAtmosphereState {
  zenith: Color;
  horizon: Color;
  terrain: Color;
  sun: Color;
  fogDensity: number;
  sunVisibility: number;
  moonVisibility: number;
}

const palette = {
  dayZenith: new Color('#7295b2'), cloudZenith: new Color('#788590'), nightZenith: new Color('#050c1a'),
  dayHorizon: new Color('#e6dfc9'), cloudHorizon: new Color('#b2b8b7'), nightHorizon: new Color('#1c2c40'),
  duskHorizon: new Color('#ad7969'),
  dayTerrain: new Color('#879180'), cloudTerrain: new Color('#7a8379'), nightTerrain: new Color('#536365'),
  daySun: new Color('#fff1ce'), duskSun: new Color('#ffc285'),
};

/** Clamp external weather and clock values before they can reach the renderer. */
function bounded(value: number | undefined, maximum = 1): number {
  return Number.isFinite(value) ? MathUtils.clamp(value!, 0, maximum) : 0;
}

/** Allocate the changing palette once; frame updates reuse every Color instance. */
export function createCinematicAtmosphereState(): CinematicAtmosphereState {
  return {
    zenith: new Color(), horizon: new Color(), terrain: new Color(), sun: new Color(),
    fogDensity: 0.003, sunVisibility: 1, moonVisibility: 0,
  };
}

/** Keep photographic sky, haze, and terrain tied to the existing real solar/weather state. */
export function updateCinematicAtmosphereState(
  state: CinematicAtmosphereState,
  daylight: number,
  weather: CinematicWeather,
): void {
  const day = bounded(daylight);
  const night = 1 - day;
  const clouds = bounded(weather?.cloudCover, 100) / 100;
  const rain = bounded(weather?.precipitationMm, 12) / 12;
  const dusk = Math.sin(day * Math.PI) * (1 - clouds);
  state.zenith.copy(palette.dayZenith).lerp(palette.cloudZenith, clouds).lerp(palette.nightZenith, night);
  state.horizon.copy(palette.dayHorizon).lerp(palette.cloudHorizon, clouds)
    .lerp(palette.duskHorizon, dusk * 0.45).lerp(palette.nightHorizon, night);
  state.terrain.copy(palette.dayTerrain).lerp(palette.cloudTerrain, clouds).lerp(palette.nightTerrain, night);
  state.sun.copy(palette.daySun).lerp(palette.duskSun, dusk);
  state.fogDensity = 0.0028 + clouds * 0.0022 + rain * 0.0018 + night * 0.0012;
  state.sunVisibility = day * (1 - clouds * 0.94);
  state.moonVisibility = night * (1 - clouds * 0.9);
}
