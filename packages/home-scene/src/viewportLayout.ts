export type ViewportLayout = 'mobile-portrait' | 'mobile-landscape' | 'tablet-portrait' | 'tablet-landscape';

/** Choose one of the three supported layouts, or the phone rotation prompt.
 * These are viewport classes, not user-agent or physical-device detection.
 */
export function resolveViewportLayout(width: number, height: number, embedded = false): ViewportLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'mobile-portrait';
  // The native masthead and navigation occupy up to 120px outside the scene.
  // Include that space when classifying the device, so a short tablet pane is not a phone.
  const deviceHeight = height + (embedded ? 120 : 0);
  if (width > deviceHeight) return deviceHeight < 600 && width < 1024 ? 'mobile-landscape' : 'tablet-landscape';
  return width < 600 ? 'mobile-portrait' : 'tablet-portrait';
}

/** Keyboard height changes must not replace a form with a rotation message. */
export interface ViewportMeasurement {
  width: number;
  height: number;
  layout: ViewportLayout;
  keyboardBaselineHeight: number | null;
}

/** Hold a form's layout through keyboard closing; a real width change releases it. */
export function resolveViewportResize(width: number, height: number, previous: ViewportMeasurement, editing: boolean, embedded = false): ViewportMeasurement {
  const sameWidth = Math.abs(width - previous.width) < 2;
  const baseline = previous.keyboardBaselineHeight ?? previous.height;
  const keyboardOpening = editing && height < baseline - 80;
  // Browser bars can consume a few pixels after dismissal, so recovery has a
  // small allowance while a keyboard-sized height reduction remains protected.
  const keyboardClosing = previous.keyboardBaselineHeight !== null && height < baseline - 40;
  const protectedForm = sameWidth && previous.layout !== 'mobile-landscape' && (keyboardOpening || keyboardClosing);
  return {
    width, height,
    layout: protectedForm ? previous.layout : resolveViewportLayout(width, height, embedded),
    keyboardBaselineHeight: protectedForm ? baseline : null,
  };
}
