import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  EnvironmentalLight, FilamentScene, FilamentView, Skybox, useFilamentContext,
  type RenderCallback, type Float3,
} from 'react-native-filament';
import presets from '../../../packages/home-scene/src/renderer-lab/presets.json';
import { FilamentModel, type ModelKind } from './FilamentModel';
import { FilamentLight } from './FilamentLight';
import { useLabCamera } from './useLabCamera';
import { useLabMetrics } from './useLabMetrics';
import type { LabSurfaceProps, LabDevice } from './protocol';

const ASSETS = {
  upper: require('../../../packages/home-scene/public/models/upper.glb'),
  exterior: require('../../../packages/home-scene/public/models/exterior.glb'),
  landscape: require('../../../packages/home-scene/public/models/landscape.glb'),
  gate: require('../../../packages/home-scene/public/models/gate.glb'),
  fixtures: require('../../../assets/renderer-lab/fixtures.glb'),
  rain: require('../../../assets/renderer-lab/rain.glb'),
};
const ENVIRONMENT = { uri: 'RNF_default_env_ibl.ktx' };
const NO_EXTRA_EFFECTS = { enabled: false };
const LIGHT_PICK_POINTS: Float3[] = [[9.9665, 2.5032, -14.145], [8.655, 0.95, -15.9], [11.345, 0.95, -15.9]];

/** Keep native resource ownership scoped to this one, explicitly selected comparison. */
function FilamentSurface(props: LabSurfaceProps) {
  return <FilamentScene ambientOcclusionOptions={NO_EXTRA_EFFECTS} bloomOptions={NO_EXTRA_EFFECTS}
    temporalAntiAliasingOptions={NO_EXTRA_EFFECTS} screenSpaceRefraction={false} antiAliasing="FXAA">
    <NativeScene {...props} />
  </FilamentScene>;
}

// Diagnostics update every two seconds; unchanged settings must not rerender the native model tree.
export default React.memo(FilamentSurface);

/** Compose matching bedroom/property assets, touch picking, and bounded cadence samples. */
function NativeScene({ settings, onEvent }: LabSurfaceProps) {
  const { view, nameComponentManager } = useFilamentContext();
  const mounted = useRef(true);
  const loaded = useRef(new Set<ModelKind>());
  const [ready, setReady] = useState(false);
  const property = settings.view === 'property';
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const onLoaded = useCallback((kind: ModelKind) => {
    loaded.current.add(kind);
    if (loaded.current.size === (property ? 4 : 2)) setReady(true);
  }, [property]);
  useEffect(() => { if (ready) onEvent({ type: 'ready' }); }, [ready, onEvent]);

  const onLightError = useCallback(() => {
    if (mounted.current) onEvent({ type: 'error', message: 'The native scene could not release its lights. Reopen the comparison.' });
  }, [onEvent]);

  const pick = useCallback((x: number, y: number) => {
    void view.pickEntity(x, y).then((entity) => {
      if (!entity || !mounted.current) return;
      const name = nameComponentManager.getEntityName(entity) ?? '';
      let device: LabDevice | null = name.startsWith('lab-blind') ? 'blinds'
        : name.startsWith('lab-light') ? 'lights' : name.startsWith('gate-') ? 'gate' : null;
      // Fixture shells are merged into the house mesh. Include their visible bodies in the tap target.
      if (!device && !property && LIGHT_PICK_POINTS.some((point) => {
        const projected = view.projectWorldToScreen(point);
        return Math.hypot(projected[0] - x, projected[1] - y) <= 24;
      })) device = 'lights';
      if (device) onEvent({ type: 'select', device });
    }).catch(() => {
      if (mounted.current) onEvent({ type: 'error', message: 'The native scene could not handle this interaction. Try again.' });
    });
  }, [view, nameComponentManager, onEvent, property]);
  const { updateCamera, ...touchHandlers } = useLabCamera({
    preset: presets[settings.view], resetKey: settings.resetKey, onPick: pick,
    minDistance: presets[settings.view].minDistance, maxDistance: presets[settings.view].maxDistance,
  });
  const collectInterval = useLabMetrics({ settings, onEvent, ready });
  const animate: RenderCallback = useCallback(({ timeSinceLastFrame }) => {
    'worklet';
    updateCamera();
    collectInterval(timeSinceLastFrame);
  }, [updateCamera, collectInterval]);

  return <FilamentView style={styles.surface} {...touchHandlers} renderCallback={animate}
    enableTransparentRendering={false}>
    <Skybox colorInHex={settings.night ? '#101b22' : '#dce4df'} />
    <EnvironmentalLight key={settings.night ? 'night' : 'day'} source={ENVIRONMENT} intensity={settings.night ? 1800 : 25000} />
    <FilamentLight type="directional" intensity={settings.night ? 1200 : 18000} colorKelvin={settings.night ? 9000 : 6000}
      onError={onLightError}
      direction={[0.594, -0.762, 0.262]} castShadows />
    <FilamentModel source={property ? ASSETS.exterior : ASSETS.upper} kind="house" settings={settings} onLoaded={onLoaded} />
    {property ? <>
      <FilamentModel source={ASSETS.landscape} kind="landscape" settings={settings} onLoaded={onLoaded} />
      <FilamentModel source={ASSETS.gate} kind="gate" settings={settings} onLoaded={onLoaded} />
      <FilamentModel source={ASSETS.rain} kind="rain" settings={settings} onLoaded={onLoaded} />
    </> : <>
      <FilamentModel source={ASSETS.fixtures} kind="fixtures" settings={settings} onLoaded={onLoaded} />
      <FilamentLight type="point" colorKelvin={2800} intensity={settings.lights ? 2200 : 0} onError={onLightError} position={[9.9665, 2.4232, -14.145]} falloffRadius={5.5} />
      <FilamentLight type="point" colorKelvin={2700} intensity={settings.lights ? 500 : 0} onError={onLightError} position={[8.655, 0.91, -15.9]} falloffRadius={2.5} />
      <FilamentLight type="point" colorKelvin={2700} intensity={settings.lights ? 500 : 0} onError={onLightError} position={[11.345, 0.91, -15.9]} falloffRadius={2.5} />
    </>}
  </FilamentView>;
}

const styles = StyleSheet.create({ surface: { flex: 1, backgroundColor: '#101b22' } });
