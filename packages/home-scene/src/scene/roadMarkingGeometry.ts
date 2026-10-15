import { BufferGeometry, Float32BufferAttribute } from 'three';
import siteLayout from '../site-layout.json';

export interface RoadStripe {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// These are presentation markings on the interpreted road, not surveyed road paint.
export const ROAD_MARKING_ELEVATION = siteLayout.road.elevation + 0.008;
const EDGE_INSET = 0.3;
const EDGE_WIDTH = 0.075;
const CENTER_WIDTH = 0.1;
const DASH_LENGTH = 2.8;
const DASH_GAP = 3.5;

/** Place paint inside the existing road bounds, leaving the driveway entrance clear. */
export function roadMarkingStripes(): RoadStripe[] {
  const [minX, maxX, minNorth, maxNorth] = siteLayout.road.bounds as [number, number, number, number];
  const minZ = -maxNorth;
  const maxZ = -minNorth;
  const start = minX + EDGE_INSET;
  const end = maxX - EDGE_INSET;
  const entranceStart = Math.min(...siteLayout.apron.polygon.map(([x]) => x!)) - 0.2;
  const entranceEnd = Math.max(...siteLayout.apron.polygon.map(([x]) => x!)) + 0.2;
  const stripes: RoadStripe[] = [
    { minX: start, maxX: end, minZ: minZ + EDGE_INSET, maxZ: minZ + EDGE_INSET + EDGE_WIDTH },
  ];
  for (const [from, to] of [[start, entranceStart], [entranceEnd, end]]) {
    const left = Math.max(start, from!);
    const right = Math.min(end, to!);
    if (right > left) stripes.push({ minX: left, maxX: right, minZ: maxZ - EDGE_INSET - EDGE_WIDTH, maxZ: maxZ - EDGE_INSET });
  }
  const centerZ = (minZ + maxZ) / 2;
  for (let from = start + 0.8; from + DASH_LENGTH <= end; from += DASH_LENGTH + DASH_GAP) {
    stripes.push({ minX: from, maxX: from + DASH_LENGTH, minZ: centerZ - CENTER_WIDTH / 2, maxZ: centerZ + CENTER_WIDTH / 2 });
  }
  return stripes;
}

/** Batch all horizontal paint into one mesh with upward normals and no coplanar faces. */
export function createRoadMarkingGeometry(): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const stripe of roadMarkingStripes()) {
    const offset = positions.length / 3;
    positions.push(
      stripe.minX, ROAD_MARKING_ELEVATION, stripe.minZ,
      stripe.minX, ROAD_MARKING_ELEVATION, stripe.maxZ,
      stripe.maxX, ROAD_MARKING_ELEVATION, stripe.maxZ,
      stripe.maxX, ROAD_MARKING_ELEVATION, stripe.minZ,
    );
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
