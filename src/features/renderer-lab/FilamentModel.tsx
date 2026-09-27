import React, { useEffect, useMemo } from 'react';
import {
  ModelRenderer, RenderCallbackContext, useFilamentContext, useModel, useWorkletEffect,
} from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import type { LabSettings } from './protocol';

export type ModelKind = 'house' | 'landscape' | 'gate' | 'fixtures' | 'rain';
interface Props {
  source: number;
  kind: ModelKind;
  settings: LabSettings;
  onLoaded: (kind: ModelKind) => void;
}

const LIGHT_NODES = ['lab-light-master-light', 'lab-light-master-bedside-left', 'lab-light-master-bedside-right'];

/** Render the original GLB and animate named parts entirely on Filament's render thread. */
export function FilamentModel({ source, kind, settings, onLoaded }: Props) {
  const model = useModel(source, { addToScene: kind !== 'rain' || settings.rain });
  const { transformManager, renderableManager } = useFilamentContext();
  const asset = model.state === 'loaded' ? model.asset : undefined;
  const root = model.state === 'loaded' ? model.rootEntity : undefined;
  const animated = useMemo(() => {
    if (!asset || !root) return undefined;
    const entity = kind === 'fixtures' ? asset.getFirstEntityByName('lab-blind-fabric') : root;
    return entity ? { entity, rest: transformManager.getTransform(entity) } : undefined;
  }, [asset, kind, root, transformManager]);
  const oldSite = useMemo(() => kind === 'house' && settings.view === 'property'
    ? asset?.getFirstEntityByName('floor-site') : undefined, [asset, kind, settings.view]);
  const oldSiteRest = useMemo(() => oldSite ? transformManager.getTransform(oldSite) : undefined, [oldSite, transformManager]);
  const position = useSharedValue(kind === 'gate' ? settings.gate : settings.blinds);
  const elapsed = useSharedValue(0);
  const target = kind === 'gate' ? settings.gate : settings.blinds;
  const motion = settings.motion;
  const rain = settings.rain;

  const lights = useMemo(() => {
    if (kind !== 'fixtures' || !asset) return [];
    return LIGHT_NODES.map((name) => {
      const entity = asset.getFirstEntityByName(name);
      if (!entity) throw new Error(`The fixture model is missing ${name}.`);
      return renderableManager.getMaterialInstanceAt(entity, 0);
    });
  }, [asset, kind, renderableManager]);
  const lightsOn = settings.lights;
  useWorkletEffect(() => {
    'worklet';
    // glTF emissiveFactor is float3; EntitySelector incorrectly writes float4 in SDK 1.11.
    lights.forEach((material) => {
      material.setFloat3Parameter('emissiveFactor', lightsOn ? [1, 0.76, 0.42] : [0, 0, 0]);
    });
  });

  useEffect(() => { if (asset) onLoaded(kind); }, [asset, kind, onLoaded]);
  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    if (oldSite && oldSiteRest) transformManager.setTransform(oldSite, oldSiteRest.scaling([0.000001, 0.000001, 0.000001]));
    if (!animated) return;
    const dt = Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    position.value = motion ? position.value + (target - position.value) * (1 - Math.exp(-4 * dt)) : target;
    const progress = position.value / 100;
    if (kind === 'gate') {
      transformManager.setTransform(animated.entity, animated.rest.translate([-9.79 + 6.8 * progress, 0.575, -22.37]));
    } else if (kind === 'fixtures') {
      // Filament's matrix helpers pre-multiply: remove and restore the top anchor before scaling.
      transformManager.setTransform(animated.entity, animated.rest
        .translate([-8.139, -2.1, 16.49])
        .scaling([1, 1 - 0.82 * progress, 1])
        .translate([8.139, 2.1 + 0.28 * progress, -16.49]));
    } else if (kind === 'rain' && rain) {
      if (motion) elapsed.value += dt;
      transformManager.setTransform(animated.entity, animated.rest.translate([0, -(elapsed.value * 6 % 12), 0]));
    }
  }, [animated, oldSite, oldSiteRest, transformManager, kind, position, elapsed, target, motion, rain]);

  return <ModelRenderer model={model} castShadow={kind !== 'rain'} receiveShadow={kind !== 'rain'} />;
}
