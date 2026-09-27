import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, Scene, Texture, TextureLoader, type Group } from 'three';
import { INITIAL_STATE } from './contracts';
import { disposeModels, loadEmbeddedModel } from './models';
import { createStormEffects, type StormEffects } from './stormEffects';
import { ORIGINAL_WEATHER_FOLIAGE_NAMES, WEATHER_GROUPS } from './weatherAnimation';

describe('packaged comparison weather assets', () => {
  it('loads the authored groups with matching foliage names, wet surfaces, and plant-only weather shadows', async () => {
    const sources = {
      exterior: new URL('../../public/models/exterior.glb', import.meta.url),
      landscape: new URL('../../public/models/landscape.glb', import.meta.url),
      rain: new URL('../../../../assets/renderer-lab/rain.glb', import.meta.url),
    };
    vi.stubGlobal('window', {
      __VANTA_LAB_MODELS__: Object.fromEntries(Object.entries(sources).map(([name, path]) => [name, readFileSync(path).toString('base64')])),
    });
    vi.stubGlobal('self', { URL });
    // Node has no image decoder; only replace that browser boundary, preserving GLTF mesh/material decoding.
    const decodeImage = vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
      const texture = new Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    });
    const roots: Group[] = [];
    let effects: StormEffects | undefined;
    try {
      // Load sequentially so every successfully decoded asset is owned even if a later one fails.
      for (const name of ['exterior', 'landscape', 'rain'] as const) roots.push(await loadEmbeddedModel(name));
      const [exterior, landscape, weatherModel] = roots;
      const scene = new Scene();
      effects = createStormEffects({ scene, exterior, landscape, weatherModel, ambient: new HemisphereLight(), sun: new DirectionalLight() });
      effects.apply({ ...INITIAL_STATE, view: 'property', weather: 'heavy', windSpeed: 24, windDirection: 55 });
      for (const group of WEATHER_GROUPS) {
        const mesh = weatherModel.getObjectByName(group.name);
        expect(mesh).toBeInstanceOf(Mesh);
        expect(mesh?.castShadow).toBe(group.kind === 'plant');
        expect(mesh?.receiveShadow).toBe(group.kind === 'plant');
      }
      for (const name of ORIGINAL_WEATHER_FOLIAGE_NAMES) {
        expect(landscape.getObjectByName(name.replaceAll(' ', '_'))?.visible).toBe(false);
      }
      const roof = exterior.getObjectByName('roof--clay') as Mesh;
      expect(roof.material).toBeInstanceOf(MeshStandardMaterial);
      expect((roof.material as MeshStandardMaterial).roughness).toBeLessThan(0.4);
    } finally {
      effects?.dispose();
      disposeModels(roots);
      decodeImage.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
