import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICES, type DeviceDefinition } from './data';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from './deviceControlActions';
import { deviceActionFeedback, getCapabilities, readDeviceSetting, type DeviceKind } from './deviceCapabilities';
import { createDefaultSimulationSnapshot, parseSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
import type { DeviceState } from './simulationTypes';

/** Find a real scene instance so reducer tests cover the same IDs used by both renderers. */
function deviceOfKind(kind: DeviceKind): DeviceDefinition { return DEVICES.find((device) => device.kind === kind)!; }
/** Read a new independent device state for each test. */
function initial(device: DeviceDefinition): DeviceState { return createDefaultSimulationSnapshot().deviceStates[device.id]; }
/** Round-trip an actual single-device outcome through both browser persistence and bridge v1. */
function roundTrip(device: DeviceDefinition, current: DeviceState): void {
  const state = createDefaultState();
  state.deviceStates[device.id] = current;
  expect(parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state })).deviceStates[device.id]).toEqual(current);
  expect(parseSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: {
    deviceStates: state.deviceStates, night: state.night, lightingMode: state.lightingMode, motionDisabled: state.motionDisabled,
  } })?.state.deviceStates[device.id]).toEqual(current);
}

describe('shared simulation controls', () => {
  beforeEach(() => useHomeStore.getState().reset());

  it('uses canonical levels for scenes, clears effects for manual light controls, and preserves off state', () => {
    const device = deviceOfKind('light');
    const before = { ...initial(device), on: false, settings: { lightEffect: 'party', adaptiveLighting: true } };
    const manual = applyDeviceSetting(device.id, before, 'brightness', 64.6);
    expect(manual).toMatchObject({ on: false, level: 65, settings: { lightEffect: 'none', adaptiveLighting: true } });
    expect(before.settings.lightEffect).toBe('party');
    const scene = runDeviceActionState(device.id, before, 'light-scene-cool');
    expect(scene).toMatchObject({ on: true, level: 70, settings: { color: '#A0E9FF', lightColorMode: 'color', lightEffect: 'none' } });
    expect(scene.settings?.brightness).toBeUndefined();
    const temperature = applyDeviceSetting(device.id, scene, 'colorTempK', 4319);
    expect(temperature.settings).toMatchObject({ colorTempK: 4300, lightColorMode: 'temperature', lightEffect: 'none' });
    roundTrip(device, temperature);
    const effect = applyDeviceSetting(device.id, temperature, 'lightEffect', 'sunset');
    roundTrip(device, effect);
    expect(setDeviceLevelState(device.id, effect, 25).settings?.lightEffect).toBe('none');
  });

  it('makes TV remote input visible in bounded local preview state', () => {
    const device = deviceOfKind('tv');
    let state = runDeviceActionState(device.id, initial(device), 'tv-source-netflix');
    expect(state).toMatchObject({ on: true, settings: { source: 'Netflix' } });
    state = applyDeviceSetting(device.id, state, 'channel', 999);
    state = runDeviceActionState(device.id, state, 'tv-channel-up');
    expect(state.settings).toMatchObject({ source: 'Live TV', channel: 999 });
    state = runDeviceActionState(device.id, state, 'tv-play-pause');
    expect(state.settings?.playbackState).toBe('playing');
    state = runDeviceActionState(device.id, state, 'tv-play-pause');
    expect(state.settings?.playbackState).toBe('paused');
    for (let index = 0; index < 370; index += 1) state = runDeviceActionState(device.id, state, 'tv-forward');
    expect(state.settings?.playbackPositionSec).toBe(3600);
    state = runDeviceActionState(device.id, state, 'tv-next');
    expect(state.settings).toMatchObject({ trackIndex: 2, playbackPositionSec: 0 });
    for (const direction of ['up', 'up', 'left', 'left', 'select']) state = runDeviceActionState(device.id, state, `tv-remote-${direction}`);
    expect(state.settings).toMatchObject({ remoteFocus: 1, remoteSelection: 1, remoteAction: 'select' });
    roundTrip(device, state);
    state = runDeviceActionState(device.id, state, 'tv-remote-home');
    expect(state.settings).toMatchObject({ source: 'Home', remoteFocus: 5, remoteSelection: 0 });
  });

  it('persists opening-device preferences through actions, reloads, and toggles', () => {
    for (const kind of ['gate', 'blinds', 'window', 'garage', 'door'] as const) {
      const device = deviceOfKind(kind);
      let state = applyDeviceSetting(device.id, initial(device), 'scheduleEnabled', true);
      state = applyDeviceSetting(device.id, state, 'scheduleHour', 23);
      state = applyDeviceSetting(device.id, state, 'scheduleMinute', 59);
      state = applyDeviceSetting(device.id, state, 'scheduleDays', 'weekends');
      if (kind === 'gate') state = applyDeviceSetting(device.id, state, 'autoOpenEnabled', true);
      state = runDeviceActionState(device.id, state, `${kind}-command-open`);
      expect(state).toMatchObject({ on: true, level: 100 });
      state = toggleDeviceState(device.id, state);
      expect(state).toMatchObject({ on: false, level: 0, settings: { scheduleEnabled: true, scheduleHour: 23, scheduleMinute: 59, scheduleDays: 'weekends' } });
      if (kind === 'gate') expect(state.settings?.autoOpenEnabled).toBe(true);
      roundTrip(device, state);
    }
  });

  it('bounds relative appliance controls and keeps coupled pressure thresholds ordered', () => {
    const microwave = deviceOfKind('microwave');
    let state = applyDeviceSetting(microwave.id, initial(microwave), 'timeRemainingSec', 890);
    state = runDeviceActionState(microwave.id, state, 'microwave-add-120');
    expect(state).toMatchObject({ on: true, settings: { timeRemainingSec: 900 } });
    const water = deviceOfKind('water');
    let waterState = applyDeviceSetting(water.id, initial(water), 'waterPressureHighPsi', 60);
    waterState = applyDeviceSetting(water.id, waterState, 'waterPressureLowPsi', 60);
    expect(waterState.settings).toMatchObject({ waterPressureLowPsi: 60, waterPressureHighPsi: 70 });
    waterState = applyDeviceSetting(water.id, waterState, 'waterPressureHighPsi', 60);
    expect(waterState.settings).toMatchObject({ waterPressureLowPsi: 50, waterPressureHighPsi: 60 });
    roundTrip(water, waterState);
  });

  it('describes local outcomes immediately and pauses playback when powered off', () => {
    for (const kind of ['tv', 'speaker'] as const) {
      const device = deviceOfKind(kind);
      let state = runDeviceActionState(device.id, initial(device), `${kind}-play-pause`);
      expect(deviceActionFeedback(device, state)).toBe('playing · local preview');
      state = toggleDeviceState(device.id, state);
      expect(state).toMatchObject({ on: false, settings: { playbackState: 'paused' } });
      expect(deviceActionFeedback(device, state)).toBeNull();
      expect(readDeviceSetting(device, { ...state, settings: { playbackState: 'playing' } }, 'playbackState')).toBe('paused');
      state = toggleDeviceState(device.id, state);
      expect(readDeviceSetting(device, state, 'playbackState')).toBe('paused');
      roundTrip(device, state);
    }
    const tv = deviceOfKind('tv');
    const selected = runDeviceActionState(tv.id, initial(tv), 'tv-remote-select');
    expect(deviceActionFeedback(tv, selected)).toBe('Preview tile 5 selected');
    expect(deviceActionFeedback(tv, applyDeviceSetting(tv.id, selected, 'volume', 50))).toBeNull();
    expect(deviceActionFeedback(tv, runDeviceActionState(tv.id, selected, 'tv-source-netflix'))).toBe('Netflix · local preview');
  });

  it('rejects unknown controls, readonly telemetry, malformed enums, and non-finite values', () => {
    const device = deviceOfKind('light');
    const state = initial(device);
    for (const [field, value] of [['color', '#javascript'], ['colorTempK', Number.NaN], ['scheduleMinute', Infinity], ['scheduleDays', 'any time'], ['url', 'https://example.com']] as const) {
      expect(applyDeviceSetting(device.id, state, field, value)).toBe(state);
    }
    expect(runDeviceActionState(device.id, state, 'reboot-hardware')).toBe(state);
    expect(toggleDeviceState('unknown-device', state)).toBe(state);
    expect(setDeviceLevelState('unknown-device', state, 40)).toBe(state);
    const energy = deviceOfKind('energy');
    const sample = initial(energy);
    expect(applyDeviceSetting(energy.id, sample, 'powerW', 900)).toBe(sample);
    expect(readDeviceSetting(energy, toggleDeviceState(energy.id, sample), 'powerW')).toBe(readDeviceSetting(energy, sample, 'powerW'));
  });

  it('round-trips every catalog action as a valid local simulation outcome', () => {
    for (const device of DEVICES) {
      for (const capability of getCapabilities(device.kind)) {
        if (capability.type !== 'action') continue;
        const before = initial(device);
        const serialized = JSON.stringify(before);
        const after = runDeviceActionState(device.id, before, capability.id);
        expect(JSON.stringify(before), `${device.id}/${capability.id} mutated its input`).toBe(serialized);
        roundTrip(device, after);
      }
    }
  });

  it('keeps the DOM store behavior identical to the pure native-compatible reducers', () => {
    const id = deviceOfKind('tv').id;
    const before = useHomeStore.getState().deviceStates[id];
    const expected = runDeviceActionState(id, before, 'tv-channel-up');
    useHomeStore.getState().runDeviceAction(id, 'tv-channel-up');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(expected);
    const expectedSetting = applyDeviceSetting(id, expected, 'scheduleMinute', 500);
    useHomeStore.getState().setDeviceSetting(id, 'scheduleMinute', 500);
    expect(useHomeStore.getState().deviceStates[id]).toEqual(expectedSetting);
    expect(expectedSetting.settings?.scheduleMinute).toBe(59);
  });
});
