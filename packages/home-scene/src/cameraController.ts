import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState, SettingValue } from './simulationTypes';

export const CAMERA_SENSITIVITY_BOUNDS = { min: 1, max: 10, step: 1 } as const;
const CAMERA_ACTIONS = {
  snapshot: 'camera-snapshot',
  knownVisitor: 'camera-known-visitor',
  unknownVisitor: 'camera-unknown-visitor',
} as const;
export type CameraControllerKey = keyof typeof CAMERA_ACTIONS;
export type CameraPreviewEventKind = 'none' | 'snapshot' | 'known-visitor' | 'unknown-visitor' | 'unavailable';

/** These are existing local event labels, not captures, visitor identities or remote observations. */
const PREVIEW_EVENTS = [
  { kind: 'none', label: 'No preview events' },
  { kind: 'snapshot', label: 'Simulated snapshot' },
  { kind: 'known-visitor', label: 'Known visitor preview' },
  { kind: 'unknown-visitor', label: 'Unknown visitor preview' },
] as const;

/** A selected camera's simulation state and saved preferences never imply an active media session. */
export interface CameraConsolePresentation {
  readonly armed: boolean;
  readonly status: string;
  readonly recording: boolean;
  readonly nightVision: boolean;
  readonly motionAlerts: boolean;
  readonly micMuted: boolean;
  readonly twoWayAudio: boolean;
  readonly motionSensitivity: number;
  readonly previewEvent: {
    readonly kind: CameraPreviewEventKind;
    readonly label: string;
  };
}

/** Route sample events through the existing guarded reducer without requesting camera or mic access. */
export function cameraControllerActionId(key: CameraControllerKey): typeof CAMERA_ACTIONS[CameraControllerKey] {
  return CAMERA_ACTIONS[key];
}

/** Preserve validated preferences, recovering malformed configuration from the established catalog. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  return (capability && validateSetting(capability, readDeviceSetting(device, state, field)))
    ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Project accepted arming and the last local event without inventing a feed, recording or timestamp. */
export function getCameraConsolePresentation(device: DeviceDefinition, state: DeviceState): CameraConsolePresentation | null {
  if (device.kind !== 'camera') return null;
  const event = readDeviceSetting(device, state, 'cameraPreviewEvent');
  return {
    armed: state.on,
    status: state.on ? 'Armed preview' : 'Disarmed preview',
    recording: readPreference(device, state, 'recording') === true,
    nightVision: readPreference(device, state, 'nightVision') === true,
    motionAlerts: readPreference(device, state, 'motionAlerts') === true,
    micMuted: readPreference(device, state, 'micMuted') === true,
    twoWayAudio: readPreference(device, state, 'twoWayAudio') === true,
    motionSensitivity: Number(readPreference(device, state, 'motionSensitivity')),
    previewEvent: PREVIEW_EVENTS.find(({ label }) => label === event)
      ?? { kind: 'unavailable', label: 'Preview event unavailable' },
  };
}
