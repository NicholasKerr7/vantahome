import { Vector3, type Camera } from 'three';

export interface ScreenAnchor {
  id: string;
  x: number;
  y: number;
}
export type ScreenPositions = Record<string, [number, number]>;

const MINIMUM_SPACING = 56;

interface PlacementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Recover usable capacity when earlier local choices leave no room for a later marker. */
function arrangeOnGrid(anchors: ScreenAnchor[], bounds: PlacementBounds): ScreenPositions | null {
  const columns = Math.floor((bounds.maxX - bounds.minX) / MINIMUM_SPACING) + 1;
  const rows = Math.floor((bounds.maxY - bounds.minY) / MINIMUM_SPACING) + 1;
  if (columns < 1 || rows < 1 || columns * rows < anchors.length) return null;

  // Center the complete grid inside the same safe bounds used by local placement.
  const left = (bounds.minX + bounds.maxX - (columns - 1) * MINIMUM_SPACING) / 2;
  const top = (bounds.minY + bounds.maxY - (rows - 1) * MINIMUM_SPACING) / 2;
  const available: [number, number][] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      available.push([left + column * MINIMUM_SPACING, top + row * MINIMUM_SPACING]);

  const positions: ScreenPositions = {};
  for (const anchor of anchors) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let index = 0; index < available.length; index++) {
      const [x, y] = available[index];
      const distance = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
      // Row order breaks equal-distance ties consistently across every frame.
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    positions[anchor.id] = available.splice(nearestIndex, 1)[0];
  }
  return positions;
}

/** Place fixed-size touch targets near their projections without overlap or selection reflow. */
export function arrangeHotspots(
  anchors: ScreenAnchor[],
  width: number,
  height: number,
): ScreenPositions {
  const positions: ScreenPositions = {};
  const placed: [number, number][] = [];
  const margin = 32;
  // Short dashboard canvases need the full safe area for dense room controls.
  const compact = height < 260;
  const minY = compact ? margin : Math.min(74, height / 4);
  const maxY = Math.max(minY, height - (compact ? margin : 82));
  const clampX = (x: number) => Math.max(margin, Math.min(width - margin, x));
  const clampY = (y: number) => Math.max(minY, Math.min(maxY, y));
  for (const anchor of anchors) {
    const origin: [number, number] = [clampX(anchor.x), clampY(anchor.y)];
    let best = origin;
    let found = false;
    // Search nearest concentric rings in a stable order. Nothing depends on power/focus.
    for (
      let radius = 0;
      radius <= Math.max(width, height) && !found;
      radius += 8
    ) {
      const samples =
        radius === 0 ? 1 : Math.max(12, Math.ceil((radius * Math.PI) / 8));
      for (let index = 0; index < samples; index++) {
        const angle = (index * Math.PI * 2) / samples;
        const x = origin[0] + Math.cos(angle) * radius;
        const y = origin[1] + Math.sin(angle) * radius;
        if (x < margin || x > width - margin || y < minY || y > maxY) continue;
        if (placed.every(([px, py]) => Math.hypot(x - px, y - py) >= MINIMUM_SPACING)) {
          best = [x, y];
          found = true;
          break;
        }
      }
    }
    if (!found) {
      const grid = arrangeOnGrid(anchors, { minX: margin, maxX: width - margin, minY, maxY });
      if (grid) return grid;
    }
    positions[anchor.id] = best;
    placed.push(best);
  }
  return positions;
}

/** Project only finite anchors inside the camera depth range and visible scene edges. */
export function projectHotspotAnchors(
  anchors: { id: string; world: Vector3 }[],
  camera: Camera,
  size: { width: number; height: number },
): ScreenAnchor[] {
  const projected = new Vector3();
  return anchors.flatMap((anchor) => {
    projected.copy(anchor.world).project(camera);
    if (
      ![projected.x, projected.y, projected.z].every(Number.isFinite) ||
      projected.z < -1 ||
      projected.z > 1
    )
      return [];
    const x = ((projected.x + 1) * size.width) / 2;
    const y = ((1 - projected.y) * size.height) / 2;
    return x >= -24 && x <= size.width + 24 && y >= -24 && y <= size.height + 24
      ? [{ id: anchor.id, x, y }]
      : [];
  });
}
