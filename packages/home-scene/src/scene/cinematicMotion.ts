/** Allow presentation motion from any admitted view while the canvas is active. */
export function canPlayCinematic(
  reducedMotion: boolean,
  suspended: boolean,
  hidden: boolean,
): boolean {
  return !reducedMotion && !suspended && !hidden;
}
