import { DoubleSide, Group, Mesh, ShaderMaterial, Vector2, type Object3D } from 'three';
import type { LabState } from './contracts';
import { createRainGeometry } from './threeRainGeometry';
import { WATER_FRAGMENT, WATER_VERTEX, WET_FRAGMENT, WET_VERTEX } from './threeRainShaders';

export interface ThreeRainEffects {
  apply: (state: LabState) => void;
  update: (elapsed: number) => void;
  resize: (viewportHeight: number) => void;
  dispose: () => void;
}

/** Replace only Three.js water rendering; surveyed assets and native weather stay reusable. */
export function createThreeRain(weatherModel: Object3D): ThreeRainEffects {
  const wet = weatherModel.getObjectByName('lab-weather-wet');
  if (!(wet instanceof Mesh)) throw new Error('The weather model is missing its pavement surface.');
  const originalWetMaterial = wet.material;
  const sourceWater = weatherModel.children
    .filter(({ name }) => /^lab-weather-(rain|splash|runoff)-/.test(name))
    .map((node) => ({ node, visible: node.visible }));
  const uniforms = {
    uTime: { value: 0 }, uIntensity: { value: 0 }, uNight: { value: 0 },
    uMotion: { value: 1 }, uWind: { value: new Vector2() }, uViewportHeight: { value: 720 },
  };
  const field = new Group();
  field.name = 'lab-three-rain-field';
  field.visible = false;
  const particles = (['rain', 'splash', 'runoff'] as const).map((kind) => {
    const material = new ShaderMaterial({
      name: `three-weather-${kind}`, uniforms, defines: { [kind.toUpperCase()]: 1 },
      vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT,
      transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    });
    const mesh = new Mesh(createRainGeometry(kind), material);
    mesh.name = `lab-three-${kind}`;
    // The GPU displaces particles from their surveyed anchors. Never cull from the base quad.
    mesh.frustumCulled = false;
    field.add(mesh);
    return mesh;
  });
  const wetMaterial = new ShaderMaterial({
    name: 'three-weather-ripples', uniforms, vertexShader: WET_VERTEX, fragmentShader: WET_FRAGMENT,
    transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  for (const { node } of sourceWater) node.visible = false;
  wet.material = wetMaterial;
  weatherModel.add(field);
  let disposed = false;
  return {
    /** Change uniforms and visibility without allocating particle objects or changing anchors. */
    apply(state) {
      if (disposed) return;
      uniforms.uIntensity.value = state.weather === 'storm' ? 3 : state.weather === 'heavy' ? 2 : state.weather === 'light' ? 1 : 0;
      uniforms.uNight.value = state.night ? 1 : 0;
      uniforms.uMotion.value = state.motion ? 1 : 0;
      const angle = state.windDirection * Math.PI / 180;
      const wind = Math.min(55, Math.max(0, state.windSpeed)) / 650;
      uniforms.uWind.value.set(Math.sin(angle) * wind, -Math.cos(angle) * wind);
      field.visible = state.motion && state.weather !== 'clear';
    },
    /** One shared clock drives independent deterministic particle ages on the GPU. */
    update(elapsed) {
      if (!disposed && uniforms.uMotion.value && Number.isFinite(elapsed)) uniforms.uTime.value = Math.max(0, elapsed);
    },
    /** Keep distant streaks legible after rotation without increasing particle count. */
    resize(viewportHeight) {
      if (!disposed && Number.isFinite(viewportHeight)) uniforms.uViewportHeight.value = Math.max(1, viewportHeight);
    },
    /** Restore borrowed scene resources and release every generated GPU allocation exactly once. */
    dispose() {
      if (disposed) return;
      disposed = true;
      weatherModel.remove(field);
      wet.material = originalWetMaterial;
      for (const { node, visible } of sourceWater) node.visible = visible;
      for (const mesh of particles) { mesh.geometry.dispose(); mesh.material.dispose(); }
      wetMaterial.dispose();
    },
  };
}
