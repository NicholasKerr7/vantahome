import { Group, Mesh, type Object3D } from 'three';
import type { RoomDefinition } from '../data';
import siteLayout from '../site-layout.json';
import { isolateRoomGeometry } from '../scene/roomPrivacy';

/** Build a furnished room or complete grounds context without mutating shared GLTF geometry or materials. */
export function preparePlacementModel(scenes: readonly Object3D[], room: RoomDefinition): Object3D {
  if (!room.outdoor) return isolateRoomGeometry(scenes[0]!, room);
  const model = new Group();
  model.add(scenes[0]!.clone(true));
  const house = scenes[1]!.clone(true);
  house.userData = { ...house.userData, placementKeepOut: true };
  const oldSite = house.getObjectByName(siteLayout.runtime.replaceExistingGroup);
  if (oldSite) oldSite.visible = false;
  model.add(house);
  model.traverse((node) => { if (node instanceof Mesh) { node.castShadow = false; node.receiveShadow = false; } });
  return model;
}

/** House hits must not fall through to the invisible ground plane underneath the building. */
export function isPlacementKeepOut(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.placementKeepOut === true) return true;
  }
  return false;
}
