import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, readDeviceSetting, validateStoredSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
import { SPEAKER_PRESET_OPTIONS, SPEAKER_SOURCE_OPTIONS, SPEAKER_VOLUME_BOUNDS, readSpeakerControllerState, speakerControllerActionId } from './speakerController';

const speaker = getDevice('living-speaker')!;

/** Give each case fresh state and authority, including callbacks captured before permissions change. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Native hydration and browser restoration must preserve the same accepted speaker preferences. */
function expectRetained(state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[speaker.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState();
  browser.deviceStates[speaker.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[speaker.id]).toEqual(state);
  expect(restored.deviceStates[speaker.id]).toEqual(state);
  expect(readSpeakerControllerState(speaker, native!.state.deviceStates[speaker.id])).toEqual(readSpeakerControllerState(speaker, state));
}

describe('shared speaker controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports only speakers and retains the catalog source, sound profile and relative volume contracts', () => {
    expect(readSpeakerControllerState(getDevice('family-tv')!, { on: true, level: 50 })).toBeNull();
    for (const [field, options] of [['speakerSource', SPEAKER_SOURCE_OPTIONS], ['speakerPreset', SPEAKER_PRESET_OPTIONS]] as const) {
      const capability = getCapabilities('speaker').find((item) => 'field' in item && item.field === field);
      expect(capability?.type === 'enum' ? capability.options : null).toEqual(options);
      expect(capability?.configurationOnly).toBe(true);
    }
    expect(getCapabilities('speaker').find((item) => 'field' in item && item.field === 'volume'))
      .toMatchObject({ type: 'range', min: SPEAKER_VOLUME_BOUNDS.min, max: SPEAKER_VOLUME_BOUNDS.max });
    for (const key of ['volumeUp', 'volumeDown', 'playPause', 'previous', 'next'] as const) {
      expect(getCapabilities('speaker').find((item) => item.id === speakerControllerActionId(key))).toMatchObject({ type: 'action' });
    }
    expect(getCapabilities('speaker').find((item) => item.id === speakerControllerActionId('volumeUp')))
      .toMatchObject({ operation: { type: 'increment', field: 'volume', delta: SPEAKER_VOLUME_BOUNDS.step } });
  });

  it('projects known sparse defaults without inventing a track title, duration or active stream', () => {
    expect(readSpeakerControllerState(speaker, { on: false, level: 0 })).toEqual({
      on: false, volume: 28, muted: false, playing: false, playback: 'stopped', status: 'Off',
      source: 'Spotify', preset: 'Warm', trackIndex: 1, spatial: true, night: false,
    });
  });

  it.each([
    [true, 'playing', false, 28, true, 'playing', 'Playing preview'],
    [true, 'playing', true, 28, true, 'playing', 'Muted'],
    [true, 'playing', false, 0, true, 'playing', 'Silent preview'],
    [true, 'paused', true, 28, false, 'paused', 'Paused'],
    [true, 'stopped', false, 28, false, 'stopped', 'Ready'],
    [false, 'playing', false, 28, false, 'paused', 'Off'],
    [false, 'paused', true, 0, false, 'paused', 'Off'],
    [true, 'broken', false, 28, false, 'unavailable', 'Playback unavailable'],
  ] as const)('keeps playback and all status surfaces honest for power %s, state %s, muted %s and volume %s', (on, storedPlayback, muted, volume, playing, playback, status) => {
    const state = { on, level: 20, settings: { playbackState: storedPlayback, muted, volume, lastAction: speakerControllerActionId('playPause') } };
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ playing, playback, status, muted, volume });
    expect(readDeviceSetting(speaker, state, 'playbackState')).toBe(playback);
    expect(deviceStatus(speaker, state)).toBe(status);
    expect(deviceActionFeedback(speaker, state)).toBe(status);
  });

  it('plays, pauses and remembers a paused preference after power cycling', () => {
    let state: DeviceState = { on: false, level: 35, settings: { volume: 41, muted: true, speakerSource: 'AirPlay', speakerPreset: 'Bass' } };
    state = runDeviceActionState(speaker.id, state, speakerControllerActionId('playPause'));
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: true, playing: true, status: 'Muted', volume: 41 });
    state = runDeviceActionState(speaker.id, state, speakerControllerActionId('playPause'));
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: true, playing: false, playback: 'paused' });
    state = runDeviceActionState(speaker.id, state, speakerControllerActionId('playPause'));
    state = toggleDeviceState(speaker.id, state);
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: false, playing: false, playback: 'paused', status: 'Off' });
    expectRetained(state);
    state = toggleDeviceState(speaker.id, state);
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({
      on: true, playing: false, status: 'Paused', volume: 41, muted: true, source: 'AirPlay', preset: 'Bass',
    });
    expect(state.level).toBe(35);
    expectRetained(state);
  });

  it.each([false, true])('bounds rapid volume changes while preserving power %s and other preferences', (on) => {
    let state: DeviceState = { on, level: 52, settings: {
      playbackState: 'paused', volume: 28, muted: true, speakerSource: 'Bluetooth', speakerPreset: 'Vocal',
      trackIndex: 3, nightMode: true, spatialAudio: false,
    } };
    for (let index = 0; index < 25; index += 1) state = runDeviceActionState(speaker.id, state, speakerControllerActionId('volumeUp'));
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({
      on, volume: 100, muted: true, playing: false, source: 'Bluetooth', preset: 'Vocal', trackIndex: 3, night: true, spatial: false,
    });
    expect(deviceActionFeedback(speaker, state)).toBe(`${on ? 'Paused' : 'Off'} · Volume 100%`);
    expectRetained(state);
    for (let index = 0; index < 25; index += 1) state = runDeviceActionState(speaker.id, state, speakerControllerActionId('volumeDown'));
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on, volume: 0, muted: true, playback: 'paused' });
    expect(state.level).toBe(52);
    expectRetained(state);
  });

  it('resolves repeated controls against the latest state without affecting another device', () => {
    const before = useHomeStore.getState().deviceStates;
    const { setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    setDeviceSetting(speaker.id, 'volume', 30);
    for (const key of ['volumeUp', 'volumeUp', 'volumeDown', 'volumeUp'] as const) runDeviceAction(speaker.id, speakerControllerActionId(key));
    const after = useHomeStore.getState().deviceStates;
    expect(readSpeakerControllerState(speaker, after[speaker.id])?.volume).toBe(40);
    for (const [id, state] of Object.entries(before)) if (id !== speaker.id) expect(after[id]).toBe(state);
    expectRetained(after[speaker.id]);
  });

  it('keeps every source, sound profile and mute setting as saved preferences while off', () => {
    let state: DeviceState = { on: false, level: 7, settings: { playbackState: 'paused', volume: 33, trackIndex: 8 } };
    for (const option of SPEAKER_SOURCE_OPTIONS) {
      state = applyDeviceSetting(speaker.id, state, 'speakerSource', option.value);
      expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: false, source: option.value, volume: 33, playback: 'paused', trackIndex: 8 });
    }
    for (const option of SPEAKER_PRESET_OPTIONS) {
      state = applyDeviceSetting(speaker.id, state, 'speakerPreset', option.value);
      expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: false, preset: option.value });
    }
    state = applyDeviceSetting(speaker.id, state, 'muted', true);
    state = applyDeviceSetting(speaker.id, state, 'nightMode', true);
    state = applyDeviceSetting(speaker.id, state, 'spatialAudio', false);
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: false, muted: true, night: true, spatial: false });
    expectRetained(state);
  });

  it('changes only the sample track index without inventing playing state or automatic elapsed time', () => {
    let state: DeviceState = { on: false, level: 0, settings: { playbackState: 'paused', playbackPositionSec: 90, trackIndex: 1 } };
    state = runDeviceActionState(speaker.id, state, speakerControllerActionId('previous'));
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ on: true, trackIndex: 1, playing: false, playback: 'paused' });
    expect(state.settings?.playbackPositionSec).toBe(0);
    state = runDeviceActionState(speaker.id, state, speakerControllerActionId('next'));
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({ trackIndex: 2, playing: false });
    const upper = runDeviceActionState(speaker.id, { ...state, settings: { ...state.settings, trackIndex: 99 } }, speakerControllerActionId('next'));
    expect(readSpeakerControllerState(speaker, upper)?.trackIndex).toBe(99);
    expectRetained(upper);
  });

  it('falls back for malformed preferences and visibly rejects unknown playback samples', () => {
    const state = { on: true, level: 0, settings: {
      volume: Number.NaN, muted: 'true', playbackState: 'connecting', speakerSource: 'Secret stream',
      speakerPreset: 'Concert', spatialAudio: 'yes', nightMode: 'false', trackIndex: '3',
    } };
    expect(readSpeakerControllerState(speaker, state)).toMatchObject({
      volume: 28, muted: false, playback: 'unavailable', playing: false, status: 'Playback unavailable',
      source: 'Spotify', preset: 'Warm', spatial: true, night: false, trackIndex: null,
    });
    expect(validateStoredSetting('speaker', 'playbackState', 'unavailable')).toBeUndefined();
    for (const trackIndex of [0, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(readSpeakerControllerState(speaker, { ...state, settings: { trackIndex } })?.trackIndex).toBeNull();
    }
    for (const [volume, normalized, status] of [[-1, 0, 'Silent preview'], [0.4, 0, 'Silent preview'], [1000, 100, 'Playing preview']] as const) {
      const sample = { on: true, level: 0, settings: { volume, playbackState: 'playing' } };
      expect(readSpeakerControllerState(speaker, sample)).toMatchObject({ volume: normalized, status });
      expect(deviceStatus(speaker, sample)).toBe(status);
    }
    const recovered = runDeviceActionState(speaker.id, state, speakerControllerActionId('volumeUp'));
    expect(readSpeakerControllerState(speaker, recovered)).toMatchObject({ volume: 33, playback: 'unavailable' });
    expect(deviceActionFeedback(speaker, recovered)).toBe('Playback unavailable · Volume 33%');
  });

  it('keeps telemetry read-only and rejects unsupported commands without widening TV control', () => {
    const state = { on: false, level: 0 };
    for (const item of getCapabilities('speaker')) if (item.type === 'stat') expect(applyDeviceSetting(speaker.id, state, item.field, 0)).toBe(state);
    expect(applyDeviceSetting(speaker.id, state, 'speakerSource', 'unknown')).toBe(state);
    expect(applyDeviceSetting(speaker.id, state, 'volume', Number.NaN)).toBe(state);
    expect(runDeviceActionState(speaker.id, state, 'speaker-connect-provider')).toBe(state);
    expect(runDeviceActionState('family-tv', state, speakerControllerActionId('volumeUp'))).toBe(state);
  });

  it('blocks view-only and revoked controls through previously captured callbacks', () => {
    const before = useHomeStore.getState().deviceStates;
    const { toggleDevice, setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [speaker.roomId], deviceIds: [speaker.id] };
    useHomeStore.setState({ access });
    toggleDevice(speaker.id);
    setDeviceSetting(speaker.id, 'muted', true);
    runDeviceAction(speaker.id, speakerControllerActionId('playPause'));
    expect(useHomeStore.getState().deviceStates).toBe(before);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [speaker.id] } });
    runDeviceAction(speaker.id, speakerControllerActionId('playPause'));
    const accepted = useHomeStore.getState().deviceStates;
    expect(readSpeakerControllerState(speaker, accepted[speaker.id])?.playing).toBe(true);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    runDeviceAction(speaker.id, speakerControllerActionId('volumeDown'));
    runDeviceAction(speaker.id, speakerControllerActionId('next'));
    setDeviceSetting(speaker.id, 'speakerPreset', 'Flat');
    toggleDevice(speaker.id);
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
  });
});
