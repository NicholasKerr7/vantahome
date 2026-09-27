import { isRendererLabEnabled } from '../../../config/rendererLab';
import { parseLabEvent, summarizeIntervals } from '../protocol';

describe('renderer preview boundary', () => {
  test('requires explicit opt-in and cannot be enabled in a hardware release', () => {
    expect(isRendererLabEnabled('true', 'demo')).toBe(true);
    expect(isRendererLabEnabled('true', 'development')).toBe(true);
    expect(isRendererLabEnabled('true', 'alpha')).toBe(false);
    expect(isRendererLabEnabled('true', 'production')).toBe(false);
    expect(isRendererLabEnabled('false', 'demo')).toBe(false);
    expect(isRendererLabEnabled('TRUE', 'demo')).toBe(false);
  });

  test('rejects hardware actions, malformed input, oversized messages and invalid metrics', () => {
    for (const message of [
      '{', 'null', 'x'.repeat(2049), '{"type":"command","device":"gate"}',
      '{"type":"select","device":"lock"}',
      '{"type":"metrics","frames":120,"p50":20,"p95":10,"slowFrames":0}',
      '{"type":"metrics","frames":120,"p50":16,"p95":20,"slowFrames":121}',
      '{"type":"metrics","frames":120.5,"p50":16,"p95":20,"slowFrames":0}',
    ]) expect(parseLabEvent(message)).toBeNull();
    expect(parseLabEvent('{"type":"select","device":"blinds"}')).toEqual({ type: 'select', device: 'blinds' });
    expect(parseLabEvent('{"type":"error","message":"private internal detail"}'))
      .toEqual({ type: 'error', message: 'The comparison scene could not load.' });
  });

  test('reports interval percentiles without confusing callback counts with GPU throughput', () => {
    const samples = [16, 17, 16, 50, 16, Number.NaN, -1, Number.POSITIVE_INFINITY];
    expect(summarizeIntervals(samples)).toEqual({ frames: 5, p50: 16, p95: 50, slowFrames: 1 });
    expect(samples[0]).toBe(16);
    expect(summarizeIntervals([])).toBeNull();
  });
});
