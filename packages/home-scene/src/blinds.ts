/** Match the primary-suite north window: sill 0.9m, height 1.219m, width 0.914m. */
export const BLINDS_GEOMETRY = {
  slatCount: 20,
  width: 1.025,
  thickness: 0.01,
  depth: 0.075,
  firstSlatHeight: 2.1,
  headrailHeight: 2.43,
  windowBottom: 0.9,
  windowTop: 2.119,
} as const;

/** Clamp positions at the state boundary while retaining smooth animation values. */
export function clampBlindPosition(level: number): number {
  return Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : 0;
}

/** Derive shared status from the actual position rather than a second power switch. */
export function createBlindsState(level: number): { on: boolean; level: number } {
  const position = Math.round(clampBlindPosition(level));
  return { on: position > 0, level: position };
}

/** Lift, flatten and gather the slats above the opening at the fully open endpoint. */
export function getBlindsPose(level: number) {
  const openness = clampBlindPosition(level) / 100;
  const firstOffset = 0.28 * openness;
  const gap = 0.062 + (0.0115 - 0.062) * openness;
  const tilt = (Math.PI / 2) * (1 - openness);
  const bottomOffset = firstOffset - (BLINDS_GEOMETRY.slatCount - 1) * gap - (0.045 - 0.033 * openness);
  return { firstOffset, gap, tilt, bottomOffset };
}
