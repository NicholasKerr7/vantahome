import solarCorners from '../solar-corners.json';

type VectorTuple = [number, number, number];

/** World-space lamp positions and aim shared by both comparison renderers. */
export interface SolarLightRig {
  id: string;
  position: VectorTuple;
  target: VectorTuple;
  direction: VectorTuple;
}

export const SOLAR_LIGHT_CONE: [number, number] = [0.01, 0.88];
export const SOLAR_LIGHT_RADIUS = 9;

/** Rotate local Y-up lamp coordinates, then convert the surveyed Blender anchor. */
function worldPosition(local: VectorTuple, anchor: number[], rotationY: number): VectorTuple {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return [
    anchor[0] + local[0] * cosine + local[2] * sine,
    anchor[2] + local[1],
    -anchor[1] - local[0] * sine + local[2] * cosine,
  ];
}

// Emit just below the catalog diffuser; aim a little inward, as in SolarLightPools.
export const SOLAR_LIGHT_RIG: SolarLightRig[] = solarCorners.corners.map((corner) => {
  const position = worldPosition([0, 3.868, -0.45], corner.positionBlender, corner.rotationY);
  const target = worldPosition([0, 0.02, -0.95], corner.positionBlender, corner.rotationY);
  const offset = target.map((value, index) => value - position[index]) as VectorTuple;
  const length = Math.hypot(...offset);
  const direction = offset.map((value) => value / length) as VectorTuple;
  return { id: corner.id, position, target, direction };
});
