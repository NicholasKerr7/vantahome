import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
import { VACUUM_MODE_OPTIONS, VACUUM_SUCTION_BOUNDS, readVacuumControllerState, vacuumControllerActionId, vacuumMaintenanceSummary } from './vacuumController';

const vacuum = getDevice('living-vacuum')!;

/** Reset temporary authority and commands so each case owns its simulation snapshot. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Both host hydration and embedded browser restoration must retain the same accepted controls. */
function expectRetained(state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[vacuum.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState();
  browser.deviceStates[vacuum.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[vacuum.id]).toEqual(state);
  expect(restored.deviceStates[vacuum.id]).toEqual(state);
  expect(readVacuumControllerState(vacuum, native!.state.deviceStates[vacuum.id])).toEqual(readVacuumControllerState(vacuum, state));
}

describe('shared vacuum controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports only vacuums and keeps modes, commands and suction bounds aligned with the catalog', () => {
    expect(readVacuumControllerState(getDevice('living-light')!, { on: true, level: 70 })).toBeNull();
    const modes = getCapabilities('vacuum').find((item) => 'field' in item && item.field === 'vacuumMode');
    expect(modes?.type === 'enum' ? modes.options : null).toEqual(VACUUM_MODE_OPTIONS);
    expect(getCapabilities('vacuum').find((item) => 'field' in item && item.field === 'vacuumSuction'))
      .toMatchObject({ type: 'range', min: VACUUM_SUCTION_BOUNDS.min, max: VACUUM_SUCTION_BOUNDS.max, configurationOnly: true });
    for (const key of ['start', 'pause', 'dock', 'suctionUp', 'suctionDown'] as const) {
      expect(getCapabilities('vacuum').find((item) => item.id === vacuumControllerActionId(key))).toMatchObject({
        type: 'action', ...(key.startsWith('suction') ? { configurationOnly: true } : {}),
      });
    }
  });

  it('projects the established sparse sample without inventing movement, progress or battery consumption', () => {
    expect(readVacuumControllerState(vacuum, { on: false, level: 0 })).toEqual({
      on: false, activity: 'docked', status: 'Docked', batteryPercent: 86, mode: 'auto', suction: 70,
      mop: false, quiet: false, binFull: false, brushDirty: false, filterLifePercent: 100, areaM2: 0, runtimeMin: 0,
    });
  });

  it('runs start, pause, resume and dock while preserving preferences and independent samples', () => {
    const original = { on: false, level: 35, settings: { vacuumMode: 'room', vacuumSuction: 55, vacuumMop: true, vacuumQuietMode: true } };
    let state: DeviceState = original;
    for (const [key, activity, on] of [
      ['start', 'cleaning', true], ['pause', 'paused', false], ['start', 'cleaning', true], ['dock', 'docked', false],
    ] as const) {
      state = runDeviceActionState(vacuum.id, state, vacuumControllerActionId(key));
      expect(readVacuumControllerState(vacuum, state)).toMatchObject({
        on, activity, mode: 'room', suction: 55, mop: true, quiet: true, batteryPercent: 86, areaM2: 0, runtimeMin: 0,
      });
      expect(state.level).toBe(35);
      expectRetained(state);
    }
    expect(original.settings).toEqual({ vacuumMode: 'room', vacuumSuction: 55, vacuumMop: true, vacuumQuietMode: true });
  });

  it.each([
    [true, 'docked', 'cleaning', 'Cleaning preview'],
    [true, 'paused', 'cleaning', 'Cleaning preview'],
    [false, 'paused', 'paused', 'Paused'],
    [false, 'docked', 'docked', 'Docked'],
    [false, 'cleaning', 'idle', 'Idle'],
    [false, 'unknown', 'idle', 'Idle'],
  ] as const)('uses canonical power %s and stored %s activity across all status surfaces', (on, stored, activity, label) => {
    const state = { on, level: 0, settings: { status: stored, lastAction: vacuumControllerActionId('start') } };
    expect(readVacuumControllerState(vacuum, state)).toMatchObject({ on, activity, status: label });
    expect(readDeviceSetting(vacuum, state, 'status')).toBe(activity);
    expect(deviceStatus(vacuum, state)).toBe(label);
    expect(deviceActionFeedback(vacuum, state)).toBe(label);
  });

  it('retains paused and docked status after a preference edit clears old action feedback', () => {
    for (const key of ['pause', 'dock'] as const) {
      const commanded = runDeviceActionState(vacuum.id, { on: true, level: 0 }, vacuumControllerActionId(key));
      const edited = applyDeviceSetting(vacuum.id, commanded, 'vacuumMode', 'spot');
      expect(edited.settings?.lastAction).toBeUndefined();
      expect(deviceActionFeedback(vacuum, edited)).toBeNull();
      expect(deviceStatus(vacuum, edited)).toBe(key === 'pause' ? 'Paused' : 'Docked');
      expectRetained(edited);
    }
  });

  it.each([false, true])('bounds repeated suction steps while preserving power %s and every other setting', (on) => {
    let state: DeviceState = { on, level: 65, settings: { status: on ? 'cleaning' : 'paused', vacuumMode: 'edge', vacuumMop: true, vacuumQuietMode: true, vacuumSuction: 70 } };
    for (let i = 0; i < 20; i += 1) state = runDeviceActionState(vacuum.id, state, vacuumControllerActionId('suctionUp'));
    expect(readVacuumControllerState(vacuum, state)).toMatchObject({ on, suction: 100, mode: 'edge', mop: true, quiet: true, batteryPercent: 86, areaM2: 0, runtimeMin: 0 });
    expect(deviceActionFeedback(vacuum, state)).toBe(`${on ? 'Cleaning preview' : 'Paused'} · Suction 100% · saved preference`);
    expectRetained(state);
    for (let i = 0; i < 20; i += 1) state = runDeviceActionState(vacuum.id, state, vacuumControllerActionId('suctionDown'));
    expect(readVacuumControllerState(vacuum, state)).toMatchObject({ on, suction: 0, mode: 'edge', mop: true, quiet: true });
    expect(state.level).toBe(65);
    expectRetained(state);
  });

  it('resolves rapid presses against current state and keeps unrelated devices untouched', () => {
    const before = useHomeStore.getState().deviceStates;
    const run = useHomeStore.getState().runDeviceAction;
    run(vacuum.id, vacuumControllerActionId('pause'));
    run(vacuum.id, vacuumControllerActionId('suctionDown'));
    run(vacuum.id, vacuumControllerActionId('suctionDown'));
    run(vacuum.id, vacuumControllerActionId('suctionDown'));
    run(vacuum.id, vacuumControllerActionId('suctionUp'));
    const after = useHomeStore.getState().deviceStates;
    expect(readVacuumControllerState(vacuum, after[vacuum.id])).toMatchObject({ activity: 'paused', suction: 50 });
    for (const [id, state] of Object.entries(before)) if (id !== vacuum.id) expect(after[id]).toBe(state);
    expectRetained(after[vacuum.id]);
  });

  it('preserves cleaning preferences and remembers state through the existing quick toggle', () => {
    let state: DeviceState = { on: false, level: 0, settings: { status: 'paused' } };
    for (const option of VACUUM_MODE_OPTIONS) {
      state = applyDeviceSetting(vacuum.id, state, 'vacuumMode', option.value);
      state = applyDeviceSetting(vacuum.id, state, 'vacuumMop', true);
      state = applyDeviceSetting(vacuum.id, state, 'vacuumQuietMode', true);
      expect(state.on).toBe(false);
      state = toggleDeviceState(vacuum.id, state);
      expect(readVacuumControllerState(vacuum, state)).toMatchObject({ on: true, activity: 'cleaning', mode: option.value, mop: true, quiet: true });
      state = toggleDeviceState(vacuum.id, state);
      expect(readVacuumControllerState(vacuum, state)).toMatchObject({ on: false, activity: 'docked', mode: option.value, mop: true, quiet: true });
      expectRetained(state);
    }
  });

  it('shows invalid samples as unavailable while retaining genuine zero and maintenance flags', () => {
    expect(readVacuumControllerState(vacuum, { on: false, level: 0, settings: {
      battery: 101, vacuumFilterLife: -1, vacuumAreaM2: Number.NaN, vacuumRuntimeMin: Number.POSITIVE_INFINITY,
      vacuumBinFull: 'false', vacuumBrushDirty: 0,
    } })).toMatchObject({ batteryPercent: null, filterLifePercent: null, areaM2: null, runtimeMin: null, binFull: null, brushDirty: null });
    expect(readVacuumControllerState(vacuum, { on: false, level: 0, settings: {
      battery: 0, vacuumFilterLife: 0, vacuumAreaM2: 0, vacuumRuntimeMin: 0, vacuumBinFull: true, vacuumBrushDirty: true,
    } })).toMatchObject({ batteryPercent: 0, filterLifePercent: 0, areaM2: 0, runtimeMin: 0, binFull: true, brushDirty: true });
  });

  it('combines every explicit maintenance condition without inventing a healthy state for unknown samples', () => {
    expect(vacuumMaintenanceSummary({ binFull: true, brushDirty: true, filterLifePercent: 20 }))
      .toBe('Empty bin · Clean brush · Check filter');
    expect(vacuumMaintenanceSummary({ binFull: true, brushDirty: false, filterLifePercent: null })).toBe('Empty bin');
    expect(vacuumMaintenanceSummary({ binFull: null, brushDirty: true, filterLifePercent: 21 })).toBe('Clean brush');
    expect(vacuumMaintenanceSummary({ binFull: null, brushDirty: null, filterLifePercent: null })).toBeNull();
    expect(vacuumMaintenanceSummary({ binFull: false, brushDirty: false, filterLifePercent: 100 })).toBeNull();
  });

  it.each([0, 19, 20])('requests a filter check for a valid sample of %s percent', (filterLifePercent) => {
    expect(vacuumMaintenanceSummary({ binFull: false, brushDirty: false, filterLifePercent })).toBe('Check filter');
  });

  it.each([-1, 20.1, 21, 101, Number.NaN, Number.POSITIVE_INFINITY])('does not invent a filter notice from sample %s', (filterLifePercent) => {
    expect(vacuumMaintenanceSummary({ binFull: null, brushDirty: null, filterLifePercent })).toBeNull();
  });

  it('uses known defaults and clamps invalid saved preferences without changing accepted activity', () => {
    expect(readVacuumControllerState(vacuum, { on: true, level: 0, settings: {
      vacuumMode: 'route', vacuumSuction: Number.NaN, vacuumMop: 'true', vacuumQuietMode: 'false',
    } })).toMatchObject({ activity: 'cleaning', mode: 'auto', suction: 70, mop: false, quiet: false });
    expect(readVacuumControllerState(vacuum, { on: false, level: 0, settings: { vacuumSuction: 500 } })).toMatchObject({ suction: 100 });
  });

  it('keeps samples read-only and rejects unsupported control inputs and action IDs', () => {
    const state = { on: false, level: 0 };
    for (const item of getCapabilities('vacuum')) if (item.type === 'stat') expect(applyDeviceSetting(vacuum.id, state, item.field, 0)).toBe(state);
    expect(applyDeviceSetting(vacuum.id, state, 'vacuumMode', 'map')).toBe(state);
    expect(applyDeviceSetting(vacuum.id, state, 'vacuumSuction', Number.NaN)).toBe(state);
    expect(runDeviceActionState(vacuum.id, state, 'vacuum-navigate-room')).toBe(state);
    expect(runDeviceActionState('living-light', state, vacuumControllerActionId('suctionUp'))).toBe(state);
  });

  it('blocks view-only and revoked controls through captured store callbacks', () => {
    const before = useHomeStore.getState().deviceStates;
    const { toggleDevice, setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [vacuum.roomId], deviceIds: [vacuum.id] };
    useHomeStore.setState({ access });
    toggleDevice(vacuum.id);
    setDeviceSetting(vacuum.id, 'vacuumMop', true);
    runDeviceAction(vacuum.id, vacuumControllerActionId('start'));
    expect(useHomeStore.getState().deviceStates).toBe(before);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [vacuum.id] } });
    runDeviceAction(vacuum.id, vacuumControllerActionId('start'));
    const accepted = useHomeStore.getState().deviceStates;
    expect(accepted[vacuum.id].on).toBe(true);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    runDeviceAction(vacuum.id, vacuumControllerActionId('dock'));
    runDeviceAction(vacuum.id, vacuumControllerActionId('suctionDown'));
    setDeviceSetting(vacuum.id, 'vacuumQuietMode', true);
    toggleDevice(vacuum.id);
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
  });
});
