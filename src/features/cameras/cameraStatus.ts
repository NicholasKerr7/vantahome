import type { Device } from '../../store/useHomeStore';

/** A recent telemetry report is distinct from successful video playback. */
export const CAMERA_REPORT_MAX_AGE_MS = 5 * 60_000;

/** Never interpret a persisted power flag, missing timestamp, or future date as connectivity. */
export function cameraStatus(camera: Pick<Device, 'isOn' | 'lastSeenAt'> | undefined, now = Date.now()) {
  const timestamp = camera?.lastSeenAt;
  const age = typeof timestamp === 'number' ? now - timestamp : Infinity;
  const fresh = Number.isFinite(age) && age >= 0 && age <= CAMERA_REPORT_MAX_AGE_MS;
  const powered = Boolean(camera?.isOn);
  return { powered, fresh, label: !fresh ? 'Status unverified' : powered ? 'Reported on' : 'Reported off' };
}
