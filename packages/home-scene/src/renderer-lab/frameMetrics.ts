import { postLabMessage } from './contracts';
import { summarizeIntervals } from '../../../../src/features/renderer-lab/protocol';

/** Sample presentation-callback intervals, excluding loading, pauses, and warm-up. */
export class FrameMetrics {
  private previous = 0;
  private start = 0;
  private warmUntil = 0;
  private samples: number[] = [];

  /** Discard the previous window whenever a scene, lifecycle, or test setting changes. */
  reset(now = performance.now()): void {
    this.previous = 0;
    this.start = now + 1000;
    this.warmUntil = now + 1000;
    this.samples = [];
  }

  /** Publish two-second windows; these are callback timings, never measured GPU times. */
  record(now: number): void {
    const elapsed = this.previous ? now - this.previous : 0;
    this.previous = now;
    if (now < this.warmUntil || elapsed <= 0) return;
    this.samples.push(elapsed);
    if (now - this.start < 2000 || this.samples.length < 2) return;
    const summary = summarizeIntervals(this.samples);
    if (summary) postLabMessage({ type: 'metrics', ...summary });
    this.samples = [];
    this.start = now;
  }
}
