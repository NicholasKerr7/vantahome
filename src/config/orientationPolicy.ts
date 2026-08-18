export type DeviceFamily = "phone" | "tablet" | "other" | "unknown";

type ScreenSize = {
  width: number;
  height: number;
};

const TABLET_FALLBACK_MIN_EDGE = 600;

export function shouldLockPhonePortrait(
  deviceFamily: DeviceFamily,
  screenSize: ScreenSize,
) {
  if (deviceFamily === "phone") return true;
  if (deviceFamily === "tablet" || deviceFamily === "other") return false;

  // Device classification can be unavailable during early native startup.
  // The shortest physical screen edge provides a stable fallback in either orientation.
  return Math.min(screenSize.width, screenSize.height) < TABLET_FALLBACK_MIN_EDGE;
}
