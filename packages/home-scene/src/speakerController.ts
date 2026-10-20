import type { DeviceDefinition } from './data';
import { deviceStatus, getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState, SettingValue } from './simulationTypes';
import { readSpeakerPlayback, type SpeakerPlayback } from './speakerPlayback';

/** Sources and sound profiles are existing saved preferences, not connected media providers. */
export const SPEAKER_SOURCE_OPTIONS = [
  { label: 'Spotify', value: 'Spotify' },
  { label: 'AirPlay', value: 'AirPlay' },
  { label: 'Bluetooth', value: 'Bluetooth' },
  { label: 'AUX', value: 'AUX' },
  { label: 'TV', value: 'TV' },
] as const;
export const SPEAKER_PRESET_OPTIONS = [
  { label: 'Flat', value: 'Flat' },
  { label: 'Warm', value: 'Warm' },
  { label: 'Bright', value: 'Bright' },
  { label: 'Bass', value: 'Bass' },
  { label: 'Vocal', value: 'Vocal' },
] as const;
export const SPEAKER_VOLUME_BOUNDS = { min: 0, max: 100, step: 5 } as const;
export type SpeakerSource = typeof SPEAKER_SOURCE_OPTIONS[number]['value'];
export type SpeakerPreset = typeof SPEAKER_PRESET_OPTIONS[number]['value'];
export type { SpeakerPlayback } from './speakerPlayback';

const SPEAKER_ACTIONS = {
  volumeUp: 'speaker-volume-up',
  volumeDown: 'speaker-volume-down',
  playPause: 'speaker-play-pause',
  previous: 'speaker-previous',
  next: 'speaker-next',
} as const;
export type SpeakerControllerKey = keyof typeof SPEAKER_ACTIONS;

/** Playback remains a local preview; track numbers are samples without fabricated media metadata. */
export interface SpeakerControllerState {
  readonly on: boolean;
  readonly volume: number;
  readonly muted: boolean;
  readonly playing: boolean;
  readonly playback: SpeakerPlayback;
  readonly status: string;
  readonly source: SpeakerSource;
  readonly preset: SpeakerPreset;
  readonly trackIndex: number | null;
  readonly spatial: boolean;
  readonly night: boolean;
}

/** Resolve stable catalog actions so rapid presses use the latest authoritative simulation state. */
export function speakerControllerActionId(key: SpeakerControllerKey): typeof SPEAKER_ACTIONS[SpeakerControllerKey] {
  return SPEAKER_ACTIONS[key];
}

/** Bound saved controls through their existing schema and fall back to established catalog defaults. */
function readPreference(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  return (capability && validateSetting(capability, readDeviceSetting(device, state, field)))
    ?? readDeviceSetting(device, { on: state.on, level: state.level }, field);
}

/** Project one speaker without a playback clock, provider connection or actual audio output. */
export function readSpeakerControllerState(device: DeviceDefinition, state: DeviceState): SpeakerControllerState | null {
  if (device.kind !== 'speaker') return null;
  const playback = readSpeakerPlayback(state);
  const source = readPreference(device, state, 'speakerSource');
  const preset = readPreference(device, state, 'speakerPreset');
  const trackIndex = readDeviceSetting(device, state, 'trackIndex');
  return {
    on: state.on,
    volume: Number(readPreference(device, state, 'volume')),
    muted: readPreference(device, state, 'muted') === true,
    playing: state.on && playback === 'playing',
    playback,
    status: deviceStatus(device, state),
    source: SPEAKER_SOURCE_OPTIONS.find((option) => option.value === source)?.value ?? 'Spotify',
    preset: SPEAKER_PRESET_OPTIONS.find((option) => option.value === preset)?.value ?? 'Warm',
    trackIndex: typeof trackIndex === 'number' && Number.isInteger(trackIndex) && trackIndex >= 1 && trackIndex <= 99 ? trackIndex : null,
    spatial: readPreference(device, state, 'spatialAudio') === true,
    night: readPreference(device, state, 'nightMode') === true,
  };
}
