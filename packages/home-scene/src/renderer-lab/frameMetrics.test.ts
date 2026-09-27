import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameMetrics } from './frameMetrics';
import type { LabMessage } from './contracts';

afterEach(() => { vi.unstubAllGlobals(); });

describe('comparison frame callback samples', () => {
  it('excludes warm-up, includes visible hitches, and restarts after explicit lifecycle resets', () => {
    const messages: LabMessage[] = [];
    vi.stubGlobal('window', { ReactNativeWebView: { postMessage: (message: string) => messages.push(JSON.parse(message)) } });
    const metrics = new FrameMetrics();
    metrics.reset(0);
    for (let time = 0; time <= 2992; time += 16) metrics.record(time);
    expect(messages).toHaveLength(0);
    metrics.record(3008);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'metrics', p50: 16, p95: 16, slowFrames: 0 });
    metrics.record(10_000);
    metrics.record(10_016);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ type: 'metrics', p95: 6992, slowFrames: 1 });
    metrics.reset(10_000);
    for (let time = 10_016; time <= 12_992; time += 16) metrics.record(time);
    expect(messages).toHaveLength(2);
    metrics.record(13_008);
    expect(messages).toHaveLength(3);
    expect(messages[2]).toMatchObject({ type: 'metrics', p50: 16, p95: 16, slowFrames: 0 });
  });
});
