import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { prepareVegetationWind } from './vegetationWind';

describe('scene-local vegetation resources', () => {
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
