import { Mesh, MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking, Vector2, type Material, type Object3D } from 'three';
import siteLayout from '../site-layout.json';
import { weatherMagnitude, windTravelDirection } from './weatherGeometry';

interface WindUniforms {
  [name: string]: { value: number | Vector2 };
  landscapeTime: { value: number };
  landscapeWind: { value: number };
  landscapeDirection: { value: Vector2 };
}

export interface VegetationWind {
  update: (delta: number, windSpeedKmh: number, windDirectionDeg: number, animate: boolean) => void;
  dispose: () => void;
}

const plantMaterialNames = new Set(['Site Leaf dark', 'Site Leaf light', 'Site Leaf middle', 'Site Trunk', 'Site Bark']);
const crownLookup = siteLayout.planting.palms.map(([x, north, height], index) => `
  float distance${index} = distance(point.xz, vec2(${x!.toFixed(4)}, ${(-north!).toFixed(4)}));
  if (distance${index} < nearest) { nearest = distance${index}; crown = vec3(${x!.toFixed(4)}, ${(siteLayout.parcel.lawnElevation + height! * 0.72).toFixed(4)}, ${(-north!).toFixed(4)}); }
`).join('');
const windShader = `
  uniform float landscapeTime; uniform float landscapeWind; uniform vec2 landscapeDirection;
  vec3 landscapeBend(vec3 point) {
    float nearest = 1000.; vec3 crown = vec3(0.);
    ${crownLookup}
    float rootHeight = max(0., point.y - ${siteLayout.parcel.lawnElevation.toFixed(3)});
    float palm = step(1.0, point.y) * (1.0 - step(2.0, nearest));
    float phase = palm > .5 ? crown.x * .63 + crown.z * .41 : floor(point.x*1.8)*.57 + floor(point.z*1.8)*.43;
    float crownHeight = max(.5, crown.y - ${siteLayout.parcel.lawnElevation.toFixed(3)});
    float bend = palm > .5 ? pow(clamp(rootHeight/crownHeight,0.,1.),2.) * .085 : pow(clamp(rootHeight/.65,0.,1.),2.) * .025;
    float gust = sin(landscapeTime*.95 + phase) + sin(landscapeTime*.41 + phase*1.7)*.35;
    point.xz += landscapeDirection * landscapeWind * bend * gust;
    // Fronds flutter away from their supported crown; no movement is added at the trunk root.
    float leafTip = palm * smoothstep(.12,1.25,nearest);
    point.y += sin(landscapeTime*2.2 + phase + nearest*3.4) * landscapeWind * leafTip * .027;
    return point;
  }
`;

/** Add identical deformation to visible and shadow shaders without altering cached GLTF materials. */
function applyWindShader(material: Material, uniforms: WindUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = windShader + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = landscapeBend(transformed);');
  };
  material.customProgramCacheKey = () => 'vantahome-rooted-vegetation-wind-v1';
}

/** Animate only the named botanical batches; all foundations, pots and architecture remain untouched. */
export function prepareVegetationWind(root: Object3D): VegetationWind {
  const uniforms: WindUniforms = {
    landscapeTime: { value: 0 }, landscapeWind: { value: 0 }, landscapeDirection: { value: new Vector2(0, 1) },
  };
  const ownedMaterials: Material[] = [];
  const restoreMeshes: (() => void)[] = [];
  root.traverse((node) => {
    if (!(node instanceof Mesh) || Array.isArray(node.material) || !plantMaterialNames.has(node.material.name)) return;
    const originalMaterial = node.material;
    const originalDepth = node.customDepthMaterial;
    const originalDistance = node.customDistanceMaterial;
    const originalCulling = node.frustumCulled;
    const material = originalMaterial.clone();
    applyWindShader(material, uniforms);
    node.material = material;
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    const distance = new MeshDistanceMaterial();
    applyWindShader(depth, uniforms);
    applyWindShader(distance, uniforms);
    node.customDepthMaterial = depth;
    node.customDistanceMaterial = distance;
    ownedMaterials.push(material, depth, distance);
    // Deformation is under 15 cm; expand culling bounds without mutating shared cached geometry.
    node.frustumCulled = false;
    restoreMeshes.push(() => {
      if (node.material !== material) return;
      node.material = originalMaterial;
      node.customDepthMaterial = originalDepth;
      node.customDistanceMaterial = originalDistance;
      node.frustumCulled = originalCulling;
    });
  });
  return {
    /** Pause smoothly when hidden; reduced motion immediately restores the authored plant silhouette. */
    update(delta, windSpeedKmh, windDirectionDeg, animate) {
      uniforms.landscapeDirection.value.set(...windTravelDirection(windDirectionDeg));
      uniforms.landscapeWind.value = animate ? Math.min(1.2, weatherMagnitude(windSpeedKmh, 80) / 30) : 0;
      if (animate) uniforms.landscapeTime.value += Math.min(delta, 0.06);
    },
    /** Release only this scene's cloned materials, leaving the shared asset cache intact. */
    dispose() { restoreMeshes.forEach((restore) => restore()); ownedMaterials.forEach((material) => material.dispose()); },
  };
}
