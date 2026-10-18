import { describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { getCapabilities } from './deviceCapabilities';
import { createDefaultSimulationSnapshot } from './simulationBridgeProtocol';
import { readTvRemoteState, TV_SOURCE_OPTIONS, tvRemoteActionId, type TvRemoteKey } from './tvRemote';

describe('shared TV remote model', () => {
  it('maps every visible command to an existing allowlisted action', () => {
    const keys: TvRemoteKey[] = ['up', 'down', 'left', 'right', 'select', 'home', 'back', 'playPause',
      'rewind', 'forward', 'previous', 'next', 'channelUp', 'channelDown', 'volumeUp', 'volumeDown'];
    const actionIds = getCapabilities('tv').filter((capability) => capability.type === 'action').map((capability) => capability.id);
    expect(new Set(keys.map(tvRemoteActionId)).size).toBe(keys.length);
    for (const key of keys) expect(actionIds).toContain(tvRemoteActionId(key));
    expect(tvRemoteActionId('playPause')).toBe('tv-play-pause');
    expect(tvRemoteActionId('volumeUp')).toBe('tv-volume-up');
  });

  it('shares exactly the validated source options instead of inventing unsupported inputs', () => {
    const source = getCapabilities('tv').find((capability) => 'field' in capability && capability.field === 'source');
    expect(source?.type).toBe('enum');
    if (source?.type !== 'enum') throw new Error('Expected a TV source selector');
    expect(source.options.map((option) => option.value)).toEqual(TV_SOURCE_OPTIONS);
  });

  it('reads sparse persisted defaults and suppresses playback when the TV is off', () => {
    const device = getDevice('family-tv')!;
    const state = createDefaultSimulationSnapshot().deviceStates[device.id];
    expect(readTvRemoteState(device, { ...state, on: false, settings: undefined })).toEqual({
      on: false, volume: 30, muted: false, channel: 1, source: 'Live TV', playing: false,
      positionSec: 0, track: 1, focus: 5, selection: 0,
    });
    const saved = { ...state, on: true, settings: { volume: 65, muted: true, channel: 13, source: 'Netflix',
      playbackState: 'playing', playbackPositionSec: 70, trackIndex: 4, remoteFocus: 9, remoteSelection: 9 } };
    expect(readTvRemoteState(device, saved)).toEqual({ on: true, volume: 65, muted: true, channel: 13,
      source: 'Netflix', playing: true, positionSec: 70, track: 4, focus: 9, selection: 9 });
    expect(readTvRemoteState(device, { ...saved, on: false }).playing).toBe(false);
  });
});
