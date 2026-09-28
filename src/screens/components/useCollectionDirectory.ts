import { useShallow } from 'zustand/react/shallow';
import { selectVisibleDevices, selectVisibleRooms, useHomeStore } from '../../store/useHomeStore';
import type { CollectionDirectory } from './collectionDescriptions';

/** Keep card descriptions in the same visibility scope as the device and scene editors. */
export function useCollectionDirectory(): CollectionDirectory {
  const devices = useHomeStore(useShallow(selectVisibleDevices));
  const rooms = useHomeStore(useShallow(selectVisibleRooms));
  const scenes = useHomeStore((state) => state.scenes);
  const household = useHomeStore((state) => state.household);
  const visibleRoomIds = new Set(rooms.map((room) => room.id));
  return { devices, scenes: scenes.filter((scene) => visibleRoomIds.has(scene.roomId)), household };
}
