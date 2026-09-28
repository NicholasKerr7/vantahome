import type { Vector3 } from 'three';

const ORBIT_SPEED = 0.018;
const ORBIT_ARC = Math.PI / 24;
const ACCELERATION_SECONDS = 2.4;
const MAX_FRAME_SECONDS = 0.08;

/** Keep the fitted property inside its margin with a slow, smoothly reversing presentation arc. */
function cinematicAngle(elapsed: number): number {
  const phase = ORBIT_SPEED / ORBIT_ARC * (
    elapsed + ACCELERATION_SECONDS * Math.expm1(-elapsed / ACCELERATION_SECONDS)
  );
  return ORBIT_ARC * Math.sin(phase);
}

/** Restrict automated motion to visible, active overview cameras with motion allowed. */
export function canPlayCinematic(
  view: string,
  reducedMotion: boolean,
  suspended: boolean,
  hidden: boolean,
): boolean {
  return view !== 'immersive' && !reducedMotion && !suspended && !hidden;
}

/** Integrate a gentle start without changing the user's distance, height, or orbit target. */
export function advanceCinematicOrbit(
  position: Vector3,
  target: Vector3,
  elapsed: number,
  delta: number,
): number {
  if (!Number.isFinite(delta) || delta <= 0) return elapsed;
  const next = elapsed + Math.min(delta, MAX_FRAME_SECONDS);
  const angle = cinematicAngle(next) - cinematicAngle(elapsed);
  const x = position.x - target.x;
  const z = position.z - target.z;
  position.x = target.x + x * Math.cos(angle) + z * Math.sin(angle);
  position.z = target.z + z * Math.cos(angle) - x * Math.sin(angle);
  return next;
}

/** Let the explicit playback control own its click instead of restarting a cancelled toggle. */
function isPlaybackControl(event: Event): boolean {
  if (event.type === 'wheel') return false;
  if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes((event as KeyboardEvent).key)) return false;
  const target = event.target as Element | null;
  return Boolean(target?.closest?.('[data-cinematic-control="true"]'));
}

/** Cancel on deliberate input or backgrounding, without intercepting any input itself. */
export function bindCinematicInterruptions(
  page: Document,
  stop: () => void,
): () => void {
  /** End playback before controls process a drag, zoom, button, or keyboard action. */
  function interrupt(event: Event) {
    if (!isPlaybackControl(event)) stop();
  }
  /** Backgrounding is a stop, so returning to the app never restarts an unattended orbit. */
  function visibilityChanged() {
    if (page.hidden) stop();
  }
  const options = { capture: true, passive: true };
  page.addEventListener('pointerdown', interrupt, options);
  page.addEventListener('wheel', interrupt, options);
  page.addEventListener('keydown', interrupt, options);
  page.addEventListener('visibilitychange', visibilityChanged);
  return () => {
    page.removeEventListener('pointerdown', interrupt, options);
    page.removeEventListener('wheel', interrupt, options);
    page.removeEventListener('keydown', interrupt, options);
    page.removeEventListener('visibilitychange', visibilityChanged);
  };
}
