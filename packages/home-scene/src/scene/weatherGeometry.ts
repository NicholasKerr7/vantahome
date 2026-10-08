import siteLayout from '../site-layout.json';
import { ROOMS } from '../data';
import { precipitationRatePerHour } from '../environment/precipitation';
import type { WeatherSnapshot } from '../environment/types';

/** Retain each accumulation's interval so visual intensity is independent of the API time step. */
export type SceneWeather = Pick<WeatherSnapshot,
  'rainMm' | 'snowfallCm' | 'cloudCover' | 'windSpeedKmh' | 'windDirectionDeg' | 'weatherCode' | 'intervalSeconds'>;

export type WeatherPoint = [number, number];
export const RAIN_CEILING = 13;
export const RAIN_FLOOR = siteLayout.parcel.lawnElevation + 0.025;
export const PARCEL_POINTS: WeatherPoint[] = siteLayout.parcel.vertices.map(([x, y]) => [x!, -y!]);
const pavilionBounds = ROOMS.find((room) => room.id === 'utility')?.bounds;

/** Clamp weather magnitudes defensively without allowing NaN into a shader uniform. */
export function weatherMagnitude(value: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : 0;
}

/** Convert meteorological wind FROM north/clockwise into the scene's travel direction. */
export function windTravelDirection(degrees: number): WeatherPoint {
  const angle = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
  return [-Math.sin(angle), Math.cos(angle)];
}

/** Contain precipitation within the four traced property boundaries, including diagonal edges. */
export function isInsideWeatherParcel(x: number, z: number): boolean {
  let inside = false;
  for (let index = 0, previous = PARCEL_POINTS.length - 1; index < PARCEL_POINTS.length; previous = index++) {
    const [ax, az] = PARCEL_POINTS[index]!;
    const [bx, bz] = PARCEL_POINTS[previous]!;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** Stable pseudo-random values keep weather from visibly rearranging when controls re-render. */
export function weatherSeed(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Sample the real lot with rejection sampling; the generous cap also catches malformed layout data. */
export function createWeatherAnchors(count: number): WeatherPoint[] {
  const xs = PARCEL_POINTS.map(([x]) => x);
  const zs = PARCEL_POINTS.map(([, z]) => z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const anchors: WeatherPoint[] = [];
  for (let attempt = 0; anchors.length < count && attempt < count * 30; attempt++) {
    const x = minX + weatherSeed(attempt * 2 + 1) * (maxX - minX);
    const z = minZ + weatherSeed(attempt * 2 + 2) * (maxZ - minZ);
    if (isInsideWeatherParcel(x, z)) anchors.push([x, z]);
  }
  if (anchors.length !== count) throw new Error('Weather particles could not be placed inside the property.');
  return anchors;
}

/** End rain above roof envelopes so water cannot fall through furnished rooms or the pavilion. */
export function weatherLandingHeight(x: number, z: number): number {
  // Roof overhang and wind drift are included in this deliberately conservative envelope.
  if (x >= -1.4 && x <= 18 && z >= -17.6 && z <= 1.4) return 7.95;
  if (pavilionBounds && x >= pavilionBounds[0]! - 0.7 && x <= pavilionBounds[1]! + 0.7 && z >= pavilionBounds[2]! - 0.7 && z <= pavilionBounds[3]! + 0.7) return 2.7;
  return RAIN_FLOOR;
}

/** Select rain in mm/h or snow in cm/h without counting snow water equivalent as rain. */
export function weatherPrecipitation(weather: SceneWeather): { snow: boolean; ratePerHour: number } {
  const rainRate = precipitationRatePerHour(weather.rainMm, weather.intervalSeconds);
  const snowRate = precipitationRatePerHour(weather.snowfallCm, weather.intervalSeconds);
  const snow = snowRate > 0 && (rainRate === 0 || [71, 73, 75, 77, 85, 86].includes(weather.weatherCode));
  return { snow, ratePerHour: weatherMagnitude(snow ? snowRate : rainRate, snow ? 30 : 50) };
}

/** Scale hourly rain (mm) or snow (cm) intensity within the existing phone/desktop particle budgets. */
export function weatherParticleCount(ratePerHour: number, smallViewport: boolean): number {
  const rate = weatherMagnitude(ratePerHour, 50);
  if (rate <= 0) return 0;
  const maximum = smallViewport ? 260 : 460;
  return Math.round(Math.min(maximum, 85 + Math.sqrt(rate) * (smallViewport ? 54 : 98)));
}

/** A ballistic water jet leaves the nozzle and lands at lawn height, with pressure controlling reach. */
export function irrigationJetPoint(progress: number, level: number, nozzleHeight: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const pressure = weatherMagnitude(level, 100) / 100;
  const range = 0.75 + pressure * 1.9;
  return [0.055 + t * range, nozzleHeight * (1 - t) + 4 * t * (1 - t) * (0.25 + pressure * 0.6), 0];
}
