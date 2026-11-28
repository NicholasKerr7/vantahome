import source from './room-doors.json';

/** Architectural openings measured from the editable Blender house, in floor-local metres. */
export interface RoomDoor {
  id: string;
  name: string;
  roomId: string;
  floor: 'ground' | 'upper';
  security: 'interior' | 'exterior';
  layout: 'hinged' | 'double' | 'bifold';
  position: [number, number, number];
  yaw: number;
  width: number;
  height: number;
  hinge: -1 | 1;
  swing: -1 | 1;
  sourceName: string;
  sourceBounds: [[number, number, number], [number, number, number]];
}

export const ROOM_DOORS: readonly RoomDoor[] = source as RoomDoor[];
const doorsById = new Map(ROOM_DOORS.map((door) => [door.id, door]));

/** Resolve only authored door identities; names and user-entered device metadata confer no access. */
export function getRoomDoor(id: string | null | undefined): RoomDoor | undefined {
  return id ? doorsById.get(id) : undefined;
}

/** Interior opening controls are distinct from exterior entry and physical lock permissions. */
export function isInteriorRoomDoor(id: string | null | undefined): boolean {
  return getRoomDoor(id)?.security === 'interior';
}

/** Clamp the rendered pose, including malformed or missing persisted values. */
export function roomDoorAngle(door: RoomDoor, percent: number, hinge = door.hinge): number {
  const fraction = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) / 100 : 0;
  if (fraction === 0) return 0;
  // Folding leaves stop just short of parallel to avoid coplanar surfaces at full opening.
  const sweep = door.layout === 'bifold' ? Math.PI * 0.48 : Math.PI / 2;
  return -hinge * door.swing * sweep * fraction;
}
