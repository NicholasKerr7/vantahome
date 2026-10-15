import { Vector3, type Camera } from 'three';
import { geographicBearingDirection, PROPERTY_NORTH_OFFSET_DEGREES } from '../environment/propertyGeography';

/** Compass and weather share one official-map alignment without changing model transforms. */
export const SITE_NORTH_OFFSET_DEGREES = PROPERTY_NORTH_OFFSET_DEGREES;
export const SITE_CARDINALS = [
  { label: 'N', name: 'North', bearing: 0 },
  { label: 'E', name: 'East', bearing: 90 },
  { label: 'S', name: 'South', bearing: 180 },
  { label: 'W', name: 'West', bearing: 270 },
] as const;
export type SiteCardinal = (typeof SITE_CARDINALS)[number];

/** Convert a geographic bearing into the existing model's unchanged local axes. */
export function siteBearingDirection(bearing: number): Vector3 {
  const [x, z] = geographicBearingDirection(bearing);
  return new Vector3(x, 0, z);
}

/** Keep true bearings on a camera-relative ring around the property presentation.
 * A single directional projection avoids near-camera singularities and prevents
 * panning or zooming from reversing a cardinal when a finite world anchor passes behind the eye.
 */
export function projectSiteCardinal(bearing: number, camera: Camera, size: { width: number; height: number }): [number, number] {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const insetX = Math.min(24, width * 0.15);
  const top = Math.min(94, height * 0.22);
  const bottom = height - Math.min(84, height * 0.22);
  const radiusX = width / 2 - insetX;
  const radiusY = (bottom - top) / 2;
  const direction = siteBearingDirection(bearing).transformDirection(camera.matrixWorldInverse);
  const length = Math.hypot(direction.x, direction.y);
  // Directly facing one cardinal at horizon height has no vertical projection;
  // its forward/backward sense supplies a stable limiting direction.
  const screenX = length > 1e-6 ? direction.x / length : 0;
  const screenY = length > 1e-6 ? -direction.y / length : direction.z > 0 ? 1 : -1;
  // One scalar intersects the ellipse without stretching the screen bearing.
  const distance = 1 / Math.hypot(screenX / radiusX, screenY / radiusY);
  return [width / 2 + screenX * distance, (top + bottom) / 2 + screenY * distance];
}
