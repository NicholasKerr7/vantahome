import { LoadingManager, Material, Mesh, Texture, type Group, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelName } from './contracts';
import { WEATHER_GROUPS } from './weatherAnimation';

const WEATHER_PLANTS = new Set(WEATHER_GROUPS.filter(({ kind }) => kind === 'plant').map(({ name }) => name));

/** Keep each comparison's decoded working set equal to its native counterpart. */
export function modelsForView(view: 'bedroom' | 'property'): ModelName[] {
  return view === 'bedroom' ? ['upper', 'fixtures'] : ['exterior', 'landscape', 'gate', 'solar', 'rain'];
}

/** Decode packaged bytes directly, without HTTP, file fetches, or external decoders. */
export async function loadEmbeddedModel(name: ModelName): Promise<Group> {
  const encoded = window.__VANTA_LAB_MODELS__?.[name];
  if (!encoded) throw new Error(`Missing packaged ${name} model.`);
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      throw new Error('The renderer comparison cannot load external model resources.');
    }
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(bytes.buffer, '');
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh) {
      const solid = name === 'rain' ? WEATHER_PLANTS.has(node.name) : name !== 'solar';
      node.castShadow = solid;
      node.receiveShadow = solid;
    }
  });
  return gltf.scene;
}

/** Release shared geometry/material/texture allocations once when leaving the lab. */
export function disposeModels(roots: Object3D[]): void {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) {
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
    });
  }
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
