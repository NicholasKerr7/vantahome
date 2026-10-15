import { Vector3, type Camera } from 'three';
import siteLayout from '../site-layout.json';

/** A002's drawn north arrow is approximately 30 degrees west of drawing-up.
 * The model uses drawing X/right and Y/up-page, exported as Three [X, height, -Y].
 * This is a plan-derived orientation, not a surveyed boundary bearing or GPS heading.
 */
export const SITE_NORTH_OFFSET_DEGREES = siteLayout.orientation.northDegreesClockwiseFromPlanUp;
export const SITE_CARDINALS = [
  { label: 'N', name: 'North', bearing: 0 },
  { label: 'E', name: 'East', bearing: 90 },
  { label: 'S', name: 'South', bearing: 180 },
  { label: 'W', name: 'West', bearing: 270 },
] as const;
export type SiteCardinal = (typeof SITE_CARDINALS)[number];
const COMPASS_CENTER = new Vector3(10, -0.9, -8);
const COMPASS_RADIUS = 35;

/** Convert a geographic bearing into the existing model's unchanged local axes. */
export function siteBearingDirection(bearing: number): Vector3 {
  const angle = (bearing + SITE_NORTH_OFFSET_DEGREES) * Math.PI / 180;
  return new Vector3(Math.sin(angle), 0, -Math.cos(angle));
}

/** Place compass points around the existing presentation ring, without changing any geometry. */
export function siteCardinalPosition(bearing: number): [number, number, number] {
  return siteBearingDirection(bearing).multiplyScalar(COMPASS_RADIUS).add(COMPASS_CENTER).toArray();
}

/** Keep plan directions legible while orbiting/zooming, clear of the title and view controls.
 * At a close zoom, an off-screen world anchor becomes an edge indicator using the
 * camera's horizontal-plane basis. Behind-camera points never reverse their direction.
 */
export function projectSiteCardinal(bearing: number, camera: Camera, size: { width: number; height: number }): [number, number] {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const insetX = Math.min(24, width * 0.15);
  const top = Math.min(94, height * 0.22);
  const bottom = height - Math.min(84, height * 0.22);
  const position = new Vector3(...siteCardinalPosition(bearing));
  const viewPosition = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = position.project(camera);
  const x = (projected.x + 1) * width / 2;
  const y = (1 - projected.y) * height / 2;
  if (viewPosition.z < 0 && Number.isFinite(x) && Number.isFinite(y)) {
    return [Math.max(insetX, Math.min(width - insetX, x)), Math.max(top, Math.min(bottom, y))];
  }

  const direction = siteBearingDirection(bearing).transformDirection(camera.matrixWorldInverse);
  const length = Math.hypot(direction.x, direction.y);
  // Directly facing one cardinal at horizon height has no vertical projection;
  // its forward/backward sense supplies a stable limiting direction.
  const screenX = length > 1e-6 ? direction.x / length : 0;
  const screenY = length > 1e-6 ? -direction.y / length : direction.z > 0 ? 1 : -1;
  return [width / 2 + screenX * (width / 2 - insetX), (top + bottom) / 2 + screenY * (bottom - top) / 2];
}
