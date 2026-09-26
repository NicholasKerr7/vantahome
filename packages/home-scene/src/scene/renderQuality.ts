export type RenderQualityTier = 'economy' | 'balanced' | 'high';
export type PerformanceSignal = 'healthy' | 'strained';

export interface RenderQualityState {
  tier: RenderQualityTier;
  recoveryWindows: number;
}

export const RENDER_QUALITY = {
  economy: { maxDpr: 1, shadowMapSize: 1024 },
  balanced: { maxDpr: 1.25, shadowMapSize: 1024 },
  high: { maxDpr: 1.65, shadowMapSize: 2048 },
} as const;

const TIERS: readonly RenderQualityTier[] = ['economy', 'balanced', 'high'];
const RECOVERY_WINDOWS = 4;

/** Start with the authored appearance; measured frame rate can lower the cost. */
export function initialRenderQuality(): RenderQualityState {
  return { tier: 'high', recoveryWindows: 0 };
}

/** Lower cost promptly, but require several healthy windows before restoring detail. */
export function updateRenderQuality(
  current: RenderQualityState,
  signal: PerformanceSignal,
): RenderQualityState {
  const index = TIERS.indexOf(current.tier);
  if (signal === 'strained') {
    const tier = TIERS[Math.max(0, index - 1)]!;
    return tier === current.tier && current.recoveryWindows === 0
      ? current
      : { tier, recoveryWindows: 0 };
  }
  // Repeated healthy windows at maximum detail never trigger a fallback.
  if (current.tier === 'high') return current;
  const recoveryWindows = current.recoveryWindows + 1;
  return recoveryWindows < RECOVERY_WINDOWS
    ? { ...current, recoveryWindows }
    : { tier: TIERS[index + 1]!, recoveryWindows: 0 };
}
