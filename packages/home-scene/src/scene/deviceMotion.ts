/** Keep opening poses consistent with the portable Blender fixture builder. */
export function openingFraction(level: number): number {
  return Number.isFinite(level) ? Math.max(0, Math.min(1, level / 100)) : 0;
}

/** Compress the shutter toward its headbox without collapsing the mesh to zero. */
export function shutterPose(height: number, fraction: number) {
  const scale = Math.max(0.018, 1 - fraction);
  return { scale, rise: height * (1 - scale) };
}
