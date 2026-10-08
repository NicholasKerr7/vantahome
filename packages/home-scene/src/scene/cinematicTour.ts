import siteLayout from '../site-layout.json';
import type { SitePoint3 } from './siteGeometry';

export const CINEMATIC_TOUR_DURATION = 84;
export const CINEMATIC_MAX_FRAME_SECONDS = 0.08;
export type CinematicTourShot = 'arrival' | 'driveway' | 'crane' | 'overhead' | 'east' | 'hero' | 'return';

export interface CinematicTourFrame {
  active: boolean;
  elapsed: number;
  eye: SitePoint3;
  target: SitePoint3;
  fov: number;
  gateOpen: number;
  chapter: string;
  shot: CinematicTourShot;
}

interface TourKeyframe {
  time: number;
  eye: SitePoint3;
  target: SitePoint3;
  fov: number;
  width: number;
  chapter: string;
  shot: CinematicTourShot;
}

const gateX = siteLayout.runtime.gate.position[0];
const gateZ = siteLayout.runtime.gate.position[2];
const parcelCenterX = (Math.min(...siteLayout.parcel.vertices.map(([x]) => x)) + Math.max(...siteLayout.parcel.vertices.map(([x]) => x))) / 2;
const parcelCenterZ = -(Math.min(...siteLayout.parcel.vertices.map(([, north]) => north)) + Math.max(...siteLayout.parcel.vertices.map(([, north]) => north))) / 2;
const arrival = { eye: [gateX, 2.2, gateZ - 13.6] as SitePoint3, target: [gateX, 1.05, gateZ] as SitePoint3, fov: 50, width: 8.8 };

// Each segment stays west, east, south, north, or above the conservative house
// envelope. A smooth bounded interpolation never overshoots through the walls.
const KEYFRAMES: readonly TourKeyframe[] = [
  { time: 0, ...arrival, chapter: 'The arrival', shot: 'arrival' },
  { time: 6, eye: [gateX, 2.15, gateZ - 9.5], target: [gateX, 1.05, gateZ], fov: 50, width: 7.8, chapter: 'The arrival', shot: 'arrival' },
  { time: 11, eye: [-9.6, 2.15, -25.3], target: [-6.8, 1.55, -18.5], fov: 48, width: 0, chapter: 'Welcome home', shot: 'driveway' },
  { time: 16, eye: [-8.15, 2.25, -20.5], target: [-3.4, 1.8, -13.6], fov: 46, width: 0, chapter: 'Welcome home', shot: 'driveway' },
  { time: 24, eye: [-4.3, 2.6, -10], target: [3.2, 2.2, -9], fov: 43, width: 0, chapter: 'An architectural reveal', shot: 'crane' },
  { time: 34, eye: [-7.5, 12.5, -2.8], target: [7.8, 2.3, -8], fov: 42, width: 23, chapter: 'A different perspective', shot: 'overhead' },
  { time: 41, eye: [parcelCenterX, 58, parcelCenterZ + 7], target: [parcelCenterX, 0.4, parcelCenterZ], fov: 46, width: 54, chapter: 'A different perspective', shot: 'overhead' },
  { time: 46, eye: [15, 32, -12], target: [9, 1, -7.5], fov: 43, width: 33, chapter: 'Considered from every angle', shot: 'east' },
  { time: 57, eye: [27, 9, -9], target: [13.5, 3, -7.5], fov: 36, width: 0, chapter: 'The art of coming home', shot: 'hero' },
  { time: 64, eye: [25, 6.8, 9], target: [9, 3, -6], fov: 36, width: 21, chapter: 'The art of coming home', shot: 'hero' },
  { time: 71, eye: [-9, 8, 7], target: [8, 2.3, -7], fov: 38, width: 32, chapter: 'Your private retreat', shot: 'return' },
  { time: 78, eye: [-20, 11, -26], target: [1, 1.4, -11], fov: 43, width: 28, chapter: 'Your private retreat', shot: 'return' },
  { time: CINEMATIC_TOUR_DURATION, ...arrival, chapter: 'The arrival', shot: 'arrival' },
];

/** Normalize an elapsed presentation clock without propagating invalid frame values. */
function loopTime(time: number): number {
  return Number.isFinite(time) && time > 0 ? time % CINEMATIC_TOUR_DURATION : 0;
}

/** Ease a shot to rest with continuous velocity and acceleration at its boundaries. */
function smootherStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, t * t * t * (t * (t * 6 - 15) + 10)));
}

/** Gate motion is presentation-only: open before crossing, close once the camera is well clear. */
export function getCinematicGateOpen(time: number): number {
  const elapsed = loopTime(time);
  if (elapsed < 10) return smootherStep((elapsed - 4) / 6);
  if (elapsed <= 62) return 1;
  return 1 - smootherStep((elapsed - 62) / 7);
}

/** Allocate one mutable presentation sample per canvas, never one per animation frame. */
export function createCinematicTourFrame(): CinematicTourFrame {
  return { active: false, elapsed: 0, eye: [...arrival.eye], target: [...arrival.target], fov: arrival.fov, gateOpen: 0, chapter: 'The arrival', shot: 'arrival' };
}

/** Sample an authored exterior camera path; supplying output avoids per-frame allocations. */
export function sampleCinematicTour(time: number, aspect: number, output = createCinematicTourFrame()): CinematicTourFrame {
  const elapsed = loopTime(time);
  let index = 0;
  while (index < KEYFRAMES.length - 2 && elapsed >= KEYFRAMES[index + 1].time) index += 1;
  const from = KEYFRAMES[index];
  const to = KEYFRAMES[index + 1];
  const blend = smootherStep((elapsed - from.time) / (to.time - from.time));
  for (let axis = 0; axis < 3; axis += 1) {
    output.eye[axis] = from.eye[axis] + (to.eye[axis] - from.eye[axis]) * blend;
    output.target[axis] = from.target[axis] + (to.target[axis] - from.target[axis]) * blend;
  }
  output.fov = from.fov + (to.fov - from.fov) * blend;
  const width = from.width + (to.width - from.width) * blend;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? Math.max(0.3, Math.min(3, aspect)) : 1;
  const x = output.eye[0] - output.target[0];
  const y = output.eye[1] - output.target[1];
  const z = output.eye[2] - output.target[2];
  const distance = Math.hypot(x, y, z);
  const fittedDistance = width * 1.06 / (2 * Math.tan(output.fov * Math.PI / 360) * safeAspect);
  if (fittedDistance > distance) {
    const scale = fittedDistance / distance;
    output.eye[0] = output.target[0] + x * scale;
    output.eye[1] = output.target[1] + y * scale;
    output.eye[2] = output.target[2] + z * scale;
  }
  output.active = true;
  output.elapsed = elapsed;
  output.gateOpen = getCinematicGateOpen(elapsed);
  output.chapter = from.chapter;
  output.shot = from.shot;
  return output;
}

/** Advance the shared camera/gate clock with bounded frame time after interruptions. */
export function advanceCinematicTour(frame: CinematicTourFrame, delta: number, aspect: number): CinematicTourFrame {
  const step = Number.isFinite(delta) && delta > 0 ? Math.min(delta, CINEMATIC_MAX_FRAME_SECONDS) : 0;
  return sampleCinematicTour(frame.elapsed + step, aspect, frame);
}
