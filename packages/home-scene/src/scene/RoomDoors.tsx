import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, MathUtils, Matrix4 } from 'three';
import { canViewSceneDevice, FULL_SCENE_ACCESS } from '../sceneAccess';
import { readDevice, type HouseSceneProps } from './types';
import { visibleRoomDoors } from './roomDoorPresentation';
import { createRoomDoorParts, DOOR_SURFACES, roomDoorPartMatrix, type DoorSurface } from './roomDoorGeometry';

type DoorProps = Pick<HouseSceneProps, 'access' | 'view' | 'floor' | 'roomId' | 'deviceStates' | 'reducedMotion' | 'cinematic' | 'interactionDisabled' | 'onSelectDevice'>;

/** Four instanced surfaces and one foreground callback animate every architectural door. */
export function RoomDoors({ access = FULL_SCENE_ACCESS, view, floor, roomId, deviceStates, reducedMotion, cinematic, interactionDisabled, onSelectDevice }: DoorProps) {
  const meshes = useRef(new Map<DoorSurface, InstancedMesh>());
  const progress = useRef(new Map<string, number>());
  const matrix = useMemo(() => new Matrix4(), []);
  const complete = view === 'exterior' || view === 'immersive';
  // Host snapshots replace the grant object on ordinary state updates. Depend on
  // layout capabilities so an Open/Close response does not rebuild/snap the geometry.
  const doors = useMemo(() => visibleRoomDoors(access, view, floor, roomId), [access.fullHome, access.interiorLayout, view, floor, roomId]);
  const targets = useMemo(() => new Map(doors.map((door) => [door.id,
    canViewSceneDevice(access, door.id) ? readDevice(deviceStates, door.id).level : 0])), [access, deviceStates, doors]);
  const batches = useMemo(() => {
    const parts = createRoomDoorParts(doors, !complete);
    return (Object.keys(DOOR_SURFACES) as DoorSurface[]).map((surface) => ({ surface, parts: parts.filter((part) => part.surface === surface) }));
  }, [doors, complete]);

  /** Upload only while a pose changes; resting doors do not rewrite GPU buffers each frame. */
  function updatePoses(delta: number, immediate = false) {
    let changed = immediate;
    for (const door of doors) {
      const target = targets.get(door.id) ?? 0;
      const current = progress.current.get(door.id);
      const next = immediate || reducedMotion || current === undefined || Math.abs(target - current) < 0.01
        ? target : MathUtils.damp(current, target, 5, Math.min(delta, 0.07));
      changed ||= next !== current;
      progress.current.set(door.id, next);
    }
    if (!changed) return;
    for (const { surface, parts } of batches) {
      const mesh = meshes.current.get(surface);
      if (!mesh) continue;
      parts.forEach((part, index) => mesh.setMatrixAt(index, roomDoorPartMatrix(part, progress.current.get(part.door.id) ?? 0, complete, matrix)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  // Initialize the actual saved pose before the first visible frame or after changing floors.
  useLayoutEffect(() => { updatePoses(0, true); }, [batches, complete]);
  useFrame((_, delta) => { if (!document.hidden) updatePoses(delta); });

  return <group name="interactive-room-doors">
    {batches.filter(({ parts }) => parts.length > 0).map(({ surface, parts }) => <instancedMesh key={`${surface}:${parts.length}`}
      ref={(mesh) => { if (mesh) meshes.current.set(surface, mesh); else meshes.current.delete(surface); }}
      args={[undefined, undefined, parts.length]} castShadow receiveShadow
      onClick={cinematic || interactionDisabled ? undefined : (event) => {
        const part = event.instanceId === undefined ? undefined : parts[event.instanceId];
        if (!part || !canViewSceneDevice(access, part.door.id)) return;
        event.stopPropagation(); onSelectDevice(part.door.id);
      }}>
      <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial {...DOOR_SURFACES[surface]} />
    </instancedMesh>)}
  </group>;
}
