import { PerspectiveCamera, Vector3, type Camera } from 'three';

interface CameraFraming {
  position: Vector3;
  target: Vector3;
  direction: Vector3;
  fov: number;
}

/** Allocate reusable camera samples outside the animation loop. */
function createFraming(): CameraFraming {
  return { position: new Vector3(), target: new Vector3(), direction: new Vector3(0, 0, -1), fov: 42 };
}

/** Compare framing with a tighter return tolerance so the contextual action does not flicker. */
function framingDiffers(current: CameraFraming, baseline: CameraFraming, immersive: boolean, returning: boolean, includeLens: boolean): boolean {
  const tolerance = returning ? 0.5 : 1;
  const angleLimit = Math.cos(3 * tolerance * Math.PI / 180);
  if (current.direction.dot(baseline.direction) < angleLimit) return true;
  if (includeLens && Math.abs(current.fov - baseline.fov) > 2 * tolerance) return true;
  if (immersive) return false;
  const baselineDistance = baseline.position.distanceTo(baseline.target);
  const panLimit = Math.max(0.12, baselineDistance * 0.02) * tolerance;
  if (current.target.distanceToSquared(baseline.target) > panLimit * panLimit) return true;
  const currentDistance = current.position.distanceTo(current.target);
  return Math.abs(currentDistance - baselineDistance) > baselineDistance * 0.05 * tolerance;
}

/** Track only deliberate camera displacement, independently of navigation and tour return destinations. */
export class CameraRecenterTracker {
  private readonly baseline = createFraming();
  private readonly manualOrigin = createFraming();
  private readonly current = createFraming();
  private baselineReady = false;
  private manualPending = false;
  private manualMoved = false;
  private gestureActive = false;
  private visible = false;

  /** Inject the visibility boundary without coupling camera math to React or the application store. */
  constructor(private readonly publish: (visible: boolean) => void) {}

  /** Remember the authored default before its camera transition starts. */
  setDefault(position: Vector3, target: Vector3, fov: number): void {
    this.baseline.position.copy(position);
    this.baseline.target.copy(target);
    this.baseline.direction.subVectors(target, position).normalize();
    this.baseline.fov = fov;
    this.baselineReady = true;
    this.clear();
  }

  /** Forget manual intent immediately on reset/navigation without allocating another sample. */
  clear(): void {
    this.manualPending = false;
    this.manualMoved = false;
    this.gestureActive = false;
    this.setVisible(false);
  }

  /** Capture a gesture's origin; pressing an unmoved canvas must not expose an action. */
  beginManual(camera: Camera, target: Vector3): void {
    // Retain the first origin so short wheel/pinch steps accumulate into useful intent.
    if (!this.manualPending) this.read(camera, target, this.manualOrigin);
    this.manualPending = true;
    this.gestureActive = true;
  }

  /** Defer the first action reveal until the user releases the gesture or held key. */
  endManual(): void {
    this.gestureActive = false;
  }

  /** Sample after camera motion, publishing only meaningful visibility transitions. */
  sample(camera: Camera, target: Vector3, immersive: boolean): void {
    if (!this.baselineReady || (!this.manualPending && !this.manualMoved)) return;
    this.read(camera, target, this.current);
    // Automatic lens settling after a navigation cut is not a manual zoom gesture.
    if (this.manualPending && !this.manualMoved && framingDiffers(this.current, this.manualOrigin, immersive, false, false)) this.manualMoved = true;
    if (this.manualMoved) {
      const displaced = framingDiffers(this.current, this.baseline, immersive, this.visible, true);
      if (this.visible || !this.gestureActive) this.setVisible(displaced);
    }
  }

  /** Read into an existing sample; no per-frame objects or React state are created. */
  private read(camera: Camera, target: Vector3, output: CameraFraming): void {
    output.position.copy(camera.position);
    output.target.copy(target);
    camera.getWorldDirection(output.direction);
    output.fov = camera instanceof PerspectiveCamera ? camera.fov : 42;
  }

  /** Keep the publishing boundary quiet while damping or animation produces repeated frames. */
  private setVisible(value: boolean): void {
    if (value === this.visible) return;
    this.visible = value;
    this.publish(value);
  }
}
