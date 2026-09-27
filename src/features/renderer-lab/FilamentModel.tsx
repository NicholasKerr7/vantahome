import React, { useEffect, useMemo } from 'react';
import {
  ModelRenderer, RenderCallbackContext, useFilamentContext, useModel, useWorkletEffect,
} from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import type { LabSettings } from './protocol';
import { BEDROOM_LIGHTS, SOLAR_LIGHTS, filamentEmission } from './nativeLightingConfig';

export type ModelKind = 'house' | 'landscape' | 'gate' | 'fixtures' | 'rain' | 'solar';
interface Props {
  source: number;
  kind: ModelKind;
  settings: LabSettings;
  onLoaded: (kind: ModelKind) => void;
}

const BEDROOM_LIGHT_NODES = BEDROOM_LIGHTS.map(({ id }) => `lab-light-${id}`);
const SOLAR_LIGHT_NODES = SOLAR_LIGHTS.map(({ id }) => `lab-light-${id}`);

/** Render the original GLB and animate named parts entirely on Filament's render thread. */
export function FilamentModel({ source, kind, settings, onLoaded }: Props) {
  const model = useModel(source, { addToScene: kind !== 'rain' || settings.rain });
  const { transformManager, renderableManager } = useFilamentContext();
  const asset = model.state === 'loaded' ? model.asset : undefined;
  const root = model.state === 'loaded' ? model.rootEntity : undefined;
  const animated = useMemo(() => {
    if (!asset || !root || !['fixtures', 'gate', 'rain'].includes(kind)) return undefined;
    const entity = kind === 'fixtures' ? asset.getFirstEntityByName('lab-blind-fabric') : root;
    return entity ? { entity, rest: transformManager.getTransform(entity) } : undefined;
  }, [asset, kind, root, transformManager]);
  const position = useSharedValue(kind === 'gate' ? settings.gate : settings.blinds);
  const appliedPosition = useSharedValue(Number.NaN);
  const elapsed = useSharedValue(0);
  const target = kind === 'gate' ? settings.gate : settings.blinds;
  const motion = settings.motion;
  const rain = settings.rain;

  const lights = useMemo(() => {
    if (!asset || (kind !== 'fixtures' && kind !== 'solar')) return [];
    const names = kind === 'fixtures' ? BEDROOM_LIGHT_NODES : SOLAR_LIGHT_NODES;
    return names.map((name) => {
      const entity = asset.getFirstEntityByName(name);
      if (!entity) throw new Error(`The fixture model is missing ${name}.`);
      return renderableManager.getMaterialInstanceAt(entity, 0);
    });
  }, [asset, kind, renderableManager]);
  const emission = filamentEmission(kind === 'solar' ? settings.night : settings.lights, settings.night);
  useWorkletEffect(() => {
    'worklet';
    // glTF emissiveFactor is float3; EntitySelector incorrectly writes float4 in SDK 1.11.
    lights.forEach((material) => {
      material.setFloat3Parameter('emissiveFactor', emission);
    });
  });

  useEffect(() => { if (asset) onLoaded(kind); }, [asset, kind, onLoaded]);
  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    if (!animated) return;
    const dt = Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    if (kind === 'rain') {
      if (!rain) return;
      if (motion) elapsed.value += dt;
      if (appliedPosition.value === elapsed.value) return;
      appliedPosition.value = elapsed.value;
      transformManager.setTransform(animated.entity, animated.rest.translate([0, -(elapsed.value * 6 % 12), 0]));
      return;
    }
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
  }, [animated, transformManager, kind, position, appliedPosition, elapsed, target, motion, rain]);

  const solid = kind !== 'rain' && kind !== 'solar';
  return <ModelRenderer model={model} castShadow={solid} receiveShadow={solid} />;
}
