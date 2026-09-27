import {
  Color, DirectionalLight, Mesh, MeshStandardMaterial,
  type HemisphereLight, type Object3D, type Scene,
} from 'three';
import type { LabState } from './contracts';
import type { WeatherKind } from './weather';
import { ORIGINAL_WEATHER_FOLIAGE_NAMES, WEATHER_GROUPS, stormFlash, weatherGroupPose } from './weatherAnimation';

interface StormScene {
  scene: Scene;
  weatherModel: Object3D;
  landscape: Object3D;
  exterior: Object3D;
  ambient: HemisphereLight;
  sun: DirectionalLight;
}

export interface StormEffects {
  apply: (settings: LabState) => void;
  update: (delta: number) => void;
  reset: () => void;
  dispose: () => void;
}

interface WetSurface {
  material: MeshStandardMaterial;
  color: Color;
  roughness: number;
}

const PAVEMENT_MATERIALS = new Set(['Site Access', 'Site Path', 'Site Paving', 'Site Road']);
const ROOF_MATERIALS = new Set(['Clay', 'ClayDark', 'ClayLight']);
const SKY_COLORS: Record<WeatherKind, string> = {
  clear: '#d9e6e5', light: '#aabcc4', heavy: '#718591', storm: '#43596b',
};
const NIGHT_SKY_COLORS: Record<WeatherKind, string> = {
  clear: '#101d2d', light: '#14212e', heavy: '#111d29', storm: '#101b28',
};
const WEATHER_STRENGTH: Record<WeatherKind, number> = { clear: 0, light: 0.4, heavy: 0.8, storm: 1 };

/** Capture only exposed roof and pavement materials; interiors and soil stay unchanged. */
function collectWetSurfaces(landscape: Object3D, exterior: Object3D): WetSurface[] {
  const materials = new Set<MeshStandardMaterial>();
  for (const root of [landscape, exterior]) {
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        const exposed = root === landscape
          ? PAVEMENT_MATERIALS.has(material.name)
          : node.name.startsWith('roof--') && ROOF_MATERIALS.has(material.name);
        if (exposed) materials.add(material);
      }
    });
  }
  return Array.from(materials, (material) => ({ material, color: material.color.clone(), roughness: material.roughness }));
}

/**
 * Own a fixed set of authored weather batches and one shadow-free sky flash.
 * Contact locations come from the asset's roof/pavement survey, never a flat rain plane.
 */
export function createStormEffects({ scene, weatherModel, landscape, exterior, ambient, sun }: StormScene): StormEffects {
  const groups = WEATHER_GROUPS.map((metadata) => {
    const node = weatherModel.getObjectByName(metadata.name);
    if (!node) throw new Error(`The weather model is missing ${metadata.name}.`);
    return { metadata, node };
  });
  const originalFoliage = ORIGINAL_WEATHER_FOLIAGE_NAMES.map((name) => {
    // GLTFLoader sanitizes node spaces; native Filament preserves the source names.
    const node = landscape.getObjectByName(name) ?? landscape.getObjectByName(name.replaceAll(' ', '_'));
    if (!node) throw new Error(`The landscape is missing ${name}.`);
    return { node, visible: node.visible };
  });
  for (const { node } of originalFoliage) node.visible = false;
  const wetSurfaces = collectWetSurfaces(landscape, exterior);
  const flash = new DirectionalLight('#c7def2', 0);
  flash.name = 'lab-weather-sky-flash';
  flash.position.set(-12, 32, -18);
  flash.target.position.set(10, 0, -7);
  flash.castShadow = false;
  scene.add(flash, flash.target);
  const sky = new Color();
  const currentSky = new Color();
  const flashColor = new Color('#9db5c8');
  let state: LabState | null = null;
  let elapsed = 0;
  let ambientIntensity = ambient.intensity;
  let disposed = false;
  let needsUpdate = true;

  /** Update existing transforms only; the pool never grows with elapsed time or rainfall. */
  function update(delta: number): void {
    if (disposed || !state) return;
    const animated = state.motion && (state.weather !== 'clear' || state.windSpeed > 0);
    if (!animated && !needsUpdate) return;
    needsUpdate = false;
    if (animated) elapsed += Math.min(0.08, Math.max(0, delta));
    for (const { metadata, node } of groups) {
      const pose = weatherGroupPose(metadata, elapsed, state.weather, state.windSpeed, state.windDirection, state.motion);
      node.position.fromArray(pose.position);
      node.scale.fromArray(pose.scale);
      node.rotation.set(...pose.rotation);
      node.visible = pose.scale.some((value) => value !== 0);
    }
    const brightness = stormFlash(elapsed, state.weather, state.motion);
    flash.intensity = brightness * 0.7;
    ambient.intensity = ambientIntensity + brightness * 0.12;
    currentSky.copy(sky).lerp(flashColor, brightness * 0.08);
  }

  return {
    /** Keep a static wet finish under reduced motion while removing moving precipitation. */
    apply(settings) {
      if (disposed) return;
      const changedMode = state?.weather !== settings.weather;
      state = settings;
      needsUpdate = true;
      if (changedMode) elapsed = 0;
      const strength = WEATHER_STRENGTH[state.weather];
      for (const surface of wetSurfaces) {
        surface.material.color.copy(surface.color).multiplyScalar(1 - strength * 0.18);
        surface.material.roughness = surface.roughness * (1 - strength) + Math.min(surface.roughness, 0.2) * strength;
      }
      sky.set((state.night ? NIGHT_SKY_COLORS : SKY_COLORS)[state.weather]);
      currentSky.copy(sky);
      scene.background = currentSky;
      ambientIntensity = (state.night ? 0.6 : 1.9) * (1 - strength * 0.45);
      sun.intensity = (state.night ? 0.32 : 3.1) * (1 - strength * 0.8);
      sun.color.set(state.night ? '#a5bdff' : state.weather === 'clear' ? '#fff2d9' : '#ccdeea');
      update(0);
    },
    update,
    /** Return the shared deterministic weather sequence to its initial phase. */
    reset() { elapsed = 0; needsUpdate = true; update(0); },
    /** Restore reused authored assets before their owner releases the GPU resources. */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const surface of wetSurfaces) {
        surface.material.color.copy(surface.color);
        surface.material.roughness = surface.roughness;
      }
      for (const { node, visible } of originalFoliage) node.visible = visible;
      scene.remove(flash, flash.target);
      flash.dispose();
    },
  };
}
