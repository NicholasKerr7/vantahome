import { useEffect } from 'react';
import {
  RenderCallbackContext, useFilamentContext, type Entity, type Float3,
} from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import { stormFlash } from '../../../packages/home-scene/src/renderer-lab/weatherAnimation';
import type { WeatherKind } from '../../../packages/home-scene/src/renderer-lab/weather';

interface Props {
  type: 'directional' | 'point' | 'spot';
  intensity: number;
  colorKelvin: number;
  direction?: Float3;
  position?: Float3;
  castShadows?: boolean;
  falloffRadius?: number;
  spotLightCone?: [number, number];
  flash?: { weather: WeatherKind; motion: boolean; peakIntensity: number };
  onError: () => void;
}

/** Approximate a color temperature as linear sRGB for the native light manager. */
function temperatureColor(kelvin: number): Float3 {
  const temperature = Math.max(1000, Math.min(40000, kelvin)) / 100;
  const red = temperature <= 66 ? 255 : 329.698727446 * (temperature - 60) ** -0.1332047592;
  const green = temperature <= 66
    ? 99.4708025861 * Math.log(temperature) - 161.1195681661
    : 288.1221695283 * (temperature - 60) ** -0.0755148492;
  const blue = temperature >= 66 ? 255 : temperature <= 19 ? 0
    : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  return [red, green, blue].map((channel) => {
    const normalized = Math.max(0, Math.min(255, channel)) / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }) as Float3;
}

/**
 * Own one light on the rendering thread. Filament 1.11's shared-value Light props
 * create nested worklets during mount; avoiding that path also gives us explicit
 * destruction when the comparison closes. Settings are captured directly, without
 * constructing listener worklets from inside another worklet.
 */
export function FilamentLight({
  type, intensity, colorKelvin, direction, position, castShadows, falloffRadius, spotLightCone, flash, onError,
}: Props) {
  const { lightManager, scene, workletContext } = useFilamentContext();
  const entity = useSharedValue<Entity | undefined>(undefined);
  const active = useSharedValue(false);
  const lastIntensity = useSharedValue(Number.NaN);
  const lastTemperature = useSharedValue(Number.NaN);
  const elapsed = useSharedValue(0);
  const flashWeather = flash?.weather;
  const flashMotion = flash?.motion ?? false;
  const flashPeak = flash?.peakIntensity ?? 0;
  const [red, green, blue] = temperatureColor(colorKelvin);

  useEffect(() => {
    active.value = true;
    return () => {
      // Stop callbacks immediately, then destroy after already queued frames.
      active.value = false;
      // WorkletsCore 1.6.3 returns a thenable whose native catch export is misnamed.
      void workletContext.runAsync(() => {
        'worklet';
        const ownedEntity = entity.value;
        if (!ownedEntity) return;
        scene.removeEntity(ownedEntity);
        lightManager.destroy(ownedEntity);
        entity.value = undefined;
      }).then(undefined, onError);
    };
  }, [active, entity, lightManager, scene, workletContext, onError]);

  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    if (!active.value) return;
    if (flashWeather === 'storm' && flashMotion) elapsed.value += Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    else elapsed.value = 0;
    // Filament supports one directional source. Add the soft flash to the
    // existing sun/moon, preserving its direction and shadow ownership.
    const currentIntensity = intensity + (flashWeather === undefined ? 0
      : flashPeak * stormFlash(elapsed.value, flashWeather, flashMotion));
    if (!entity.value) {
      // Supply every native argument, including explicit undefined optionals.
      const created = lightManager.createLightEntity(
        type, colorKelvin, currentIntensity, direction, position, castShadows, falloffRadius, spotLightCone,
      );
      entity.value = created;
      scene.addEntity(created);
      lastIntensity.value = currentIntensity;
      lastTemperature.value = colorKelvin;
      return;
    }
    if (lastIntensity.value !== currentIntensity) {
      lightManager.setIntensity(entity.value, currentIntensity);
      lastIntensity.value = currentIntensity;
    }
    if (lastTemperature.value !== colorKelvin) {
      lightManager.setColor(entity.value, [red, green, blue]);
      lastTemperature.value = colorKelvin;
    }
  }, [active, entity, type, intensity, colorKelvin, direction, position, castShadows,
    falloffRadius, spotLightCone, lightManager, scene, lastIntensity, lastTemperature, elapsed,
    flashWeather, flashMotion, flashPeak, red, green, blue]);

  return null;
}
