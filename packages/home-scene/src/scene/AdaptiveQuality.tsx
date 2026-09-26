import { useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import {
  initialRenderQuality,
  updateRenderQuality,
  type PerformanceSignal,
  type RenderQualityTier,
} from './renderQuality';

/** Adapt after measured performance windows without permanently disabling recovery. */
export function AdaptiveQuality({ onChange }: { onChange: (tier: RenderQualityTier) => void }) {
  const quality = useRef(initialRenderQuality());

  /** Keep sampling counters outside React; only a visible quality change rerenders. */
  function sample(signal: PerformanceSignal) {
    const previous = quality.current;
    const next = updateRenderQuality(previous, signal);
    quality.current = next;
    if (next.tier !== previous.tier) onChange(next.tier);
  }

  // Drei counts every incline/decline as a flip, including repeated good windows.
  // Its default unlimited sampling lets a device recover after a temporary slowdown.
  return <PerformanceMonitor
    bounds={() => [32, 52]}
    onIncline={() => sample('healthy')}
    onDecline={() => sample('strained')}
  />;
}
