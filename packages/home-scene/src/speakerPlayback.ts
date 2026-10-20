import type { DeviceState } from './simulationTypes';

export type SpeakerPlayback = 'playing' | 'paused' | 'stopped' | 'unavailable';

/** Treat power as authoritative while retaining a stopped default and visibly unknown input. */
export function readSpeakerPlayback(state: DeviceState): SpeakerPlayback {
  const playback = state.settings?.playbackState ?? 'stopped';
  if (playback !== 'playing' && playback !== 'paused' && playback !== 'stopped') return 'unavailable';
  return !state.on && playback === 'playing' ? 'paused' : playback;
}

/** Describe the current simulation without claiming audible playback or a real music stream. */
export function speakerPlaybackStatus(state: DeviceState, volume: number, muted: boolean): string {
  if (!state.on) return 'Off';
  const playback = readSpeakerPlayback(state);
  if (playback === 'playing') {
    if (muted) return 'Muted';
    return volume === 0 ? 'Silent preview' : 'Playing preview';
  }
  if (playback === 'paused') return 'Paused';
  return playback === 'stopped' ? 'Ready' : 'Playback unavailable';
}
