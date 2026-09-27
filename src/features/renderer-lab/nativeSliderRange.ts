// Fabric recycles UISlider views, but this SDK skips props equal to its defaults
// (minimum0, maximum1, value0). Non-default fixed bounds and a positive value force
// every recycled view to synchronize, including a logically closed gate at0%.
export const NATIVE_SLIDER_MIN = 1;
export const NATIVE_SLIDER_MAX = 101;
const NATIVE_SPAN = NATIVE_SLIDER_MAX - NATIVE_SLIDER_MIN;

/** Convert logical units to a fixed native domain without ever sending default value zero. */
export function toNativeSliderValue(value: number, min: number, max: number): number {
  const fraction = max > min && Number.isFinite(value) ? (value - min) / (max - min) : 0;
  return NATIVE_SLIDER_MIN + Math.max(0, Math.min(1, fraction)) * NATIVE_SPAN;
}

/** Preserve each control's discrete logical steps while UIKit keeps constant bounds. */
export function nativeSliderStep(min: number, max: number, step: number): number {
  return max > min && step > 0 ? Math.min(NATIVE_SPAN, step / (max - min) * NATIVE_SPAN) : NATIVE_SPAN;
}

/** Translate drag and accessibility changes back to bounded, rounded catalog units. */
export function fromNativeSliderValue(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value) || max <= min) return min;
  const fraction = Math.max(0, Math.min(1, (value - NATIVE_SLIDER_MIN) / NATIVE_SPAN));
  const increment = step > 0 ? step : 1;
  const logical = min + Math.round(fraction * (max - min) / increment) * increment;
  return Math.max(min, Math.min(max, Number(logical.toFixed(8))));
}
