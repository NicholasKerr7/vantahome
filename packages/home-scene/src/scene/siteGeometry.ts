import siteLayout from '../site-layout.json';
import solarCorners from '../solar-corners.json';

export type SitePoint3 = [number, number, number];

export interface LandscapeCameraPose {
  position: SitePoint3;
  target: SitePoint3;
}

const FRAME_PADDING = 1.12;
const DEFAULT_FOV = 42;
const HOUSE_BOUNDS = { min: [-0.7, -0.25, -16.9], max: [17.3, 7.9, 0.7] } as const;

/** Keep exterior-only orbiting cameras outside every corner of the furnished house. */
export function getExteriorPrivacyDistance(target: SitePoint3): number {
  return Math.max(...boxCorners(HOUSE_BOUNDS.min, HOUSE_BOUNDS.max)
    .map((point) => Math.hypot(...point.map((value, axis) => value - target[axis]!)))) + 2;
}

/** Reject malformed local geometry before it can create invalid camera coordinates. */
function point3(values: readonly number[]): SitePoint3 {
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error('Site layout coordinates must contain three finite numbers.');
  }
  return [values[0]!, values[1]!, values[2]!];
}

/** Express a vector in a unit camera basis without depending on Three.js state. */
function dot(left: SitePoint3, right: SitePoint3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

/** Build a perpendicular axis using the same world-up convention as the scene. */
function cross(left: SitePoint3, right: SitePoint3): SitePoint3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

/** Normalize a valid direction and fail explicitly for a degenerate site camera. */
function normalize(vector: SitePoint3): SitePoint3 {
  const length = Math.hypot(...vector);
  if (length < Number.EPSILON) throw new Error('Site overview camera needs a nonzero direction.');
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/** Move the gate from its closed origin along the authored open translation. */
export function getGatePosition(percent: number): SitePoint3 {
  const progress = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
  const origin = point3(siteLayout.runtime.gate.position);
  const translation = point3(siteLayout.runtime.gate.openTranslation);
  return [
    origin[0] + translation[0] * progress,
    origin[1] + translation[1] * progress,
    origin[2] + translation[2] * progress,
  ];
}

/** Describe a compact object's occupied box instead of extending its height across the site. */
function boxCorners(min: readonly number[], max: readonly number[]): SitePoint3[] {
  const low = point3(min);
  const high = point3(max);
  if (low.some((value, axis) => value > high[axis]!)) throw new Error('Site bounds must have ordered minimum and maximum coordinates.');
  const corners: SitePoint3[] = [];
  for (const x of [low[0], high[0]]) {
    for (const y of [low[1], high[1]]) {
      for (const z of [low[2], high[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

/** Return conservative bounds only where the parcel and its modeled components exist. */
export function getLandscapeFramingPoints(): SitePoint3[] {
  const points: SitePoint3[] = [];
  const { parcel, boundary, road, planting } = siteLayout;
  const slabBottom = parcel.lawnElevation - parcel.slabThickness;
  const wallTop = parcel.lawnElevation + boundary.wallHeight + boundary.capThickness;
  for (const vertex of parcel.vertices) {
    for (const height of [slabBottom, parcel.lawnElevation, wallTop]) {
      points.push(point3([vertex[0]!, height, -vertex[1]!]));
    }
  }

  const [roadMinX, roadMaxX, roadMinY, roadMaxY] = road.bounds;
  for (const x of [roadMinX!, roadMaxX!]) {
    for (const y of [roadMinY!, roadMaxY!]) points.push(point3([x, road.elevation, -y]));
  }
  points.push(...boxCorners(HOUSE_BOUNDS.min, HOUSE_BOUNDS.max));

  // Crowns need their own modest height envelope, not the house's roof height.
  for (const palm of planting.palms) {
    const [x, y, height] = point3(palm);
    points.push(...boxCorners([x - 1.6, parcel.lawnElevation, -y - 1.6], [x + 1.6, height + 1, -y + 1.6]));
  }

  // Solar poles occupy each tall corner individually; do not inflate the entire parcel.
  for (const corner of solarCorners.corners) {
    const [x, north, baseY] = corner.positionBlender;
    const radius = Math.hypot(solarCorners.dimensions[0]! / 2, solarCorners.dimensions[2]!);
    points.push(...boxCorners(
      [x! - radius, baseY!, -north! - radius],
      [x! + radius, baseY! + solarCorners.dimensions[1]!, -north! + radius],
    ));
  }

  const gate = siteLayout.runtime.gate;
  const postHalfWidth = boundary.gatePostWidth / 2 + boundary.capThickness;
  for (const endpoint of [gate.openingStart, gate.openingEnd]) {
    const [x, groundY, z] = point3(endpoint);
    points.push(...boxCorners([x - postHalfWidth, groundY, z - postHalfWidth], [x + postHalfWidth, groundY + 2, z + postHalfWidth]));
  }

  // Both positions keep the complete panel framed throughout its sliding travel.
  const halfX = (Math.abs(Math.cos(gate.rotationY)) * gate.width + Math.abs(Math.sin(gate.rotationY)) * gate.depth) / 2;
  const halfZ = (Math.abs(Math.sin(gate.rotationY)) * gate.width + Math.abs(Math.cos(gate.rotationY)) * gate.depth) / 2;
  for (const position of [getGatePosition(0), getGatePosition(100)]) {
    const [x, y, z] = position;
    points.push(...boxCorners([x - halfX, y - gate.height / 2, z - halfZ], [x + halfX, y + gate.height / 2, z + halfZ]));
  }
  return points;
}

/** Fit and center occupied site geometry with a 12% frustum margin at the given aspect. */
export function getLandscapeCamera(aspect: number, fov = DEFAULT_FOV): LandscapeCameraPose {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeFov = Number.isFinite(fov) && fov > 0 && fov < 180 ? fov : DEFAULT_FOV;
  const origin = point3(siteLayout.runtime.center);
  const overview = point3(siteLayout.runtime.overviewCamera);
  const back = normalize([overview[0] - origin[0], overview[1] - origin[1], overview[2] - origin[2]]);
  const right = normalize(cross([0, 1, 0], back));
  const up = normalize(cross(back, right));
  const verticalSlope = Math.tan(safeFov * Math.PI / 360) / FRAME_PADDING;
  const horizontalSlope = verticalSlope * safeAspect;
  const projected = getLandscapeFramingPoints().map((point) => {
    const offset: SitePoint3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
    return { x: dot(offset, right), y: dot(offset, up), z: dot(offset, back) };
  });

  // Intersect each point's allowed camera-center intervals at its true perspective depth.
  const rightLimit = Math.max(...projected.map((point) => point.x + horizontalSlope * point.z));
  const leftLimit = Math.min(...projected.map((point) => point.x - horizontalSlope * point.z));
  const topLimit = Math.max(...projected.map((point) => point.y + verticalSlope * point.z));
  const bottomLimit = Math.min(...projected.map((point) => point.y - verticalSlope * point.z));
  const distance = Math.max(
    (rightLimit - leftLimit) / (2 * horizontalSlope),
    (topLimit - bottomLimit) / (2 * verticalSlope),
    Math.max(...projected.map((point) => point.z)) + 0.1,
  );
  const horizontalCenter = (rightLimit + leftLimit) / 2;
  const verticalCenter = (topLimit + bottomLimit) / 2;
  const target: SitePoint3 = [
    origin[0] + right[0] * horizontalCenter + up[0] * verticalCenter,
    origin[1] + right[1] * horizontalCenter + up[1] * verticalCenter,
    origin[2] + right[2] * horizontalCenter + up[2] * verticalCenter,
  ];

  return {
    position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance],
    target,
  };
}
