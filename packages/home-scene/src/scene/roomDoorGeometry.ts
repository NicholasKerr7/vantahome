import { Matrix4 } from 'three';
import { roomDoorAngle, type RoomDoor } from '../roomDoors';
import { UPPER_ELEVATION } from './types';

export const DOOR_SURFACES = {
  edge: { color: '#79513b', roughness: 0.53, metalness: 0 },
  face: { color: '#9b7151', roughness: 0.6, metalness: 0 },
  metal: { color: '#c9b79b', roughness: 0.28, metalness: 0.8 },
  frame: { color: '#4e3c32', roughness: 0.65, metalness: 0 },
} as const;
export type DoorSurface = keyof typeof DOOR_SURFACES;
export interface DoorPart {
  door: RoomDoor;
  surface: DoorSurface;
  hinge?: -1 | 1;
  fold?: boolean;
  leafWidth?: number;
  local: Matrix4;
}

/** Build reusable unit-box instances; the entire property adds just four material draw calls. */
export function createRoomDoorParts(doors: readonly RoomDoor[], cutaway = false): DoorPart[] {
  const parts: DoorPart[] = [];
  for (const door of doors) {
    // Floor-plan walls end at 0.78 m; match that cut so doors do not obscure the furnished rooms.
    const height = cutaway ? 0.75 : door.height;
    /** Store one authored box in its leaf's local coordinate system. */
    const add = (surface: DoorSurface, position: number[], size: number[], hinge?: -1 | 1, fold = false, leafWidth = 0) => {
      parts.push({ door, surface, hinge, fold, leafWidth,
        local: new Matrix4().makeTranslation(position[0], position[1], position[2]).multiply(new Matrix4().makeScale(size[0], size[1], size[2])) });
    };
    for (const side of [-1, 1]) add('frame', [side * (door.width / 2 + 0.023), height / 2, 0], [0.025, height + 0.02, 0.16]);
    if (!cutaway) add('frame', [0, height + 0.006, 0], [door.width + 0.07, 0.018, 0.16]);
    const hinges: (-1 | 1)[] = door.layout === 'hinged' ? [door.hinge] : [-1, 1];
    const width = door.layout === 'hinged' ? door.width : (door.width - 0.008) / (door.layout === 'double' ? 2 : 4);
    for (const hinge of hinges) {
      const direction = -hinge;
      for (const fold of door.layout === 'bifold' ? [false, true] : [false]) {
        const center = direction * width / 2;
        add('edge', [center, height / 2, 0], [width, height, 0.044], hinge, fold, width);
        for (const side of [-1, 1]) {
          add('face', [center, height / 2, side * 0.024], [width - 0.045, height - 0.07, 0.006], hinge, fold, width);
          if (!cutaway && (door.layout !== 'bifold' || fold)) {
            const handle = direction * (width - 0.075);
            add('metal', [handle, door.height / 2 - 0.04, side * 0.04], [0.032, 0.12, 0.025], hinge, fold, width);
            add('metal', [handle - direction * 0.035, door.height / 2 - 0.025, side * 0.058], [0.1, 0.016, 0.018], hinge, fold, width);
          }
        }
      }
    }
  }
  return parts;
}

const rotation = new Matrix4();
const translation = new Matrix4();

/** Compose one leaf about its jamb without per-frame allocations; folded panels use their own edge. */
export function roomDoorPartMatrix(part: DoorPart, percent: number, complete: boolean, result = new Matrix4()): Matrix4 {
  const door = part.door;
  const elevation = complete && door.floor === 'upper' ? UPPER_ELEVATION : 0;
  result.makeTranslation(door.position[0], door.position[1] + elevation, door.position[2]);
  result.multiply(rotation.makeRotationY(door.yaw));
  if (part.hinge !== undefined) {
    const angle = roomDoorAngle(door, percent, part.hinge);
    result.multiply(translation.makeTranslation(part.hinge * door.width / 2, 0, 0));
    result.multiply(rotation.makeRotationY(angle));
    if (part.fold) {
      result.multiply(translation.makeTranslation(-part.hinge * (part.leafWidth ?? 0), 0, 0));
      result.multiply(rotation.makeRotationY(-2 * angle));
    }
  }
  return result.multiply(part.local);
}
