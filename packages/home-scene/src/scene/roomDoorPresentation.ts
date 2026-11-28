import type { Object3D } from 'three';
import { ROOM_DOORS, type RoomDoor } from '../roomDoors';
import { canExploreInteriorLayout, type SceneAccess } from '../sceneAccess';
import type { HouseFloor, HouseView } from './types';

/** The dedicated teak batches contain exactly the 27 measured leaves (verified against source assets). */
export function hideBakedRoomDoors(scene: Object3D): void {
  scene.traverse((node) => {
    if (node.name === 'ground--teak' || node.name === 'upper--teak') node.visible = false;
  });
}

/** Layout sharing shows closed architectural doors, never another room's live device state. */
export function visibleRoomDoors(access: SceneAccess, view: HouseView, floor: HouseFloor, roomId: string): readonly RoomDoor[] {
  const complete = view === 'exterior' || view === 'immersive';
  const interiors = canExploreInteriorLayout(access);
  return ROOM_DOORS.filter((door) => {
    if (!complete && door.floor !== floor) return false;
    if (interiors) return true;
    if (view === 'exterior') return door.security === 'exterior';
    return door.roomId === roomId;
  });
}
