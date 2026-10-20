import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice, type DeviceDefinition } from './data';
import { DEVICE_KINDS, deviceActionFeedback, getCapabilities } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
import {
  WATER_BUDGET_BOUNDS, WATER_HEATER_MODE_OPTIONS, WATER_HEATER_TEMPERATURE_BOUNDS,
  isWaterDeviceKind, readWaterControllerState, waterControllerActionId,
} from './waterController';

const heater = getDevice('utility-water-heater')!;
const meter = getDevice('utility-water')!;

/** Each case starts with an independent snapshot and restores its temporary access changes. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Saved controls must round-trip through both native hydration and browser restoration. */
function expectRetained(device: DeviceDefinition, state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[device.id] = state;
  const native = parseStoredSimulationSnapshotMessage({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot,
  });
  const browser = createDefaultState();
  browser.deviceStates[device.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[device.id]).toEqual(state);
  expect(restored.deviceStates[device.id]).toEqual(state);
  expect(readWaterControllerState(device, native!.state.deviceStates[device.id])).toEqual(readWaterControllerState(device, state));
  expect(readWaterControllerState(device, restored.deviceStates[device.id])).toEqual(readWaterControllerState(device, state));
}

describe('shared water controllers', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports only water meter and heater kinds with catalog-aligned controls', () => {
    expect(DEVICE_KINDS.filter(isWaterDeviceKind)).toEqual(['water', 'water-heater']);
    expect(readWaterControllerState(getDevice('living-light')!, { on: true, level: 55 })).toBeNull();
    const mode = getCapabilities('water-heater').find((item) => 'field' in item && item.field === 'heaterMode');
    expect(mode?.type === 'enum' ? mode.options : null).toEqual(WATER_HEATER_MODE_OPTIONS);
    for (const [kind, field, bounds] of [
      ['water-heater', 'tempC', WATER_HEATER_TEMPERATURE_BOUNDS],
      ['water', 'waterBudgetL', WATER_BUDGET_BOUNDS],
    ] as const) {
      const capability = getCapabilities(kind).find((item) => 'field' in item && item.field === field);
      expect(capability).toMatchObject({ type: 'range', min: bounds.min, max: bounds.max });
      if (capability?.type !== 'range') throw new Error('Expected a bounded water preference');
      expect(capability.step ?? 1).toBe(bounds.step);
    }
    for (const [kind, keys] of [
      ['water-heater', ['temperatureUp', 'temperatureDown']],
      ['water', ['budgetUp', 'budgetDown']],
    ] as const) {
      for (const key of keys) {
        const action = getCapabilities(kind).find((item) => item.id === waterControllerActionId(key));
        expect(action?.type).toBe('action');
        // Heater settings have no thermal engine; meter budgets drive existing local condition reports.
        if (kind === 'water-heater') expect(action?.configurationOnly).toBe(true);
        else expect(action?.configurationOnly).toBeUndefined();
      }
    }
  });

  it('projects remembered heater targets without inventing measured temperature or heat progress', () => {
    expect(readWaterControllerState(heater, { on: false, level: 55 })).toEqual({
      kind: 'water-heater', on: false, status: 'Off · settings remembered',
      targetC: 52, tempMin: 40, tempMax: 70, mode: 'eco',
      recirculation: true, heaterType: 'electric-tank',
    });
    expect(readWaterControllerState(heater, {
      on: true, level: 0, settings: { tempC: 61, heaterMode: 'vacation', recirculation: false, waterHeaterType: 'tankless' },
    })).toMatchObject({
      kind: 'water-heater', on: true, status: 'Enabled · target setting',
      targetC: 61, mode: 'vacation', recirculation: false, heaterType: 'tankless',
    });
  });

  it('projects independent local meter samples with explicit leak state', () => {
    expect(readWaterControllerState(meter, { on: true, level: 60 })).toEqual({
      kind: 'water', on: true, status: 'Monitoring sample',
      flowLpm: 8, todayL: 120, pressurePsi: 52, temperatureC: 18,
      leakDetected: false, sampleChecked: false, leakAlerts: true, pressureAlerts: true,
      autoShutoff: false, budgetL: 220, budgetMin: 100, budgetMax: 400,
    });
    expect(readWaterControllerState(meter, {
      on: true, level: 60, settings: { waterLeakDetected: true, waterLeakAlerts: false, sampleChecked: true },
    })).toMatchObject({ status: 'Leak detected · sample', leakDetected: true, leakAlerts: false, sampleChecked: true });
  });

  it.each([false, true])('keeps heater power %s, modes and other preferences while bounding repeated target presses', (on) => {
    const original = { on, level: 55, settings: {
      tempC: 52, heaterMode: 'standard', recirculation: false, antiLegionella: true,
      vacationDays: 7, heaterScheduleEnabled: true, waterHeaterType: 'heat-pump',
    } };
    let state: DeviceState = original;
    for (let index = 0; index < 40; index += 1) state = runDeviceActionState(heater.id, state, waterControllerActionId('temperatureUp'));
    expect(readWaterControllerState(heater, state)).toMatchObject({ on, targetC: 70, mode: 'standard', recirculation: false, heaterType: 'heat-pump' });
    expect(state.settings).toMatchObject({ antiLegionella: true, vacationDays: 7, heaterScheduleEnabled: true });
    expect(deviceActionFeedback(heater, state)).toBe('Target 70°C · saved preference');
    expectRetained(heater, state);
    for (let index = 0; index < 40; index += 1) state = runDeviceActionState(heater.id, state, waterControllerActionId('temperatureDown'));
    expect(readWaterControllerState(heater, state)).toMatchObject({ on, targetC: 40, mode: 'standard', recirculation: false });
    expect(deviceActionFeedback(heater, state)).toBe('Target 40°C · saved preference');
    expectRetained(heater, state);
    expect(original.settings.tempC).toBe(52);
  });

  it.each([false, true])('retains heater choices and target while power is %s, including after power toggles', (on) => {
    for (const option of WATER_HEATER_MODE_OPTIONS) {
      const original = { on, level: 55, settings: { tempC: 58, recirculation: false } };
      const preferred = applyDeviceSetting(heater.id, original, 'heaterMode', option.value);
      const recirculating = applyDeviceSetting(heater.id, preferred, 'recirculation', true);
      expect(readWaterControllerState(heater, recirculating)).toMatchObject({ on, targetC: 58, mode: option.value, recirculation: true });
      const toggled = toggleDeviceState(heater.id, recirculating);
      expect(readWaterControllerState(heater, toggled)).toMatchObject({ on: !on, targetC: 58, mode: option.value, recirculation: true });
      expectRetained(heater, preferred);
      expectRetained(heater, toggled);
    }
  });

  it.each([false, true])('bounds meter budget while preserving power %s and all sample fields', (on) => {
    const original = { on, level: 60, settings: { waterLeakAlerts: false, waterPressureAlerts: false, waterAutoShutoff: true, waterBudgetL: 220 } };
    let state: DeviceState = original;
    for (let index = 0; index < 20; index += 1) state = runDeviceActionState(meter.id, state, waterControllerActionId('budgetUp'));
    expect(readWaterControllerState(meter, state)).toMatchObject({
      on, flowLpm: 8, todayL: 120, pressurePsi: 52, temperatureC: 18,
      leakDetected: false, leakAlerts: false, pressureAlerts: false, autoShutoff: true, budgetL: 400,
    });
    expect(deviceActionFeedback(meter, state)).toBe('Usage budget 400 L · saved preference');
    expectRetained(meter, state);
    for (let index = 0; index < 20; index += 1) state = runDeviceActionState(meter.id, state, waterControllerActionId('budgetDown'));
    expect(readWaterControllerState(meter, state)).toMatchObject({ on, budgetL: 100, flowLpm: 8, todayL: 120, pressurePsi: 52 });
    expectRetained(meter, state);
    expect(original.settings.waterBudgetL).toBe(220);
  });

  it('accumulates rapid presses against current store state and changes only the selected device', () => {
    const before = useHomeStore.getState().deviceStates;
    const { runDeviceAction } = useHomeStore.getState();
    for (let index = 0; index < 4; index += 1) {
      runDeviceAction(heater.id, waterControllerActionId('temperatureUp'));
      runDeviceAction(meter.id, waterControllerActionId('budgetUp'));
    }
    runDeviceAction(heater.id, waterControllerActionId('temperatureDown'));
    runDeviceAction(meter.id, waterControllerActionId('budgetDown'));
    const after = useHomeStore.getState().deviceStates;
    expect(readWaterControllerState(heater, after[heater.id])).toMatchObject({ targetC: 55, on: before[heater.id].on });
    expect(readWaterControllerState(meter, after[meter.id])).toMatchObject({ budgetL: 280, on: before[meter.id].on });
    for (const [id, state] of Object.entries(before)) if (![heater.id, meter.id].includes(id)) expect(after[id]).toBe(state);
    expectRetained(heater, after[heater.id]);
    expectRetained(meter, after[meter.id]);
  });

  it('checks the existing meter sample without inventing new readings, closing a valve, or clearing a leak', () => {
    const original = { on: false, level: 60, settings: { waterAutoShutoff: true, waterLeakAlerts: false, waterPressureAlerts: false, waterBudgetL: 300 } };
    const before = readWaterControllerState(meter, original);
    const checked = toggleDeviceState(meter.id, original);
    expect(checked).toEqual({ ...original, on: true, settings: { ...original.settings, sampleChecked: true } });
    expect(readWaterControllerState(meter, checked)).toEqual({ ...before, on: true, status: 'Sample checked', sampleChecked: true });
    expect(toggleDeviceState(meter.id, checked)).toEqual(checked);
    expectRetained(meter, checked);
    const leak = { ...original, settings: { ...original.settings, waterLeakDetected: true } };
    expect(readWaterControllerState(meter, toggleDeviceState(meter.id, leak))).toMatchObject({
      leakDetected: true, status: 'Leak detected · sample', flowLpm: 8, autoShutoff: true,
    });
  });

  it('keeps samples read-only and rejects unrelated commands or malformed preferences', () => {
    const state = { on: false, level: 55 };
    for (const capability of getCapabilities('water')) {
      if (capability.type === 'stat') expect(applyDeviceSetting(meter.id, state, capability.field, 0)).toBe(state);
    }
    expect(applyDeviceSetting(heater.id, state, 'tempC', Number.NaN)).toBe(state);
    expect(applyDeviceSetting(heater.id, state, 'heaterMode', 'heating')).toBe(state);
    expect(applyDeviceSetting(meter.id, state, 'waterBudgetL', Number.POSITIVE_INFINITY)).toBe(state);
    expect(applyDeviceSetting(meter.id, state, 'waterValveOpen', false)).toBe(state);
    expect(runDeviceActionState(meter.id, state, waterControllerActionId('temperatureUp'))).toBe(state);
    expect(runDeviceActionState(heater.id, state, waterControllerActionId('budgetDown'))).toBe(state);
    expect(runDeviceActionState(heater.id, state, 'water-heater-start-hardware')).toBe(state);
  });

  it('shows malformed samples as unavailable and preserves genuine zero readings', () => {
    expect(readWaterControllerState(meter, { on: true, level: 60, settings: {
      waterLpm: Number.NaN, waterTodayL: Number.POSITIVE_INFINITY, waterPressurePsi: '52',
      waterTempC: -1, waterLeakDetected: 'false', sampleChecked: 'true',
    } })).toMatchObject({
      flowLpm: null, todayL: null, pressurePsi: null, temperatureC: null,
      leakDetected: null, sampleChecked: false, status: 'Leak status unavailable',
    });
    expect(readWaterControllerState(meter, { on: true, level: 60, settings: {
      waterLpm: 0, waterTodayL: 0, waterPressurePsi: 0, waterTempC: 0, waterLeakDetected: false,
    } })).toMatchObject({ flowLpm: 0, todayL: 0, pressurePsi: 0, temperatureC: 0, leakDetected: false });
    expect(readWaterControllerState(meter, { on: true, level: 60, settings: { waterLpm: -3, waterTodayL: -1, waterPressurePsi: -1 } }))
      .toMatchObject({ flowLpm: null, todayL: null, pressurePsi: null });
  });

  it('uses catalog defaults and bounds for malformed preferences instead of nonfinite targets', () => {
    expect(readWaterControllerState(heater, { on: false, level: 55, settings: {
      tempC: Number.NaN, heaterMode: 'unsupported', recirculation: 'true', waterHeaterType: false,
    } })).toMatchObject({ on: false, targetC: 52, mode: 'eco', recirculation: true, heaterType: 'electric-tank' });
    expect(readWaterControllerState(heater, { on: true, level: 55, settings: { tempC: 99 } })).toMatchObject({ targetC: 70 });
    expect(readWaterControllerState(meter, { on: false, level: 60, settings: {
      waterBudgetL: Number.NaN, waterLeakAlerts: 'false', waterPressureAlerts: 0, waterAutoShutoff: 'true',
    } })).toMatchObject({ on: false, budgetL: 220, leakAlerts: true, pressureAlerts: true, autoShutoff: false });
    expect(readWaterControllerState(meter, { on: true, level: 60, settings: { waterBudgetL: 999 } })).toMatchObject({ budgetL: 400 });
  });

  it('rejects out-of-schema native state without granting invented heating or valve capabilities', () => {
    for (const [device, settings] of [
      [heater, { tempC: 71 }], [heater, { heaterMode: 'heating' }], [heater, { actualTankTempC: 52 }],
      [meter, { waterBudgetL: 420 }], [meter, { waterValveOpen: true }], [meter, { lastAction: 'water-close-valve' }],
    ] as const) {
      const snapshot = createDefaultSimulationSnapshot();
      snapshot.deviceStates[device.id] = { on: true, level: 55, settings };
      expect(parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot })).toBeNull();
    }
  });

  it.each([heater, meter])('blocks view-only and revoked %s controls even through retained callbacks', (device) => {
    const before = useHomeStore.getState().deviceStates;
    const { toggleDevice, setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    const field = device.kind === 'water' ? 'waterLeakAlerts' : 'recirculation';
    const key = device.kind === 'water' ? 'budgetUp' : 'temperatureUp';
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [device.roomId], deviceIds: [device.id] };
    useHomeStore.setState({ access });
    toggleDevice(device.id);
    setDeviceSetting(device.id, field, false);
    runDeviceAction(device.id, waterControllerActionId(key));
    expect(useHomeStore.getState().deviceStates).toBe(before);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [device.id] } });
    runDeviceAction(device.id, waterControllerActionId(key));
    const accepted = useHomeStore.getState().deviceStates;
    expect(accepted[device.id]).not.toBe(before[device.id]);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    toggleDevice(device.id);
    setDeviceSetting(device.id, field, false);
    runDeviceAction(device.id, waterControllerActionId(key));
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
  });
});
