import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, Vector3 } from 'three';
import { DEVICES, getRoom } from '../data';
import {
  arrangeHotspots,
  projectHotspotAnchors,
  type ScreenPositions,
} from './arrangeHotspots';
import { UPPER_ELEVATION, type HouseSceneProps } from './types';

const LayoutContext = createContext<RefObject<ScreenPositions> | null>(null);

/** Share one deterministic screen layout with all of the selected room's HTML controls. */
export function HotspotLayout({
  roomId,
  view,
  children,
}: Pick<HouseSceneProps, 'roomId' | 'view'> & { children: ReactNode }) {
  const positions = useRef<ScreenPositions>({});
  const previousProjection = useRef('');
  const { camera, size } = useThree();
  const anchors = useMemo(
    () =>
      DEVICES.filter((device) => device.roomId === roomId).map((device) => {
        const elevation =
          (view === 'immersive' || view === 'exterior') &&
          getRoom(roomId).floor === 'upper'
            ? UPPER_ELEVATION
            : 0;
        return {
          id: device.id,
          world: new Vector3(
            device.hotspot[0],
            device.hotspot[1] + elevation,
            device.hotspot[2],
          ),
        };
      }),
    [roomId, view],
  );
  useFrame(() => {
    if (document.hidden) return;
    const projected = projectHotspotAnchors(anchors, camera, size);
    // Skip the layout search on settled frames; quantization stays below one CSS pixel.
    const key =
      `${size.width}:${size.height}:` +
      projected
        .map(
          (anchor) =>
            `${anchor.id}:${anchor.x.toFixed(2)},${anchor.y.toFixed(2)}`,
        )
        .join(';');
    if (key === previousProjection.current) return;
    previousProjection.current = key;
    positions.current = arrangeHotspots(projected, size.width, size.height);
  }, -1);
  return (
    <LayoutContext.Provider value={positions}>
      {children}
    </LayoutContext.Provider>
  );
}

/** Resolve projected positions without React state updates inside the render loop. */
export function useHotspotLayout() {
  return useContext(LayoutContext);
}

/** Keep an offset marker visibly connected to the exact physical device location. */
export function HotspotLeader({
  id,
  position,
}: {
  id: string;
  position: [number, number, number];
}) {
  const layout = useHotspotLayout();
  const line = useRef<import('three').LineSegments>(null);
  const vertices = useMemo(() => new Float32Array(6), []);
  const point = useMemo(() => new Vector3(), []);
  const end = useMemo(() => new Vector3(), []);
  const { camera, size } = useThree();
  useFrame(() => {
    const coordinates = layout?.current[id];
    if (!line.current || document.hidden) return;
    if (!coordinates) {
      line.current.visible = false;
      return;
    }
    line.current.updateWorldMatrix(true, false);
    point
      .set(...position)
      .applyMatrix4(line.current.matrixWorld)
      .project(camera);
    const distance = Math.hypot(
      ((point.x + 1) * size.width) / 2 - coordinates[0],
      ((1 - point.y) * size.height) / 2 - coordinates[1],
    );
    line.current.visible = distance > 4;
    if (distance <= 4) return;
    end
      .set(
        (coordinates[0] / size.width) * 2 - 1,
        1 - (coordinates[1] / size.height) * 2,
        point.z,
      )
      .unproject(camera);
    line.current.worldToLocal(end);
    vertices.set(position, 0);
    vertices.set(end.toArray(), 3);
    (line.current.geometry.attributes.position as BufferAttribute).needsUpdate =
      true;
    line.current.geometry.computeBoundingSphere();
  });
  return (
    <lineSegments ref={line} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#DFC4FF"
        transparent
        opacity={0.6}
        depthTest={false}
        depthWrite={false}
      />
    </lineSegments>
  );
}
