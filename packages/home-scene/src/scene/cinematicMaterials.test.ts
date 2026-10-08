import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { prepareCinematicMaterials } from './cinematicMaterials';

/** Make a named source finish without relying on WebGL, asset decoding, or device state. */
function surface(name: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#b6aaa0', roughness: 0.84 });
  material.name = name;
  return material;
}

describe('cinematic material ownership', () => {
  it('enhances physical surfaces with one clone per shared source and restores the original on exit', () => {
    const source = surface('Chalk');
    const originalDispose = vi.spyOn(source, 'dispose');
    const root = new Group();
    const first = new Mesh(new BoxGeometry(), source);
    const second = new Mesh(first.geometry, source);
    root.add(first, second);
    const finishes = prepareCinematicMaterials(root);
    expect(first.material).not.toBe(source);
    expect(first.material).toBe(second.material);
    expect(first.material.roughness).toBeLessThan(source.roughness);
    expect(source.roughness).toBe(0.84);
    const ownedDispose = vi.spyOn(first.material, 'dispose');
    finishes.dispose();
    finishes.dispose();
    expect(first.material).toBe(source);
    expect(second.material).toBe(source);
    expect(ownedDispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).not.toHaveBeenCalled();
    first.geometry.dispose();
    source.dispose();
  });

  it('preserves privacy glass, device screens, lights, and vegetation materials exactly', () => {
    const names = ['Glass', 'Furniture_glass', 'Luxury device screen', 'Site Indicator', 'Site Leaf dark', 'Chalk'];
    const materials = names.map(surface);
    materials[0]!.color.set('#465159');
    materials[5]!.emissive.set('#ffcc88');
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), materials);
    root.add(mesh);
    const finishes = prepareCinematicMaterials(root);
    expect(mesh.material).toBe(materials);
    expect(materials[0]!.color.getHexString()).toBe('465159');
    expect(materials[5]!.emissive.getHexString()).toBe('ffcc88');
    finishes.dispose();
    mesh.geometry.dispose();
    materials.forEach((material) => material.dispose());
  });

  it('retains authored geometry and does not overwrite a later material owner during cleanup', () => {
    const source = surface('Site Gate metal');
    const later = surface('Site Gate metal');
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), source);
    const geometry = mesh.geometry;
    root.add(mesh);
    const finishes = prepareCinematicMaterials(root);
    expect(mesh.geometry).toBe(geometry);
    mesh.material = later;
    finishes.dispose();
    expect(mesh.material).toBe(later);
    geometry.dispose();
    source.dispose();
    later.dispose();
  });
});
