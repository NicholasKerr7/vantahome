import siteLayout from '../site-layout.json';

/** True-north alignment of the unchanged model, derived from the official mapped frontage.
 * This is map calibration, not a certified survey or the phone's magnetic heading.
 */
export const PROPERTY_NORTH_OFFSET_DEGREES = siteLayout.orientation.northDegreesClockwiseFromPlanUp;

/** Convert a true compass bearing into a unit direction in the model's X/Z plane.
 * Bearings increase clockwise from north. Normalize before trigonometry so wrapped
 * readings remain equivalent; invalid readings use north as a deterministic fallback.
 * Keep this module independent of Three.js so native renderers share the same basis.
 */
export function geographicBearingDirection(bearing: number): [number, number] {
  const normalized = Number.isFinite(bearing) ? ((bearing % 360) + 360) % 360 : 0;
  const angle = (normalized + PROPERTY_NORTH_OFFSET_DEGREES) * Math.PI / 180;
  return [Math.sin(angle), -Math.cos(angle)];
}

/** Meteorological bearings describe where wind comes FROM; particles travel away from it. */
export function windTravelDirection(degrees: number): [number, number] {
  const [x, z] = geographicBearingDirection(degrees);
  return [-x, -z];
}
