import { SOLAR_LIGHT_RIG } from '../../../packages/home-scene/src/renderer-lab/solarLighting';
import { BEDROOM_LIGHT_RIG } from '../../../packages/home-scene/src/renderer-lab/bedroomLighting';
import type { Float3 } from 'react-native-filament';
import type { WeatherKind } from '../../../packages/home-scene/src/renderer-lab/weather';

// SDK 1.11 fixes its camera at f/16, 1/125 s, ISO 100 with no exposure setter.
// Compensate practical radiance for this daylight exposure. Diffusers and water
// retain their existing separate day/night emission response.
const FIXED_EXPOSURE_GAIN = 512;
const WARM_EMISSION: Float3 = [1, 0.76, 0.42];

// These are renderer calibration values, not wattage or measured device output.
// The fixed native camera needs bright practicals even during the day. Keeping
// them independent of weather/exposure also prevents a lamp changing on a mode switch.
export const BEDROOM_LIGHTS = BEDROOM_LIGHT_RIG.map((light) => ({
  ...light, intensity: (light.id === 'master-light' ? 8800 : 3000) * FIXED_EXPOSURE_GAIN,
}));
export const SOLAR_LIGHT_INTENSITY = 9600 * FIXED_EXPOSURE_GAIN;
// Linear sRGB forms of the reference's #ffdda7 solar, #fff2d9 sun,
// #a5bdff moon, and #ccdeea overcast palette; no Three.js import in native.
export const SOLAR_LIGHT_COLOR: Float3 = [1, 0.7230551289219693, 0.386429433787049];

const SUN_COLOR: Float3 = [1, 0.8879231178819663, 0.6938717612919899];
const MOON_COLOR: Float3 = [0.3762621229909065, 0.5088813208549338, 1];
const OVERCAST_COLOR: Float3 = [0.6038273388553378, 0.7304607400903537, 0.8227857543962835];

export const SOLAR_LIGHTS = SOLAR_LIGHT_RIG;

/** Preserve diffuser/water emission independently of practical and ambient lighting. */
export function filamentLightGain(night: boolean): number {
  return night ? FIXED_EXPOSURE_GAIN : 1;
}

/** Supply shader-compatible linear emissive radiance, including a true off state. */
export function filamentEmission(on: boolean, night: boolean): Float3 {
  const strength = on ? 80 * filamentLightGain(night) : 0;
  return WARM_EMISSION.map((channel) => channel * strength) as Float3;
}

/** Calibrate the fixed native exposure against the shared scene's day/night reference. */
export function filamentEnvironment(night: boolean, weather: WeatherKind = 'clear') {
  // Skybox hex bytes are treated as linear by SDK 1.11. These display-calibrated
  // values keep the sky distinct from scene illumination; raising the fill must
  // not turn a night backdrop into daylight.
  const dry = night
    ? { ambient: 9000, directional: 2200, color: MOON_COLOR, sky: '#03070e' }
    : { ambient: 32000, directional: 45000, color: SUN_COLOR, sky: '#b1caca' };
  if (weather === 'clear') return dry;
  const cloud = weather === 'light' ? 0.35 : weather === 'heavy' ? 0.72 : 1;
  return {
    ambient: dry.ambient * (1 - cloud * (night ? 0.18 : 0.36)),
    directional: dry.directional * (1 - cloud * 0.88),
    color: night ? MOON_COLOR : OVERCAST_COLOR,
    sky: night ? dry.sky : weather === 'light' ? '#73878b' : weather === 'heavy' ? '#28343c' : '#131e29',
  };
}
