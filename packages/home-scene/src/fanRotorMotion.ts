/** A finite decorative transition in radians per second; it never changes device state. */
export interface FanRotorSegment {
  readonly fromVelocity: number;
  readonly toVelocity: number;
  readonly durationMs: number;
  readonly turns: number;
}

/** Integrate a linear velocity ramp once so both renderers follow the same angular travel. */
function segment(fromVelocity: number, toVelocity: number, durationMs: number): FanRotorSegment {
  return { fromVelocity, toVelocity, durationMs, turns: (fromVelocity + toVelocity) * durationMs / (4000 * Math.PI) };
}

/** Ease a ceiling fan to its next speed, with a short complete rest before reversing. */
export function planFanRotorTransition(from: number, to: number): readonly FanRotorSegment[] {
  const start = Number.isFinite(from) ? from : 0;
  const end = Number.isFinite(to) ? to : 0;
  if (Math.abs(start - end) < 0.00001) return [];
  if (start * end < 0) return [segment(start, 0, 420), segment(0, 0, 80), segment(0, end, 500)];
  return [segment(start, end, start === 0 ? 500 : end === 0 ? 420 : 360)];
}

/** Read the velocity of a bounded transition, including its stationary reversal interval. */
export function fanRotorTransitionVelocity(segments: readonly FanRotorSegment[], elapsedMs: number): number {
  let remaining = Math.max(0, elapsedMs);
  for (const step of segments) {
    if (remaining < step.durationMs) return step.fromVelocity + (step.toVelocity - step.fromVelocity) * remaining / step.durationMs;
    remaining -= step.durationMs;
  }
  return segments.at(-1)?.toVelocity ?? 0;
}

/** Convert a linear velocity ramp into a normalized native-driver position easing curve. */
export function fanRotorSegmentProgress(step: FanRotorSegment, progress: number): number {
  const value = Math.max(0, Math.min(1, progress));
  const mean = (step.fromVelocity + step.toVelocity) / 2;
  if (mean === 0) return value;
  return (step.fromVelocity * value + (step.toVelocity - step.fromVelocity) * value * value / 2) / mean;
}
