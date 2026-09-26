import type { LightShadow } from 'three';

/** Release an obsolete shadow texture so Three allocates the requested resolution. */
export function resizeShadowMap(shadow: LightShadow, size: number): void {
  if (shadow.mapSize.x === size && shadow.mapSize.y === size) return;
  shadow.mapSize.set(size, size);
  shadow.map?.dispose();
  shadow.map = null;
  shadow.needsUpdate = true;
}
