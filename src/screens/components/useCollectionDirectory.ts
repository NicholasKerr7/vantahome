import { useShallow } from 'zustand/react/shallow';
import { selectVisibleDevices, selectVisibleRooms, useHomeStore } from '../../store/useHomeStore';
import type { CollectionDirectory } from './collectionDescriptions';
import { sceneIsVisible } from '../../features/scenes/sceneScope';

/** Keep card descriptions in the same visibility scope as the device and scene editors. */
export function useCollectionDirectory(): CollectionDirectory {
  const devices = useHomeStore(useShallow(selectVisibleDevices));
  const rooms = useHomeStore(useShallow(selectVisibleRooms));
  const scenes = useHomeStore((state) => state.scenes);
  const household = useHomeStore((state) => state.household);
  return { devices, scenes: scenes.filter((scene) => sceneIsVisible(scene, rooms, devices)), household };
}
