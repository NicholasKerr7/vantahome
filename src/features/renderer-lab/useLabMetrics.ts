import { useCallback, useEffect, useRef } from 'react';
import { useRunOnJS, useSharedValue } from 'react-native-worklets-core';
import { summarizeIntervals, type LabSurfaceProps } from './protocol';

/** Collect bounded render intervals and transfer independent snapshots to the UI. */
export function useLabMetrics({ settings, onEvent, ready }: LabSurfaceProps & { ready: boolean }) {
  const mounted = useRef(true);
  const samples = useSharedValue<number[]>([]);
  const elapsed = useSharedValue(0);
  const warmup = useSharedValue(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    // Match the web collector's one-second warm-up after every test-case change.
    samples.value = [];
    elapsed.value = 0;
    warmup.value = 0;
  }, [settings, samples, elapsed, warmup]);

  const report = useRunOnJS((intervals: number[]) => {
    if (!mounted.current) return;
    const metrics = summarizeIntervals(intervals);
    if (metrics) onEvent({ type: 'metrics', ...metrics });
  }, [onEvent]);

  return useCallback((seconds: number) => {
    'worklet';
    if (!ready || seconds <= 0 || !Number.isFinite(seconds)) return;
    warmup.value += seconds;
    if (warmup.value < 1) return;
    samples.value.push(seconds * 1000);
    elapsed.value += seconds;
    if (elapsed.value >= 2 || samples.value.length >= 600) {
      // Same-type assignment reuses WorkletsCore's array wrapper. Passing that
      // wrapper would clear the pending report when we reset the sample window.
      report(Array.from(samples.value));
      samples.value = [];
      elapsed.value = 0;
    }
  }, [ready, warmup, samples, elapsed, report]);
}
