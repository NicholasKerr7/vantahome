import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { getRoom } from '../data';
import { isPlacementKeepOut, preparePlacementModel } from './placementModels';

describe('outdoor placement context', () => {
  it('includes the house and grounds, hides only the superseded site, and does not mutate cached models', () => {
    const landscape = new Group(); landscape.name = 'landscape';
    const house = new Group(); house.name = 'house';
    const oldSite = new Group(); oldSite.name = 'floor-site';
    const wall = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); wall.name = 'house-wall';
    house.add(oldSite, wall);
    const model = preparePlacementModel([landscape, house], getRoom('grounds'));
    expect(model.getObjectByName('landscape')).toBeDefined();
    expect(model.getObjectByName('house-wall')).toBeDefined();
    expect(model.getObjectByName('floor-site')?.visible).toBe(false);
    expect(oldSite.visible).toBe(true);
    expect(isPlacementKeepOut(model.getObjectByName('house-wall')!)).toBe(true);
    expect(isPlacementKeepOut(model.getObjectByName('landscape')!)).toBe(false);
    expect(isPlacementKeepOut(wall)).toBe(false);
    expect((model.getObjectByName('house-wall') as Mesh).geometry).toBe(wall.geometry);
    wall.geometry.dispose(); (wall.material as MeshStandardMaterial).dispose();
  });
});
