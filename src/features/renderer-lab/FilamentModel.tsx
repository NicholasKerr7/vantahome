import React, { useEffect, useMemo } from 'react';
import {
  ModelRenderer, RenderCallbackContext, useFilamentContext, useModel, useWorkletEffect,
} from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import type { LabSettings } from './protocol';
import { BEDROOM_LIGHTS, SOLAR_LIGHTS, filamentEmission } from './nativeLightingConfig';
import { useFilamentWetSurfaces } from './useFilamentWetSurfaces';
import { ORIGINAL_WEATHER_FOLIAGE_NAMES } from '../../../packages/home-scene/src/renderer-lab/weatherAnimation';
import { bedroomLightAppearance } from '../../../packages/home-scene/src/renderer-lab/bedroomLighting';

export type ModelKind = 'house' | 'landscape' | 'gate' | 'fixtures' | 'rain' | 'solar';
interface Props {
  source: number;
  kind: Exclude<ModelKind, 'rain'>;
  settings: LabSettings;
  onLoaded: (kind: ModelKind) => void;
}

const BEDROOM_LIGHT_NODES = BEDROOM_LIGHTS.map(({ id }) => `lab-light-${id}`);
const SOLAR_LIGHT_NODES = SOLAR_LIGHTS.map(({ id }) => `lab-light-${id}`);

/** Render the original GLB and animate named parts entirely on Filament's render thread. */
export function FilamentModel({ source, kind, settings, onLoaded }: Props) {
  const model = useModel(source);
  const { transformManager, renderableManager, scene } = useFilamentContext();
  const asset = model.state === 'loaded' ? model.asset : undefined;
  const root = model.state === 'loaded' ? model.rootEntity : undefined;
  useFilamentWetSurfaces(settings.view === 'property' ? asset : undefined, kind, settings.weather);
  const originalFoliage = useMemo(() => {
    if (!asset || kind !== 'landscape') return [];
    return ORIGINAL_WEATHER_FOLIAGE_NAMES.flatMap((name) => {
      const entity = asset.getFirstEntityByName(name);
      return entity ? [entity] : [];
    });
  }, [asset, kind]);
  useWorkletEffect(() => {
    'worklet';
    // Identical leaf triangles live in rooted animation groups in the weather asset.
    // The landscape's trunks, palms, bark, and every non-foliage primitive stay put.
    if (originalFoliage.length) scene.removeEntities(originalFoliage);
  });
  const animated = useMemo(() => {
    if (!asset || !root || !['fixtures', 'gate'].includes(kind)) return undefined;
    const entity = kind === 'fixtures' ? asset.getFirstEntityByName('lab-blind-fabric') : root;
    return entity ? { entity, rest: transformManager.getTransform(entity) } : undefined;
  }, [asset, kind, root, transformManager]);
  const position = useSharedValue(kind === 'gate' ? settings.gate : settings.blinds);
  const appliedPosition = useSharedValue(Number.NaN);
  const target = kind === 'gate' ? settings.gate : settings.blinds;
  const motion = settings.motion;

  const lights = useMemo(() => {
    if (!asset || (kind !== 'fixtures' && kind !== 'solar')) return [];
    const names = kind === 'fixtures' ? BEDROOM_LIGHT_NODES : SOLAR_LIGHT_NODES;
    return names.map((name) => {
      const entity = asset.getFirstEntityByName(name);
      if (!entity) throw new Error(`The fixture model is missing ${name}.`);
      return renderableManager.getMaterialInstanceAt(entity, 0);
    });
  }, [asset, kind, renderableManager]);
  const emissions = lights.map((_, index) => {
    if (kind === 'solar') return filamentEmission(settings.night, settings.night);
    const appearance = bedroomLightAppearance(BEDROOM_LIGHTS[index].id, settings.lights, settings.lightStates);
    return filamentEmission(appearance.gain > 0, settings.night,
      appearance.customized ? appearance.linearColor : undefined, appearance.gain);
  });
  useWorkletEffect(() => {
    'worklet';
    // glTF emissiveFactor is float3; EntitySelector incorrectly writes float4 in SDK 1.11.
    lights.forEach((material, index) => {
      material.setFloat3Parameter('emissiveFactor', emissions[index]);
    });
  });

  useEffect(() => { if (asset) onLoaded(kind); }, [asset, kind, onLoaded]);
  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    if (!animated) return;
    const dt = Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    const next = motion ? position.value + (target - position.value) * (1 - Math.exp(-4 * dt)) : target;
    position.value = Math.abs(next - target) < 0.01 ? target : next;
    // Snap a settled device exactly to its target and stop allocating matrices.
    if (appliedPosition.value === position.value) return;
    appliedPosition.value = position.value;
    const progress = position.value / 100;
    if (kind === 'gate') {
      transformManager.setTransform(animated.entity, animated.rest.translate([-9.79 + 6.8 * progress, 0.575, -22.37]));
    } else if (kind === 'fixtures') {
      // Filament's matrix helpers pre-multiply: remove and restore the top anchor before scaling.
      transformManager.setTransform(animated.entity, animated.rest
        .translate([-8.139, -2.1, 16.49])
        .scaling([1, 1 - 0.82 * progress, 1])
        .translate([8.139, 2.1 + 0.28 * progress, -16.49]));
    }
  }, [animated, transformManager, kind, position, appliedPosition, target, motion]);

  const solid = kind !== 'solar';
  return <ModelRenderer model={model} castShadow={solid} receiveShadow={solid} />;
}
