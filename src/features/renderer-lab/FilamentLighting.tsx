import React from 'react';
import { EnvironmentalLight, Skybox } from 'react-native-filament';
import { SOLAR_LIGHT_CONE, SOLAR_LIGHT_RADIUS } from '../../../packages/home-scene/src/renderer-lab/solarLighting';
import { FilamentLight } from './FilamentLight';
import { BEDROOM_LIGHTS, SOLAR_LIGHTS, filamentEnvironment, filamentLightGain } from './nativeLightingConfig';
import type { LabSettings } from './protocol';

const ENVIRONMENT = { uri: 'RNF_default_env_ibl.ktx' };

/** Render the native comparison's ambient fill and device-aligned practical lights. */
export function FilamentLighting({ settings, onError }: { settings: LabSettings; onError: () => void }) {
  const weather = settings.view === 'property' ? settings.weather : 'clear';
  const environment = filamentEnvironment(settings.night, weather);
  const gain = filamentLightGain(settings.night);
  return <>
    <Skybox colorInHex={environment.sky} />
    <EnvironmentalLight key={`${settings.night}:${weather}`} source={ENVIRONMENT} intensity={environment.ambient} />
    <FilamentLight type="directional" intensity={environment.directional} colorKelvin={environment.kelvin}
      onError={onError} direction={[0.594, -0.762, 0.262]} castShadows
      flash={settings.view === 'property' ? { weather, motion: settings.motion, peakIntensity: settings.night ? 7000 : 16000 } : undefined} />
    {settings.view === 'property'
      ? SOLAR_LIGHTS.map((light) => <FilamentLight key={light.id} type="spot" colorKelvin={3000}
        intensity={settings.night ? 3200 * gain : 0} position={light.position} direction={light.direction}
        falloffRadius={SOLAR_LIGHT_RADIUS} spotLightCone={SOLAR_LIGHT_CONE} onError={onError} />)
      : BEDROOM_LIGHTS.map((light) => <FilamentLight key={light.id} type="point" colorKelvin={light.kelvin}
        intensity={settings.lights ? light.lumens * gain : 0} position={light.position}
        falloffRadius={light.radius} onError={onError} />)}
  </>;
}
