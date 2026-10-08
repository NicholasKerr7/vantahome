import { Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';

interface SurfaceFinish {
  roughness: number;
  reflection: number;
  grain: number;
}

const finishes: Readonly<Record<string, SurfaceFinish>> = {
  Chalk: { roughness: 0.76, reflection: 0.62, grain: 0.027 },
  Ivory: { roughness: 0.76, reflection: 0.62, grain: 0.027 },
  'Site Wall': { roughness: 0.76, reflection: 0.62, grain: 0.027 },
  Sand: { roughness: 0.58, reflection: 0.8, grain: 0.022 },
  Tile: { roughness: 0.48, reflection: 0.9, grain: 0.014 },
  Furniture_stone: { roughness: 0.42, reflection: 0.9, grain: 0.018 },
  'Site Paving': { roughness: 0.68, reflection: 0.72, grain: 0.032 },
  'Site Path': { roughness: 0.72, reflection: 0.7, grain: 0.027 },
  'Site Coping': { roughness: 0.57, reflection: 0.82, grain: 0.021 },
  'Site Curb': { roughness: 0.76, reflection: 0.64, grain: 0.032 },
  'Site Road': { roughness: 0.94, reflection: 0.42, grain: 0.046 },
  Teak: { roughness: 0.38, reflection: 0.85, grain: 0.025 },
  Furniture_teak: { roughness: 0.38, reflection: 0.85, grain: 0.025 },
  Furniture_oak: { roughness: 0.4, reflection: 0.85, grain: 0.025 },
  Clay: { roughness: 0.69, reflection: 0.58, grain: 0.031 },
  ClayDark: { roughness: 0.69, reflection: 0.58, grain: 0.031 },
  ClayLight: { roughness: 0.69, reflection: 0.58, grain: 0.031 },
  Bronze: { roughness: 0.25, reflection: 1.05, grain: 0.007 },
  'Site Gate metal': { roughness: 0.27, reflection: 1.05, grain: 0.007 },
  'Site Lawn': { roughness: 1, reflection: 0.5, grain: 0.036 },
  'Site Verge': { roughness: 1, reflection: 0.5, grain: 0.036 },
};

// Smooth hashed cells avoid repeating diagonal bands. Screen-space derivatives
// fade fine detail before it becomes a shimmer during a moving, distant shot.
const surfaceNoise = `
  varying vec3 cinematicSurfacePosition;
  float cinematicHash(vec2 cell) {
    vec3 p = fract(vec3(cell.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float cinematicGrain(vec3 worldPosition) {
    vec2 point = vec2(worldPosition.x + worldPosition.z * 0.37,
      worldPosition.y + worldPosition.z * 0.61) * 18.0;
    vec2 cell = floor(point);
    vec2 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    float lower = mix(cinematicHash(cell), cinematicHash(cell + vec2(1.0, 0.0)), blend.x);
    float upper = mix(cinematicHash(cell + vec2(0.0, 1.0)), cinematicHash(cell + vec2(1.0, 1.0)), blend.x);
    float footprint = max(fwidth(point.x), fwidth(point.y));
    return (mix(lower, upper, blend.y) * 2.0 - 1.0) * (1.0 - smoothstep(0.25, 1.2, footprint));
  }
`;

/** Add subtle metre-scaled finish variation without textures, geometry, or an extra render pass. */
function applySurfaceGrain(material: MeshStandardMaterial, source: MeshStandardMaterial, finish: SurfaceFinish): void {
  const previousCompile = source.onBeforeCompile;
  const previousKey = source.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.vertexShader = `varying vec3 cinematicSurfacePosition;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n cinematicSurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `${surfaceNoise}\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float surfaceGrain = cinematicGrain(cinematicSurfacePosition);
      diffuseColor.rgb *= 1.0 + surfaceGrain * ${(finish.grain * 0.45).toFixed(4)};
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + surfaceGrain * 0.012, 0.04, 1.0);
    `);
  };
  material.customProgramCacheKey = () => `${previousKey}:cinematic-surface-v2:${finish.grain}`;
}

/** Enhance selected physical finishes on an already-cloned model without touching cached assets or device state. */
export function prepareCinematicMaterials(root: Object3D): { dispose: () => void } {
  const owned = new Map<Material, MeshStandardMaterial>();
  const restore: (() => void)[] = [];

  /** Reuse one owned clone per source material, keeping the authored mesh batching intact. */
  function prepare(source: Material): Material {
    const finish = finishes[source.name];
    if (!(source instanceof MeshStandardMaterial) || !finish || source.transparent || source.emissiveIntensity > 0 && source.emissive.getHex() !== 0) return source;
    const existing = owned.get(source);
    if (existing) return existing;
    const material = source.clone();
    material.roughness = finish.roughness;
    material.envMapIntensity = finish.reflection;
    applySurfaceGrain(material, source, finish);
    owned.set(source, material);
    return material;
  }

  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const original = node.material;
    const material = Array.isArray(original) ? original.map(prepare) : prepare(original);
    if (material === original || Array.isArray(original) && Array.isArray(material)
      && material.every((entry, index) => entry === original[index])) return;
    node.material = material;
    restore.push(() => { if (node.material === material) node.material = original; });
  });

  /** Restore only our assignments, then release only the materials allocated for this tour. */
  function dispose(): void {
    restore.forEach((reset) => reset());
    owned.forEach((material) => material.dispose());
    restore.length = 0;
    owned.clear();
  }
  return { dispose };
}
