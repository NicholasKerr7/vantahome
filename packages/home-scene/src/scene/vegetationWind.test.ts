import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Material, type WebGLRenderer } from 'three';
import { prepareVegetationWind } from './vegetationWind';
import { windTravelDirection } from '../environment/propertyGeography';

/** Exercise material bindings without a GPU, including the independent depth/distance passes. */
function compileWindBindings(material: Material) {
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '' } as Parameters<Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader.uniforms;
}

describe('scene-local vegetation resources', () => {
  it('keeps visible foliage and both shadow passes on the same true-bearing wind and reduced-motion state', () => {
    const geometry = new BoxGeometry();
    const authored = new MeshStandardMaterial();
    authored.name = 'Site Leaf middle';
    const mesh = new Mesh(geometry, authored);
    const controller = prepareVegetationWind(mesh);
    const bindings = [mesh.material, mesh.customDepthMaterial!, mesh.customDistanceMaterial!].map(compileWindBindings);
    for (const bearing of [0, 90, 180, 270]) {
      controller.update(0.05, 24, bearing, true);
      for (const uniforms of bindings) {
        expect(uniforms.landscapeDirection!.value.toArray()).toEqual(windTravelDirection(bearing));
        expect(uniforms.landscapeWind!.value).toBeCloseTo(0.8);
        expect(uniforms.landscapeTime).toBe(bindings[0]!.landscapeTime);
      }
    }
    const previousTime = bindings[0]!.landscapeTime!.value;
    controller.update(2, 60, 90, false);
    for (const uniforms of bindings) {
      expect(uniforms.landscapeWind!.value).toBe(0);
      expect(uniforms.landscapeTime!.value).toBe(previousTime);
    }
    controller.dispose(); geometry.dispose(); authored.dispose();
  });

  it('deforms botanical batches while preserving shared assets, architecture and cleanup', () => {
    const cachedLeaves = new MeshStandardMaterial();
    cachedLeaves.name = 'Site Leaf middle';
    const cachedWall = new MeshStandardMaterial();
    cachedWall.name = 'Site Wall';
    const geometry = new BoxGeometry();
    const leaves = new Mesh(geometry, cachedLeaves);
    const wall = new Mesh(geometry, cachedWall);
    const root = new Group();
    root.add(leaves, wall);
    const sharedDisposed = vi.fn();
    cachedLeaves.addEventListener('dispose', sharedDisposed);
    geometry.addEventListener('dispose', sharedDisposed);
    const controller = prepareVegetationWind(root);
    expect(leaves.material).not.toBe(cachedLeaves);
    expect(wall.material).toBe(cachedWall);
    expect(leaves.geometry).toBe(geometry);
    expect(leaves.customDepthMaterial).toBeDefined();
    expect(leaves.customDistanceMaterial).toBeDefined();
    controller.update(0.02, 18, 270, true);
    controller.update(0.02, 18, 270, false);
    controller.dispose();
    expect(leaves.material).toBe(cachedLeaves);
    expect(leaves.customDepthMaterial).toBeUndefined();
    expect(leaves.frustumCulled).toBe(true);
    expect(sharedDisposed).not.toHaveBeenCalled();
    // React's development setup/cleanup cycle must be safe to repeat.
    const remounted = prepareVegetationWind(root);
    remounted.dispose();
    expect(leaves.material).toBe(cachedLeaves);
    geometry.dispose(); cachedLeaves.dispose(); cachedWall.dispose();
  });
});
