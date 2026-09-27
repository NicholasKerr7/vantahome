import { SOLAR_LIGHT_RIG } from '../../../packages/home-scene/src/renderer-lab/solarLighting';
import type { Float3 } from 'react-native-filament';
import type { WeatherKind } from '../../../packages/home-scene/src/renderer-lab/weather';

// SDK 1.11 fixes its camera at f/16, 1/125 s, ISO 100 and exposes no exposure
// setter. Scale night radiance by nine stops, equivalent to an indoor/night exposure,
// while retaining a dim sky and readable pools from the actual luminaires.
const NIGHT_EXPOSURE_GAIN = 512;
const WARM_EMISSION: Float3 = [1, 0.76, 0.42];

export const BEDROOM_LIGHTS = [
  { id: 'master-light', position: [9.9665, 2.4232, -14.145] as Float3, lumens: 2200, kelvin: 2800, radius: 6 },
  { id: 'master-bedside-left', position: [8.655, 0.91, -15.9] as Float3, lumens: 500, kelvin: 2700, radius: 3.5 },
  { id: 'master-bedside-right', position: [11.345, 0.91, -15.9] as Float3, lumens: 500, kelvin: 2700, radius: 3.5 },
];

export const SOLAR_LIGHTS = SOLAR_LIGHT_RIG;

/** Keep fixture exposure independent of the moonlight/ambient fill. */
export function filamentLightGain(night: boolean): number {
  return night ? NIGHT_EXPOSURE_GAIN : 1;
}

/** Supply shader-compatible linear emissive radiance, including a true off state. */
export function filamentEmission(on: boolean, night: boolean): Float3 {
  const strength = on ? 80 * filamentLightGain(night) : 0;
  return WARM_EMISSION.map((channel) => channel * strength) as Float3;
}

/** Balance a readable blue night fill against warm lights instead of brightening the sky. */
export function filamentEnvironment(night: boolean, weather: WeatherKind = 'clear') {
  // The SDK's hex converter omits sRGB decoding. Prelinearize the midnight color
  // so the background stays dark instead of becoming a bright blue backdrop.
  const dry = night
    ? { ambient: 3200, directional: 640, kelvin: 9000, sky: '#010304' }
    : { ambient: 25000, directional: 18000, kelvin: 6000, sky: '#dce4df' };
  if (weather === 'clear') return dry;
  const cloud = weather === 'light' ? 0.35 : weather === 'heavy' ? 0.72 : 1;
  return {
    ambient: dry.ambient * (1 - cloud * (night ? 0.18 : 0.36)),
    directional: dry.directional * (1 - cloud * 0.88),
    kelvin: night ? 9000 : 7500,
    sky: night ? dry.sky : weather === 'light' ? '#73878b' : weather === 'heavy' ? '#28343c' : '#131e29',
  };
}
