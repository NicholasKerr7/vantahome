/** Fit the complete floor across a tall portrait canvas as well as a wide tablet. */
export function getOverviewDistanceScale(width: number, height: number): number {
  const aspect = Math.max(0.1, width / Math.max(1, height));
  const base = width < 720 ? 1.18 : 1;
  return Math.max(base, 1.45 / aspect);
}
