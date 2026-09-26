import { describe, expect, it } from 'vitest';
import { initialRenderQuality, updateRenderQuality, type RenderQualityState } from './renderQuality';

/** Feed distinct measured windows without involving a browser's GPU or refresh rate. */
function healthyWindows(current: RenderQualityState, count: number): RenderQualityState {
  for (let index = 0; index < count; index++) current = updateRenderQuality(current, 'healthy');
  return current;
}

describe('adaptive rendering quality', () => {
  it('keeps full detail after many healthy windows instead of treating them as failures', () => {
    const initial = initialRenderQuality();
    expect(healthyWindows(initial, 100)).toBe(initial);
    expect(initial.tier).toBe('high');
  });

  it('lowers cost one tier at a time and bounds prolonged software rendering slowdowns', () => {
    const balanced = updateRenderQuality(initialRenderQuality(), 'strained');
    expect(balanced.tier).toBe('balanced');
    const economy = updateRenderQuality(balanced, 'strained');
    expect(economy.tier).toBe('economy');
    let current = economy;
    for (let index = 0; index < 100; index++) current = updateRenderQuality(current, 'strained');
    expect(current).toBe(economy);
  });

  it('requires several good windows to raise detail and fully recovers from economy', () => {
    const economy: RenderQualityState = { tier: 'economy', recoveryWindows: 0 };
    expect(healthyWindows(economy, 3).tier).toBe('economy');
    const balanced = healthyWindows(economy, 4);
    expect(balanced).toEqual({ tier: 'balanced', recoveryWindows: 0 });
    expect(healthyWindows(balanced, 4)).toEqual(initialRenderQuality());
  });

  it('discards recovery progress after another sustained slowdown', () => {
    const economy: RenderQualityState = { tier: 'economy', recoveryWindows: 0 };
    const nearlyRecovered = healthyWindows(economy, 3);
    const interrupted = updateRenderQuality(nearlyRecovered, 'strained');
    expect(interrupted).toEqual(economy);
    expect(healthyWindows(interrupted, 1).tier).toBe('economy');
  });

  it('avoids repeatedly raising detail for alternating healthy and strained windows', () => {
    let current = initialRenderQuality();
    for (let index = 0; index < 20; index++) {
      current = updateRenderQuality(current, 'strained');
      current = updateRenderQuality(current, 'healthy');
    }
    expect(current.tier).toBe('economy');
    expect(healthyWindows(current, 8).tier).toBe('high');
  });
});
