import React from 'react';
import { EnvironmentalLight, Skybox } from 'react-native-filament';
import { SOLAR_LIGHT_CONE, SOLAR_LIGHT_RADIUS } from '../../../packages/home-scene/src/renderer-lab/solarLighting';
import { BEDROOM_LIGHT_LINEAR_COLOR, BEDROOM_LIGHT_RADIUS } from '../../../packages/home-scene/src/renderer-lab/bedroomLighting';
import { FilamentLight } from './FilamentLight';
import { BEDROOM_LIGHTS, SOLAR_LIGHTS, SOLAR_LIGHT_COLOR, SOLAR_LIGHT_INTENSITY, filamentEnvironment } from './nativeLightingConfig';
import type { LabSettings } from './protocol';

const ENVIRONMENT = { uri: 'RNF_default_env_ibl.ktx' };

/** Render the native comparison's ambient fill and device-aligned practical lights. */
export function FilamentLighting({ settings, onError }: { settings: LabSettings; onError: () => void }) {
  const weather = settings.view === 'property' ? settings.weather : 'clear';
  const environment = filamentEnvironment(settings.night, weather);
  return <>
    <Skybox colorInHex={environment.sky} />
    <EnvironmentalLight key={`${settings.night}:${weather}`} source={ENVIRONMENT} intensity={environment.ambient} />
    <FilamentLight type="directional" intensity={environment.directional} color={environment.color}
      onError={onError} direction={[0.594, -0.762, 0.262]} castShadows
      flash={settings.view === 'property' ? { weather, motion: settings.motion, peakIntensity: settings.night ? 7000 : 16000 } : undefined} />
    {settings.view === 'property'
      ? SOLAR_LIGHTS.map((light) => <FilamentLight key={light.id} type="spot" color={SOLAR_LIGHT_COLOR}
        intensity={settings.night ? SOLAR_LIGHT_INTENSITY : 0} position={light.position} direction={light.direction}
        falloffRadius={SOLAR_LIGHT_RADIUS} spotLightCone={SOLAR_LIGHT_CONE} onError={onError} />)
      : BEDROOM_LIGHTS.map((light) => <FilamentLight key={light.id} type="point" color={BEDROOM_LIGHT_LINEAR_COLOR}
        intensity={settings.lights ? light.intensity : 0} position={light.position}
        falloffRadius={BEDROOM_LIGHT_RADIUS} onError={onError} />)}
  </>;
}
