import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RenderCallbackContext, useFilamentContext, useModel, useWorkletEffect } from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import { WEATHER_GROUPS, weatherGroupPose } from '../../../packages/home-scene/src/renderer-lab/weatherAnimation';
import type { LabSettings } from './protocol';
import type { ModelKind } from './FilamentModel';
import { FilamentRain } from './FilamentRain';

interface Props {
  source: number;
  settings: LabSettings;
  onLoaded: (kind: ModelKind) => void;
}

/** Keep rooted foliage on shared geometry while a native-only shader owns the four water batches. */
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
  const [waterReady, setWaterReady] = useState(false);
  const onWaterReady = useCallback(() => setWaterReady(true), []);
  const elapsed = useSharedValue(0);
  const lastFrame = useSharedValue(-1);
  const lastSettings = useSharedValue('');
  const lastWeather = useSharedValue('');
  const { weather, windSpeed, windDirection, motion, resetKey } = settings;
  const mode = `${weather}:${resetKey}`;
  const signature = `${weather}:${windSpeed}:${windDirection}:${motion}:${resetKey}`;

  useWorkletEffect(() => {
    'worklet';
    batches.forEach(({ group, entity }) => {
      const foliage = group.kind === 'plant';
      renderableManager.setCastShadow(entity, foliage);
      renderableManager.setReceiveShadow(entity, foliage);
      // This asset remains resident for its foliage. Its original water and wet
      // overlay must stay hidden so the new GPU fields never render twice.
      if (!foliage) transformManager.setTransform(entity, identity.scaling([0, 0, 0]));
    });
  });
  useEffect(() => { if (asset && waterReady) onLoaded('rain'); }, [asset, waterReady, onLoaded]);

  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    if (!batches.length) return;
    if (lastWeather.value !== mode) {
      elapsed.value = 0;
      lastWeather.value = mode;
    }
    const animated = motion && (weather !== 'clear' || windSpeed > 0);
    if (animated) elapsed.value += Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    const changed = lastSettings.value !== signature;
    // Weather updates at at most 30 Hz, leaving camera gestures on every frame.
    if (!changed && (!animated || elapsed.value - lastFrame.value < 1 / 30)) return;
    lastSettings.value = signature;
    lastFrame.value = elapsed.value;
    batches.forEach(({ group, entity }) => {
      if (group.kind !== 'plant') return;
      const pose = weatherGroupPose(group, elapsed.value, weather, windSpeed, windDirection, motion);
      let matrix = identity.scaling(pose.scale);
      // SDK helpers pre-multiply; reverse the calls to match Three's XYZ Euler order.
      if (pose.rotation[2]) matrix = matrix.rotate(pose.rotation[2], [0, 0, 1]);
      if (pose.rotation[1]) matrix = matrix.rotate(pose.rotation[1], [0, 1, 0]);
      if (pose.rotation[0]) matrix = matrix.rotate(pose.rotation[0], [1, 0, 0]);
      transformManager.setTransform(entity, matrix.translate(pose.position));
    });
  }, [batches, identity, transformManager, elapsed, lastFrame, lastSettings, lastWeather, weather,
    windSpeed, windDirection, motion, signature, mode]);

  // useModel owns scene membership and destruction. Shadow flags and transforms
  // are managed above per batch, so a whole-asset ModelRenderer is unnecessary.
  return <FilamentRain settings={settings} onReady={onWaterReady} />;
}
