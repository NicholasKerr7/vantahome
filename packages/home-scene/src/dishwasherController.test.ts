import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, quickActionLabel, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from './deviceControlActions';
import { DISHWASHER_CYCLE_OPTIONS, DISHWASHER_TEMPERATURE_OPTIONS, dishwasherControllerActionId, readDishwasherControllerState } from './dishwasherController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const dishwasher = getDevice('kitchen-dishwasher')!;

/** Give each case independent accepted state and authorization. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Native hydration and browser storage must retain the same activity, samples and preferences. */
function expectRetained(state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[dishwasher.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState();
  browser.deviceStates[dishwasher.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[dishwasher.id]).toEqual(state);
  expect(restored.deviceStates[dishwasher.id]).toEqual(state);
}

describe('shared dishwasher controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports only dishwashers and matches the existing allowlisted saved controls', () => {
    expect(readDishwasherControllerState(getDevice('laundry-washer')!, { on: false, level: 25 })).toBeNull();
    for (const [field, options] of [['cycle', DISHWASHER_CYCLE_OPTIONS], ['washTemp', DISHWASHER_TEMPERATURE_OPTIONS]] as const) {
      const capability = getCapabilities('dishwasher').find((item) => 'field' in item && item.field === field);
      expect(capability?.type === 'enum' ? capability.options : null).toEqual(options);
      expect(capability?.configurationOnly).toBe(true);
    }
    expect(getCapabilities('dishwasher').find((item) => 'field' in item && item.field === 'extraSpin'))
      .toMatchObject({ type: 'toggle', label: 'Dry Boost', configurationOnly: true });
    for (const key of ['start', 'pause', 'stop'] as const) {
      expect(getCapabilities('dishwasher').find((item) => item.id === dishwasherControllerActionId(key))).toMatchObject({ type: 'action' });
    }
  });

  it('projects fixed default samples without a clock, inferred phase or automatic completion', () => {
    expect(readDishwasherControllerState(dishwasher, { on: false, level: 40 })).toEqual({
      on: false, activity: 'idle', status: 'Ready', cycle: 'Auto', washTemp: 'Hot', extraDry: false,
      remainingMin: 58, progressPercent: 0,
    });
  });

  it('starts, pauses, resumes and stops without altering samples or advanced preferences', () => {
    let state: DeviceState = { on: false, level: 45, settings: {
      cycle: 'Eco', washTemp: 'Warm', extraSpin: true, progress: 37, remainingMin: 19,
      soilLevel: 'Heavy', rinseCount: 3, prewash: true, steamWash: true, sanitizeWash: false, smartDispense: false, ecoWash: true,
    } };
    for (const [key, activity, on] of [['start', 'running', true], ['pause', 'paused', false], ['start', 'running', true], ['stop', 'stopped', false]] as const) {
      state = runDeviceActionState(dishwasher.id, state, dishwasherControllerActionId(key));
      expect(readDishwasherControllerState(dishwasher, state)).toMatchObject({
        on, activity, cycle: 'Eco', washTemp: 'Warm', extraDry: true, progressPercent: 37, remainingMin: 19,
      });
      expect(state.level).toBe(45);
      expect(state.settings).toMatchObject({ soilLevel: 'Heavy', rinseCount: 3, prewash: true, steamWash: true, sanitizeWash: false, smartDispense: false, ecoWash: true });
      expectRetained(state);
    }
    expect(quickActionLabel(dishwasher, state)).toBe('Start');
  });

  it('preserves paused activity through control edits and quick resume after reopening', () => {
    let state = runDeviceActionState(dishwasher.id, { on: true, level: 40 }, dishwasherControllerActionId('pause'));
    state = applyDeviceSetting(dishwasher.id, state, 'cycle', 'Quick');
    state = applyDeviceSetting(dishwasher.id, state, 'washTemp', 'Cold');
    state = applyDeviceSetting(dishwasher.id, state, 'extraSpin', true);
    expect(state.settings?.lastAction).toBeUndefined();
    expect(readDishwasherControllerState(dishwasher, state)).toMatchObject({ on: false, activity: 'paused', cycle: 'Quick', washTemp: 'Cold', extraDry: true });
    expect(quickActionLabel(dishwasher, state)).toBe('Resume');
    expectRetained(state);
    state = toggleDeviceState(dishwasher.id, state);
    expect(readDishwasherControllerState(dishwasher, state)?.activity).toBe('running');
    state = toggleDeviceState(dishwasher.id, state);
    expect(readDishwasherControllerState(dishwasher, state)?.activity).toBe('paused');
    expectRetained(state);
  });

  it('promotes old pause markers before either preference or level edits clear them', () => {
    const legacy = { on: false, level: 40, settings: { lastAction: 'dishwasher-pause' } };
    const preferred = applyDeviceSetting(dishwasher.id, legacy, 'extraSpin', true);
    const leveled = setDeviceLevelState(dishwasher.id, legacy, 70);
    for (const state of [preferred, leveled]) {
      expect(state.settings?.lastAction).toBeUndefined();
      expect(readDishwasherControllerState(dishwasher, state)?.activity).toBe('paused');
      expect(quickActionLabel(dishwasher, state)).toBe('Resume');
      expectRetained(state);
    }
    expect(setDeviceLevelState(dishwasher.id, { on: false, level: 40 }, 70)).toEqual({ on: false, level: 70 });
  });

  it.each([
    [true, 'paused', 'running', 'Washing preview'], [true, 'stopped', 'running', 'Washing preview'],
    [false, 'running', 'idle', 'Ready'], [false, 'paused', 'paused', 'Paused'],
    [false, 'stopped', 'stopped', 'Stopped'], [false, 'complete', 'idle', 'Ready'],
  ] as const)('uses authoritative power %s and stored %s consistently in every summary', (on, stored, activity, status) => {
    const state = { on, level: 0, settings: { dishwasherActivity: stored, lastAction: 'dishwasher-start' } };
    expect(readDishwasherControllerState(dishwasher, state)).toMatchObject({ on, activity, status });
    expect(readDeviceSetting(dishwasher, state, 'dishwasherActivity')).toBe(activity);
    expect(deviceStatus(dishwasher, state)).toBe(status);
    expect(deviceActionFeedback(dishwasher, state)).toBe(status);
  });

  it('keeps every program, temperature and Dry Boost edit from starting an idle or stopped machine', () => {
    for (const activity of ['idle', 'stopped'] as const) {
      let state: DeviceState = { on: false, level: 40, settings: { dishwasherActivity: activity } };
      for (const cycle of DISHWASHER_CYCLE_OPTIONS) {
        state = applyDeviceSetting(dishwasher.id, state, 'cycle', cycle.value);
        expect(readDishwasherControllerState(dishwasher, state)).toMatchObject({ on: false, activity, cycle: cycle.value });
      }
      for (const temperature of DISHWASHER_TEMPERATURE_OPTIONS) {
        state = applyDeviceSetting(dishwasher.id, state, 'washTemp', temperature.value);
        expect(readDishwasherControllerState(dishwasher, state)).toMatchObject({ on: false, activity, washTemp: temperature.value });
      }
      state = applyDeviceSetting(dishwasher.id, state, 'extraSpin', true);
      expect(readDishwasherControllerState(dishwasher, state)).toMatchObject({ on: false, activity, extraDry: true });
      expectRetained(state);
    }
  });

  it('does not infer activity from progress or remaining samples and rejects malformed readings', () => {
    expect(readDishwasherControllerState(dishwasher, { on: true, level: 0, settings: { progress: 100, remainingMin: 0 } }))
      .toMatchObject({ activity: 'running', progressPercent: 100, remainingMin: 0 });
    expect(readDishwasherControllerState(dishwasher, { on: false, level: 100, settings: { progress: 50, remainingMin: 20 } }))
      .toMatchObject({ activity: 'idle', progressPercent: 50, remainingMin: 20 });
    for (const [progress, remainingMin] of [[Number.NaN, -1], [101, Number.POSITIVE_INFINITY], ['37', '19'], [-1, 1441]] as const) {
      expect(readDishwasherControllerState(dishwasher, { on: true, level: 40, settings: { progress, remainingMin } }))
        .toMatchObject({ progressPercent: null, remainingMin: null, activity: 'running' });
    }
  });

  it('defaults malformed saved preferences and keeps all samples readonly', () => {
    const state = { on: false, level: 40 };
    expect(readDishwasherControllerState(dishwasher, { ...state, settings: { cycle: 'Custom steam', washTemp: 90, extraSpin: 'true' } }))
      .toMatchObject({ cycle: 'Auto', washTemp: 'Hot', extraDry: false });
    for (const capability of getCapabilities('dishwasher')) if (capability.type === 'stat') {
      expect(applyDeviceSetting(dishwasher.id, state, capability.field, 0)).toBe(state);
    }
    expect(runDeviceActionState(dishwasher.id, state, 'dishwasher-unlock-door')).toBe(state);
    expect(runDeviceActionState('laundry-washer', state, dishwasherControllerActionId('start'))).toBe(state);
  });

  it('keeps rapid actions isolated and blocks view-only or revoked callbacks', () => {
    const before = useHomeStore.getState().deviceStates;
    const { runDeviceAction, setDeviceSetting, toggleDevice } = useHomeStore.getState();
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [dishwasher.roomId], deviceIds: [dishwasher.id], controllableDeviceIds: [dishwasher.id] };
    useHomeStore.setState({ access });
    for (const key of ['start', 'pause', 'start', 'stop', 'start', 'pause'] as const) runDeviceAction(dishwasher.id, dishwasherControllerActionId(key));
    setDeviceSetting(dishwasher.id, 'extraSpin', true);
    const accepted = useHomeStore.getState().deviceStates;
    expect(readDishwasherControllerState(dishwasher, accepted[dishwasher.id])).toMatchObject({ activity: 'paused', extraDry: true });
    for (const [id, state] of Object.entries(before)) if (id !== dishwasher.id) expect(accepted[id]).toBe(state);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [] } });
    runDeviceAction(dishwasher.id, dishwasherControllerActionId('start'));
    runDeviceAction(dishwasher.id, dishwasherControllerActionId('stop'));
    setDeviceSetting(dishwasher.id, 'washTemp', 'Hot');
    toggleDevice(dishwasher.id);
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
    expectRetained(accepted[dishwasher.id]);
  });
});
