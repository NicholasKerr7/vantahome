import { useEffect, useLayoutEffect, useState } from 'react';
import { PixelRatio } from 'react-native';
import {
  RenderCallbackContext, useBuffer, useFilamentContext, useModel,
  type Entity, type Material, type MaterialInstance,
} from 'react-native-filament';
import { useSharedValue } from 'react-native-worklets-core';
import type { LabSettings } from './protocol';

const WATER_MODEL = require('../../../assets/renderer-lab/filament-rain.glb');
const WATER_MATERIAL = require('../../../assets/renderer-lab/filament-water.filamat');
const WET_MATERIAL = require('../../../assets/renderer-lab/filament-wet.filamat');
const WATER_NAMES = ['rain', 'splash', 'runoff', 'wet'] as const;

interface Props {
  settings: LabSettings;
  onReady: () => void;
}

interface WaterBinding {
  entity: Entity;
  original: MaterialInstance;
  instance: MaterialInstance;
  kind: number;
}

interface WaterResources {
  owners: Material[];
  bindings: WaterBinding[];
}

/** Render four surveyed GPU water batches, with explicit ownership of their custom materials. */
export function FilamentRain({ settings, onReady }: Props) {
  const model = useModel(WATER_MODEL);
  const asset = model.state === 'loaded' ? model.asset : undefined;
  const waterBuffer = useBuffer({ source: WATER_MATERIAL });
  const wetBuffer = useBuffer({ source: WET_MATERIAL });
  const { engine, scene, view, renderableManager, workletContext } = useFilamentContext();
  const pixelRatio = PixelRatio.get();
  const resources = useSharedValue<WaterResources | undefined>(undefined);
  const active = useSharedValue(false);
  const elapsed = useSharedValue(0);
  const previousMode = useSharedValue('');
  const previousSettings = useSharedValue('');
  const previousHeight = useSharedValue(0);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const { weather, windSpeed, windDirection, night, motion, resetKey } = settings;
  const mode = `${weather}:${resetKey}`;
  const signature = `${weather}:${windSpeed}:${windDirection}:${night}:${motion}`;

  useLayoutEffect(() => {
    if (!asset || !waterBuffer || !wetBuffer) return;
    let mounted = true;
    active.value = true;
    setReady(false);
    void workletContext.runAsync(() => {
      'worklet';
      if (!active.value || !asset.isValid) return false;
      // Validate the complete asset before allocating or replacing any material.
      const sources = WATER_NAMES.map((name, kind) => {
        const entity = asset.getFirstEntityByName(`lab-filament-${name}`);
        if (!entity || renderableManager.getPrimitiveCount(entity) !== 1) {
          throw new Error(`The native water model has an invalid ${name} batch.`);
        }
        return { entity, kind, original: renderableManager.getMaterialInstanceAt(entity, 0) };
      });
      const owners: Material[] = [];
      const bindings: WaterBinding[] = [];
      try {
        const waterOwner = engine.createMaterial(waterBuffer);
        owners.push(waterOwner);
        const wetOwner = engine.createMaterial(wetBuffer);
        owners.push(wetOwner);
        for (const source of sources) {
          // The water owner tracks and destroys its three instances. The wet
          // default instance belongs to its owner and must never be released alone.
          const instance = source.kind === 3 ? wetOwner.getDefaultInstance() : waterOwner.createInstance();
          instance.setFloatParameter('time', 0);
          instance.setFloatParameter('intensity', 0);
          instance.setFloatParameter('night', 0);
          instance.setFloatParameter('motion', 0);
          if (source.kind !== 3) {
            instance.setFloatParameter('kind', source.kind);
            instance.setFloatParameter('viewportHeight', 720);
            instance.setFloat3Parameter('wind', [0, 0, 0]);
          }
          renderableManager.setCastShadow(source.entity, false);
          renderableManager.setReceiveShadow(source.entity, false);
          renderableManager.setMaterialInstanceAt(source.entity, 0, instance);
          bindings.push({ ...source, instance });
        }
        previousMode.value = '';
        previousSettings.value = '';
        previousHeight.value = 0;
        // Scene membership is idempotent. Reassert this subset after a StrictMode
        // cleanup or material reload has removed it; useModel still owns the asset.
        scene.addEntities(bindings.map(({ entity }) => entity));
        resources.value = { owners, bindings };
        return true;
      } catch (error) {
        // Roll back partial setup before releasing any owner still referenced by a renderable.
        for (const binding of bindings) renderableManager.setMaterialInstanceAt(binding.entity, 0, binding.original);
        for (const owner of owners) owner.release();
        throw error;
      }
    }).then((initialized) => {
      if (mounted && initialized) setReady(true);
    }, (error: unknown) => {
      if (mounted) setFailure(error instanceof Error ? error : new Error('The native rain material could not load.'));
    });
    return () => {
      mounted = false;
      active.value = false;
      // Layout cleanup queues ahead of useModel/useBuffer's deferred passive
      // release. An already-released asset has queued its own renderer destruction.
      void workletContext.runAsync(() => {
        'worklet';
        const owned = resources.value;
        resources.value = undefined;
        if (!owned) return;
        if (asset.isValid) {
          scene.removeEntities(owned.bindings.map(({ entity }) => entity));
          for (const binding of owned.bindings) renderableManager.setMaterialInstanceAt(binding.entity, 0, binding.original);
        }
        for (const owner of owned.owners) owner.release();
      }).then(undefined, (error: unknown) => {
        // This component has already unmounted; retain diagnostics rather than
        // attempting a state update after the recovery screen or scene has closed.
        console.error('The native rain resources could not be released.', error);
      });
    };
  }, [asset, waterBuffer, wetBuffer, engine, scene, renderableManager, workletContext, active, resources,
    previousMode, previousSettings, previousHeight]);

  useEffect(() => { if (ready) onReady(); }, [ready, onReady]);

  RenderCallbackContext.useRenderCallback(({ timeSinceLastFrame }) => {
    'worklet';
    const owned = resources.value;
    if (!active.value || !owned) return;
    const reset = previousMode.value !== mode;
    if (reset) { elapsed.value = 0; previousMode.value = mode; }
    const intensity = weather === 'storm' ? 3 : weather === 'heavy' ? 2 : weather === 'light' ? 1 : 0;
    const animated = motion && intensity > 0;
    if (animated && !reset) elapsed.value += Math.min(Math.max(timeSinceLastFrame, 0), 0.08);
    const changed = previousSettings.value !== signature;
    // Native viewport dimensions are physical pixels; Three's matching minimum
    // streak footprint is specified against CSS/logical viewport height.
    const viewportHeight = Math.max(1, view.getViewport().height / pixelRatio);
    const resized = previousHeight.value !== viewportHeight;
    if (!animated && !changed && !reset && !resized) return;
    const angle = windDirection * Math.PI / 180;
    const wind = Math.min(55, Math.max(0, windSpeed)) / 650;
    for (const { instance, kind } of owned.bindings) {
      if (animated || reset) instance.setFloatParameter('time', elapsed.value);
      if (changed) {
        instance.setFloatParameter('intensity', intensity);
        instance.setFloatParameter('night', night ? 1 : 0);
        instance.setFloatParameter('motion', motion ? 1 : 0);
        if (kind !== 3) instance.setFloat3Parameter('wind', [Math.sin(angle) * wind, 0, -Math.cos(angle) * wind]);
      }
      if (resized && kind !== 3) instance.setFloatParameter('viewportHeight', viewportHeight);
    }
    previousSettings.value = signature;
    previousHeight.value = viewportHeight;
  }, [active, resources, elapsed, previousMode, previousSettings, previousHeight, mode, signature,
    weather, windSpeed, windDirection, night, motion, view, pixelRatio]);

  if (failure) throw failure;
  return null;
}
