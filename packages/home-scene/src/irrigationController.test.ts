import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, getCapabilities } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { IRRIGATION_DURATION_PRESETS, IRRIGATION_ZONES, irrigationControllerActionId, readIrrigationControllerState } from './irrigationController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const sprinkler = getDevice('grounds-sprinkler')!;
/** Isolate simulation state and grants for every case. */
function resetStore() { useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); }
/** Verify the same device survives both native and embedded persisted-state formats. */
function expectRetained(state: DeviceState) {
  const snapshot = createDefaultSimulationSnapshot(); snapshot.deviceStates[sprinkler.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState(); browser.deviceStates[sprinkler.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[sprinkler.id]).toEqual(state);
  expect(restored.deviceStates[sprinkler.id]).toEqual(state);
}
beforeEach(resetStore); afterEach(resetStore);

describe('irrigation controller state', () => {
  it('projects established defaults only for sprinklers', () => {
    expect(readIrrigationControllerState(sprinkler, { on: false, level: 75 })).toMatchObject({ on: false, durationMin: 15, zone: 'Front Yard' });
    expect(readIrrigationControllerState(getDevice('living-light')!, { on: true, level: 50 })).toBeNull();
  });
  it.each([false, true])('preserves power %s and unrelated settings through every zone and duration choice', (on) => {
    let state: DeviceState = { on, level: 75, settings: { scheduleEnabled: false, scheduleHour: 6 } };
    for (const zone of IRRIGATION_ZONES) for (const preset of IRRIGATION_DURATION_PRESETS) {
      state = applyDeviceSetting(sprinkler.id, state, 'zone', zone.value);
      state = applyDeviceSetting(sprinkler.id, state, 'durationMin', preset.value);
      expect(readIrrigationControllerState(sprinkler, state)).toMatchObject({ on, durationMin: preset.value, zone: zone.value });
      expect(state.settings).toMatchObject({ scheduleEnabled: false, scheduleHour: 6 });
      expectRetained(state);
    }
  });
  it.each([false, true])('bounds repeated duration changes without changing power %s or zone', (on) => {
    let state: DeviceState = { on, level: 75, settings: { durationMin: 15, zone: 'Garden' } };
    for (let i = 0; i < 20; i++) state = runDeviceActionState(sprinkler.id, state, irrigationControllerActionId('durationUp'));
    expect(readIrrigationControllerState(sprinkler, state)).toMatchObject({ on, durationMin: 60, zone: 'Garden' });
    expect(deviceActionFeedback(sprinkler, state)).toBe('Duration 60 min · saved preference');
    expectRetained(state);
    for (let i = 0; i < 20; i++) state = runDeviceActionState(sprinkler.id, state, irrigationControllerActionId('durationDown'));
    expect(readIrrigationControllerState(sprinkler, state)).toMatchObject({ on, durationMin: 0, zone: 'Garden' });
    expectRetained(state);
  });
  it('resolves rapid steps against current state and leaves every other device unchanged', () => {
    const store = useHomeStore.getState(); const before = store.deviceStates;
    store.setDeviceSetting(sprinkler.id, 'durationMin', 15);
    for (const key of ['durationUp', 'durationUp', 'durationDown', 'durationUp'] as const) store.runDeviceAction(sprinkler.id, irrigationControllerActionId(key));
    const after = useHomeStore.getState().deviceStates;
    expect(readIrrigationControllerState(sprinkler, after[sprinkler.id])?.durationMin).toBe(25);
    for (const [id, state] of Object.entries(before)) if (id !== sprinkler.id) expect(after[id]).toBe(state);
    expectRetained(after[sprinkler.id]);
  });
  it.each([Number.NaN, Infinity, -1, 61, 1.5, '15', false])('keeps malformed duration %s unavailable until an explicit preference replaces it', (durationMin) => {
    const state: DeviceState = { on: false, level: 50, settings: { durationMin, zone: 'unknown' } };
    expect(readIrrigationControllerState(sprinkler, state)).toMatchObject({ on: false, durationMin: null, zone: null });
    expect(runDeviceActionState(sprinkler.id, state, irrigationControllerActionId('durationUp'))).toBe(state);
    const recovered = applyDeviceSetting(sprinkler.id, state, 'durationMin', 15);
    expect(readIrrigationControllerState(sprinkler, recovered)).toMatchObject({ on: false, durationMin: 15, zone: null });
  });
  it('never treats saved zero minutes as stop or creates a timer through start/stop', () => {
    const state: DeviceState = { on: true, level: 75, settings: { durationMin: 0, zone: 'Back Yard' } };
    expect(readIrrigationControllerState(sprinkler, state)?.status).toBe('Watering preview');
    const off = toggleDeviceState(sprinkler.id, state);
    expect(off).toEqual({ ...state, on: false });
    expect(toggleDeviceState(sprinkler.id, off)).toEqual(state);
    expectRetained(off);
    expect(getCapabilities('sprinkler').filter((item) => item.id.startsWith('sprinkler-duration')).every((item) => item.configurationOnly)).toBe(true);
  });
  it('rejects unrelated commands and invalid preferences', () => {
    const state = { on: false, level: 75 };
    expect(runDeviceActionState('living-light', state, irrigationControllerActionId('durationUp'))).toBe(state);
    expect(applyDeviceSetting(sprinkler.id, state, 'zone', 'Pool')).toBe(state);
    expect(applyDeviceSetting(sprinkler.id, state, 'durationMin', Number.NaN)).toBe(state);
  });
  it('rechecks view-only and revoked authority for captured callbacks', () => {
    const { toggleDevice, setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    const before = useHomeStore.getState().deviceStates;
    useHomeStore.setState({ access: { ...EMPTY_SCENE_ACCESS, roomIds: [sprinkler.roomId], deviceIds: [sprinkler.id] } });
    toggleDevice(sprinkler.id); setDeviceSetting(sprinkler.id, 'zone', 'Garden'); runDeviceAction(sprinkler.id, irrigationControllerActionId('durationUp'));
    expect(useHomeStore.getState().deviceStates).toBe(before);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    toggleDevice(sprinkler.id); setDeviceSetting(sprinkler.id, 'durationMin', 60);
    expect(useHomeStore.getState().deviceStates).toBe(before);
  });
});
