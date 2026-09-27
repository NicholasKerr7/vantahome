import { useEffect, useMemo } from 'react';
import { RenderCallbackContext, useFilamentContext, useModel, useWorkletEffect } from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import { WEATHER_GROUPS, weatherGroupPose } from '../../../packages/home-scene/src/renderer-lab/weatherAnimation';
import type { LabSettings } from './protocol';
import type { ModelKind } from './FilamentModel';
import { filamentLightGain } from './nativeLightingConfig';

interface Props {
  source: number;
  settings: LabSettings;
  onLoaded: (kind: ModelKind) => void;
}

/** Animate bounded, surface-aligned batches instead of submitting one native transform per drop. */
export function FilamentWeather({ source, settings, onLoaded }: Props) {
  // Clear weather still needs the rooted replacement foliage; wet surfaces also
  // remain visible when decorative motion is disabled.
  const model = useModel(source);
  const asset = model.state === 'loaded' ? model.asset : undefined;
  const { transformManager, renderableManager } = useFilamentContext();
  const batches = useMemo(() => {
    if (!asset) return [];
    return WEATHER_GROUPS.map((group) => {
      const entity = asset.getFirstEntityByName(group.name);
      if (!entity) throw new Error(`The weather model is missing ${group.name}.`);
      return { group, entity };
    });
  }, [asset]);
  const identity = useMemo(() => transformManager.createIdentityMatrix(), [transformManager]);
  const waterMaterials = useMemo(() => {
    // The exporter shares one material across every batch of the same effect.
    return (['rain', 'splash', 'runoff'] as const).flatMap((kind) => {
      const batch = batches.find(({ group }) => group.kind === kind);
      return batch ? [renderableManager.getMaterialInstanceAt(batch.entity, 0)] : [];
    });
  }, [batches, renderableManager]);
  const glow = filamentLightGain(settings.night);
  const elapsed = useSharedValue(0);
  const lastFrame = useSharedValue(-1);
  const lastSettings = useSharedValue('');
  const lastWeather = useSharedValue('');
  const { weather, windSpeed, windDirection, motion } = settings;
  const signature = `${weather}:${windSpeed}:${windDirection}:${motion}`;

  useWorkletEffect(() => {
    'worklet';
    batches.forEach(({ group, entity }) => {
      const foliage = group.kind === 'plant';
      renderableManager.setCastShadow(entity, foliage);
      renderableManager.setReceiveShadow(entity, foliage);
    });
  });
  useWorkletEffect(() => {
    'worklet';
    // A restrained cool fill keeps fine water visible under the SDK's fixed
    // camera exposure at night; pavement and plants still use real scene lights.
    waterMaterials.forEach((material) => material.setFloat3Parameter('emissiveFactor', [4 * glow, 5.5 * glow, 7 * glow]));
  });
  useEffect(() => { if (asset) onLoaded('rain'); }, [asset, onLoaded]);

  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    if (!batches.length) return;
    if (lastWeather.value !== weather) {
      elapsed.value = 0;
      lastWeather.value = weather;
    }
    const animated = motion && (weather !== 'clear' || windSpeed > 0);
    if (animated) elapsed.value += Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    const changed = lastSettings.value !== signature;
    // Weather updates at at most 30 Hz, leaving camera gestures on every frame.
    if (!changed && (!animated || elapsed.value - lastFrame.value < 1 / 30)) return;
    lastSettings.value = signature;
    lastFrame.value = elapsed.value;
    batches.forEach(({ group, entity }) => {
      if (!changed && group.kind === 'wet') return;
      const pose = weatherGroupPose(group, elapsed.value, weather, windSpeed, windDirection, motion);
      let matrix = identity.scaling(pose.scale);
      // SDK helpers pre-multiply; reverse the calls to match Three's XYZ Euler order.
      if (pose.rotation[2]) matrix = matrix.rotate(pose.rotation[2], [0, 0, 1]);
      if (pose.rotation[1]) matrix = matrix.rotate(pose.rotation[1], [0, 1, 0]);
      if (pose.rotation[0]) matrix = matrix.rotate(pose.rotation[0], [1, 0, 0]);
      transformManager.setTransform(entity, matrix.translate(pose.position));
    });
  }, [batches, identity, transformManager, elapsed, lastFrame, lastSettings, lastWeather, weather,
    windSpeed, windDirection, motion, signature]);

  // useModel owns scene membership and destruction. Shadow flags and transforms
  // are managed above per batch, so a whole-asset ModelRenderer is unnecessary.
  return null;
}
