import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, quickActionLabel, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from './deviceControlActions';
import { DRYER_DRYNESS_OPTIONS, DRYER_HEAT_OPTIONS, LAUNDRY_CYCLE_OPTIONS, WASHER_SPIN_OPTIONS, WASHER_TEMPERATURE_OPTIONS, laundryControllerActionId, readLaundryControllerState, readLaundryInstallation } from './laundryController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const washer = getDevice('laundry-washer')!;
const dryer = getDevice('laundry-dryer')!;

/** Reset captured simulation authority and state around each independent machine test. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Verify accepted activity and preferences survive both native and embedded-browser restoration. */
function expectRetained(id: string, state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState();
  browser.deviceStates[id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[id]).toEqual(state);
  expect(restored.deviceStates[id]).toEqual(state);
}

describe('shared laundry controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('recognizes actual authored stacking without inferring a new or moved partner', () => {
    expect(readLaundryControllerState(getDevice('kitchen-dishwasher')!, { on: false, level: 0 })).toBeNull();
    expect(readLaundryInstallation(washer)).toBe('stacked');
    expect(readLaundryInstallation(dryer)).toBe('stacked');
    expect(readLaundryInstallation({ ...washer, id: 'custom-washer', templateDeviceId: washer.id })).toBe('single');
    expect(readLaundryInstallation({ ...dryer, position: [14.4, 0.02, -15.52] })).toBe('single');
    expect(readLaundryInstallation({ ...washer, roomId: 'living' })).toBe('single');
    expect(readLaundryInstallation({ ...dryer, rotation: [0, Math.PI / 2, 0] })).toBe('single');
  });

  it('matches the existing saved controls and exposes only selected-machine action IDs', () => {
    for (const device of [washer, dryer]) {
      const cycles = getCapabilities(device.kind).find((item) => 'field' in item && item.field === 'cycle');
      expect(cycles?.type === 'enum' ? cycles.options : null).toEqual(LAUNDRY_CYCLE_OPTIONS[device.kind as 'washer' | 'dryer']);
      expect(cycles?.configurationOnly).toBe(true);
      for (const key of ['start', 'pause', 'stop'] as const) {
        expect(getCapabilities(device.kind).find((item) => item.id === laundryControllerActionId(device.kind as 'washer' | 'dryer', key)))
          .toMatchObject({ type: 'action' });
      }
    }
    for (const [kind, field, options] of [
      ['washer', 'washTemp', WASHER_TEMPERATURE_OPTIONS], ['washer', 'spinSpeedRpm', WASHER_SPIN_OPTIONS],
      ['dryer', 'heatLevel', DRYER_HEAT_OPTIONS], ['dryer', 'drynessLevel', DRYER_DRYNESS_OPTIONS],
    ] as const) {
      const capability = getCapabilities(kind).find((item) => 'field' in item && item.field === field);
      expect(capability?.type === 'enum' ? capability.options : null).toEqual(options);
      expect(capability?.configurationOnly).toBe(true);
    }
  });

  it('shows reproducible samples without inventing countdown, cycle phase or linked-machine state', () => {
    expect(readLaundryControllerState(washer, { on: false, level: 25 })).toEqual({
      kind: 'washer', on: false, activity: 'idle', status: 'Ready', cycle: 'Normal', washTemp: 'Warm',
      spinSpeedRpm: 1000, heatLevel: null, drynessLevel: null, progressPercent: 0, remainingMin: 42, lintFilterOk: null,
    });
    expect(readLaundryControllerState(dryer, { on: false, level: 45 })).toEqual({
      kind: 'dryer', on: false, activity: 'idle', status: 'Ready', cycle: 'Normal', washTemp: null,
      spinSpeedRpm: null, heatLevel: 'Med', drynessLevel: 'Dry', progressPercent: 0, remainingMin: 45, lintFilterOk: true,
    });
  });

  it.each(['washer', 'dryer'] as const)('starts, pauses, resumes and stops %s without rewriting samples or saved settings', (kind) => {
    const device = kind === 'washer' ? washer : dryer;
    let state: DeviceState = { on: false, level: 45, settings: {
      cycle: 'Delicate', progress: 38, remainingMin: 17,
      ...(kind === 'washer' ? { washTemp: 'Cold', spinSpeedRpm: 800 } : { heatLevel: 'Low', drynessLevel: 'Damp', lintFilterOk: false }),
    } };
    for (const [key, activity, on] of [['start', 'running', true], ['pause', 'paused', false], ['start', 'running', true], ['stop', 'stopped', false]] as const) {
      state = runDeviceActionState(device.id, state, laundryControllerActionId(kind, key));
      expect(readLaundryControllerState(device, state)).toMatchObject({ on, activity, cycle: 'Delicate', progressPercent: 38, remainingMin: 17 });
      expect(state.level).toBe(45);
      expectRetained(device.id, state);
    }
    expect(quickActionLabel(device, state)).toBe('Start');
  });

  it.each(['washer', 'dryer'] as const)('retains a paused %s through preference edits, reload and quick resume', (kind) => {
    const device = kind === 'washer' ? washer : dryer;
    let state = runDeviceActionState(device.id, { on: true, level: 35 }, laundryControllerActionId(kind, 'pause'));
    state = applyDeviceSetting(device.id, state, 'cycle', 'Quick');
    expect(state.settings?.lastAction).toBeUndefined();
    expect(readLaundryControllerState(device, state)).toMatchObject({ on: false, activity: 'paused', cycle: 'Quick' });
    expect(deviceStatus(device, state)).toBe('Paused');
    expect(quickActionLabel(device, state)).toBe('Resume');
    expectRetained(device.id, state);
    state = toggleDeviceState(device.id, state);
    expect(readLaundryControllerState(device, state)?.activity).toBe('running');
    state = toggleDeviceState(device.id, state);
    expect(readLaundryControllerState(device, state)?.activity).toBe('paused');
    expectRetained(device.id, state);
    const legacy = applyDeviceSetting(device.id, { on: false, level: 35, settings: { lastAction: `${kind}-pause` } }, 'cycle', 'Quick');
    expect(readLaundryControllerState(device, legacy)?.activity).toBe('paused');
    expectRetained(device.id, legacy);
  });

  it.each(['washer', 'dryer'] as const)('retains an older %s pause through its legacy level control without adding idle settings', (kind) => {
    const device = kind === 'washer' ? washer : dryer;
    const legacy = setDeviceLevelState(device.id, { on: false, level: 25, settings: { lastAction: `${kind}-pause` } }, 70);
    expect(legacy).toEqual({ on: false, level: 70, settings: { laundryActivity: 'paused' } });
    expect(readLaundryControllerState(device, legacy)?.activity).toBe('paused');
    expect(quickActionLabel(device, legacy)).toBe('Resume');
    expectRetained(device.id, legacy);
    expect(setDeviceLevelState(device.id, { on: false, level: 25 }, 70)).toEqual({ on: false, level: 70 });
  });

  it.each([
    [true, 'paused', 'running'], [true, 'stopped', 'running'], [false, 'running', 'idle'],
    [false, 'paused', 'paused'], [false, 'stopped', 'stopped'], [false, 'complete', 'idle'],
  ] as const)('keeps power %s and stored %s honest across the console, summaries and advanced activity', (on, stored, activity) => {
    for (const device of [washer, dryer]) {
      const state = { on, level: 45, settings: { laundryActivity: stored, lastAction: `${device.kind}-start` } };
      const controller = readLaundryControllerState(device, state)!;
      expect(controller.activity).toBe(activity);
      expect(readDeviceSetting(device, state, 'laundryActivity')).toBe(activity);
      expect(deviceStatus(device, state)).toBe(controller.status);
      expect(deviceActionFeedback(device, state)).toBe(controller.status);
    }
  });

  it('does not infer completion, running or countdown from independent sample values', () => {
    for (const device of [washer, dryer]) {
      expect(readLaundryControllerState(device, { on: true, level: 0, settings: { progress: 100, remainingMin: 0 } }))
        .toMatchObject({ activity: 'running', progressPercent: 100, remainingMin: 0 });
      expect(readLaundryControllerState(device, { on: false, level: 100, settings: { progress: 50, remainingMin: 20 } }))
        .toMatchObject({ activity: 'idle', progressPercent: 50, remainingMin: 20 });
      expect(readLaundryControllerState(device, { on: true, level: 20, settings: { progress: Number.NaN, remainingMin: -1, lintFilterOk: 'true' } }))
        .toMatchObject({ progressPercent: null, remainingMin: null, lintFilterOk: null });
      expect(readLaundryControllerState(device, { on: false, level: 20, settings: { progress: 101, remainingMin: Number.POSITIVE_INFINITY } }))
        .toMatchObject({ progressPercent: null, remainingMin: null });
    }
  });

  it('validates settings and samples while keeping telemetry readonly', () => {
    const state = { on: false, level: 25 };
    expect(readLaundryControllerState(washer, { ...state, settings: { cycle: 'Steam clean', washTemp: 'Scalding', spinSpeedRpm: 9999 } }))
      .toMatchObject({ cycle: 'Normal', washTemp: 'Warm', spinSpeedRpm: 1000 });
    expect(readLaundryControllerState(dryer, { ...state, settings: { cycle: 'Washer program', heatLevel: 'Maximum', drynessLevel: true } }))
      .toMatchObject({ cycle: 'Normal', heatLevel: 'Med', drynessLevel: 'Dry' });
    for (const device of [washer, dryer]) {
      for (const capability of getCapabilities(device.kind)) if (capability.type === 'stat') {
        expect(applyDeviceSetting(device.id, state, capability.field, 0)).toBe(state);
      }
      expect(runDeviceActionState(device.id, state, `${device.kind}-unlock-door`)).toBe(state);
    }
    expect(runDeviceActionState(washer.id, state, 'dryer-start')).toBe(state);
    expect(runDeviceActionState(dryer.id, state, 'washer-start')).toBe(state);
  });

  it('never controls its stacked partner and rechecks scope after a captured callback is revoked', () => {
    const before = useHomeStore.getState().deviceStates;
    const { runDeviceAction, setDeviceSetting, toggleDevice } = useHomeStore.getState();
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [washer.roomId], deviceIds: [washer.id], controllableDeviceIds: [washer.id] };
    useHomeStore.setState({ access });
    runDeviceAction(washer.id, 'washer-start');
    runDeviceAction(washer.id, 'washer-pause');
    setDeviceSetting(washer.id, 'cycle', 'Quick');
    runDeviceAction(dryer.id, 'dryer-start');
    const accepted = useHomeStore.getState().deviceStates;
    expect(readLaundryControllerState(washer, accepted[washer.id])).toMatchObject({ activity: 'paused', cycle: 'Quick' });
    expect(accepted[dryer.id]).toBe(before[dryer.id]);
    for (const [id, state] of Object.entries(before)) if (id !== washer.id) expect(accepted[id]).toBe(state);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [] } });
    runDeviceAction(washer.id, 'washer-start');
    runDeviceAction(washer.id, 'washer-stop');
    setDeviceSetting(washer.id, 'washTemp', 'Hot');
    toggleDevice(washer.id);
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
    expectRetained(washer.id, accepted[washer.id]);
  });
});
