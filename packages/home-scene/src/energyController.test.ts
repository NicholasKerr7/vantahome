import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice, type DeviceDefinition } from './data';
import { DEVICE_KINDS, getCapabilities, validateSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import {
  BATTERY_RESERVE_PRESETS, BATTERY_STORAGE_OPTIONS, GENERATOR_MODE_OPTIONS,
  energyActionId, formatEnergyReading, isEnergyDeviceKind, readEnergyControllerState,
  type EnergyReading,
} from './energyController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const energy = getDevice('utility-energy')!;
const solar = getDevice('utility-solar')!;
const battery = getDevice('utility-battery')!;
const generator = getDevice('utility-generator')!;
const energyDevices = [energy, solar, battery, generator] as const;

/** Give each case a fresh simulation and restore authorization after revocation checks. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Verify that native hydration and browser restoration retain the same valid local state. */
function expectRetained(device: DeviceDefinition, state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[device.id] = state;
  const native = parseStoredSimulationSnapshotMessage(JSON.stringify({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot,
  }));
  const browser = createDefaultState();
  browser.deviceStates[device.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[device.id]).toEqual(state);
  expect(restored.deviceStates[device.id]).toEqual(state);
  expect(readEnergyControllerState(device, native!.state.deviceStates[device.id])).toEqual(readEnergyControllerState(device, state));
  expect(readEnergyControllerState(device, restored.deviceStates[device.id])).toEqual(readEnergyControllerState(device, state));
}

describe('shared energy controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports only the four energy device kinds and the existing catalog choices and actions', () => {
    expect(DEVICE_KINDS.filter(isEnergyDeviceKind)).toEqual(['energy', 'generator', 'battery', 'solar']);
    expect(readEnergyControllerState(getDevice('living-light')!, { on: true, level: 50 })).toBeNull();
    for (const [device, field, options] of [
      [battery, 'storageMode', BATTERY_STORAGE_OPTIONS], [generator, 'generatorMode', GENERATOR_MODE_OPTIONS],
    ] as const) {
      const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
      expect(capability?.type === 'enum' ? capability.options : null).toEqual(options);
    }
    const reserve = getCapabilities('battery').find((item) => 'field' in item && item.field === 'reservePercent')!;
    expect(BATTERY_RESERVE_PRESETS.map((preset) => preset.value)).toEqual([20, 40, 60]);
    for (const preset of BATTERY_RESERVE_PRESETS) expect(validateSetting(reserve, preset.value)).toBe(preset.value);
    const actions = getCapabilities('energy').filter((item) => item.type === 'action').map((item) => item.id);
    expect(actions).toContain(energyActionId('outage'));
    expect(actions).toContain(energyActionId('restoreGrid'));
  });

  it('keeps the meter and solar samples independent without inferring a home power balance', () => {
    const states = createDefaultState().deviceStates;
    expect(readEnergyControllerState(energy, states[energy.id])).toMatchObject({
      kind: 'energy', on: true, gridAvailable: true, status: 'Grid available · sample',
      headline: { label: 'Demand sample', value: 680, unit: 'W' },
      metrics: [
        { label: 'Today', value: 4.2, unit: 'kWh' }, { label: 'Solar sample', value: 420, unit: 'W' },
        { label: 'Solar today', value: 1.4, unit: 'kWh' }, { label: 'Grid today', value: 2.8, unit: 'kWh' },
      ],
      primaryActionLabel: 'Check sample', outageAlerts: true, budgetKwh: 120,
    });
    expect(readEnergyControllerState(solar, states[solar.id])).toMatchObject({
      kind: 'solar', headline: { label: 'Generation sample', value: 3200, unit: 'W' },
      metrics: [{ label: 'Today', value: 18.4, unit: 'kWh' }, { label: 'Inverter sample', value: 'Generating', unit: '' }],
      primaryActionLabel: 'Check sample', sampleChecked: false, inverterStatus: 'Generating',
    });
  });

  it('uses canonical battery charge and generator output rather than stale settings aliases', () => {
    const states = createDefaultState().deviceStates;
    expect(readEnergyControllerState(battery, { ...states[battery.id], settings: { chargePercent: 84 } })).toMatchObject({
      kind: 'battery', chargePercent: 78, headline: { value: 78, unit: '%' }, reservePercent: 25,
      capacityKwh: 13.5, storageMode: 'backup', status: 'Enabled', primaryActionLabel: null,
    });
    expect(readEnergyControllerState(generator, { ...states[generator.id], settings: { powerW: 9000 } })).toMatchObject({
      kind: 'generator', on: false, outputW: 0, fuelPercent: 82, mode: 'auto', primaryActionLabel: 'Start simulation',
    });
    expect(readEnergyControllerState(generator, { ...states[generator.id], on: true, settings: { powerW: 9000 } })).toMatchObject({
      on: true, outputW: 3900, headline: { value: 3900, unit: 'W' }, primaryActionLabel: 'Stop simulation',
    });
  });

  it.each([energy, solar])('checks the %s sample without manufacturing new readings or toggling sensor power', (device) => {
    const state = { on: false, level: 55 };
    const before = readEnergyControllerState(device, state)!;
    const checked = toggleDeviceState(device.id, state);
    expect(checked).toEqual({ ...state, on: true, settings: { sampleChecked: true } });
    expect(readEnergyControllerState(device, checked)).toMatchObject({
      on: true, headline: before.headline, metrics: before.metrics, primaryActionLabel: 'Check sample',
    });
    expect(toggleDeviceState(device.id, checked)).toEqual(checked);
    if (device.kind === 'solar') expect(readEnergyControllerState(device, checked)).toMatchObject({ sampleChecked: true, status: 'Sample checked' });
    expectRetained(device, checked);
  });

  it.each([false, true])('keeps reserve and storage preferences separate from battery power %s and charge', (on) => {
    const original = { on, level: 0 };
    for (const mode of BATTERY_STORAGE_OPTIONS) {
      const preferred = applyDeviceSetting(battery.id, original, 'storageMode', mode.value);
      const low = applyDeviceSetting(battery.id, preferred, 'reservePercent', -10);
      const high = applyDeviceSetting(battery.id, preferred, 'reservePercent', 110);
      expect(readEnergyControllerState(battery, low)).toMatchObject({ on, chargePercent: 0, reservePercent: 10, storageMode: mode.value, status: on ? 'Enabled' : 'Off' });
      expect(readEnergyControllerState(battery, high)).toMatchObject({ on, chargePercent: 0, reservePercent: 100, storageMode: mode.value });
      expectRetained(battery, low);
      expectRetained(battery, high);
    }
    for (const preset of BATTERY_RESERVE_PRESETS) {
      const state = applyDeviceSetting(battery.id, original, 'reservePercent', preset.value);
      expect(state).toEqual({ ...original, settings: { reservePercent: preset.value } });
      expectRetained(battery, state);
    }
    expect(applyDeviceSetting(battery.id, original, 'reservePercent', Number.NaN)).toBe(original);
    expect(applyDeviceSetting(battery.id, original, 'storageMode', 'discharging')).toBe(original);
  });

  it('starts and stops the generator simulation without changing its selected start preference', () => {
    const original = { on: false, level: 20 };
    for (const option of GENERATOR_MODE_OPTIONS) {
      const preferred = applyDeviceSetting(generator.id, original, 'generatorMode', option.value);
      expect(preferred.on).toBe(false);
      const running = toggleDeviceState(generator.id, preferred);
      const stopped = toggleDeviceState(generator.id, running);
      expect(readEnergyControllerState(generator, running)).toMatchObject({
        on: true, outputW: 1200, mode: option.value, fuelPercent: 82, status: 'Running simulation',
      });
      expect(readEnergyControllerState(generator, stopped)).toMatchObject({
        on: false, outputW: 0, mode: option.value, fuelPercent: 82, status: 'Stopped simulation',
      });
      expect(stopped).toEqual(preferred);
      expectRetained(generator, running);
      expectRetained(generator, stopped);
    }
  });

  it('saves bounded meter preferences without altering samples or off state', () => {
    const original = { on: false, level: 55 };
    const alerts = applyDeviceSetting(energy.id, original, 'gridOutageAlerts', false);
    const low = applyDeviceSetting(energy.id, alerts, 'energyBudgetKwh', 0);
    const high = applyDeviceSetting(energy.id, alerts, 'energyBudgetKwh', 500);
    const before = readEnergyControllerState(energy, original)!;
    expect(readEnergyControllerState(energy, low)).toMatchObject({ on: false, outageAlerts: false, budgetKwh: 50, headline: before.headline, metrics: before.metrics });
    expect(readEnergyControllerState(energy, high)).toMatchObject({ on: false, outageAlerts: false, budgetKwh: 200 });
    expectRetained(energy, low);
    expectRetained(energy, high);
  });

  it('changes only the selected grid sample on outage and restore, leaving independent sources untouched', () => {
    const initial = createDefaultState();
    initial.deviceStates[energy.id] = { on: false, level: 55, settings: { energyBudgetKwh: 150, gridOutageAlerts: false } };
    useHomeStore.setState(initial);
    const before = useHomeStore.getState().deviceStates;
    const send = useHomeStore.getState().runDeviceAction;
    for (const [key, gridAvailable] of [['outage', false], ['restoreGrid', true]] as const) {
      send(energy.id, energyActionId(key));
      const states = useHomeStore.getState().deviceStates;
      expect(states[energy.id]).toEqual({ ...before[energy.id], settings: { ...before[energy.id].settings, gridAvailable, lastAction: energyActionId(key) } });
      expect(readEnergyControllerState(energy, states[energy.id])).toMatchObject({ gridAvailable, headline: { value: 680 }, budgetKwh: 150, outageAlerts: false, on: false });
      for (const device of [solar, battery, generator]) expect(states[device.id]).toBe(before[device.id]);
      expectRetained(energy, states[energy.id]);
    }
    expect(runDeviceActionState(generator.id, before[generator.id], energyActionId('outage'))).toBe(before[generator.id]);
  });

  it('keeps telemetry read-only through the existing setting reducer', () => {
    const states = createDefaultState().deviceStates;
    for (const device of energyDevices) {
      for (const capability of getCapabilities(device.kind)) {
        if (capability.type !== 'stat') continue;
        expect(applyDeviceSetting(device.id, states[device.id], capability.field, 50)).toBe(states[device.id]);
      }
    }
  });

  it('represents malformed readings as unavailable while preserving valid zero samples', () => {
    const invalidMeter = readEnergyControllerState(energy, { on: true, level: 55, settings: {
      powerW: Number.NaN, energyTodayKwh: Number.POSITIVE_INFINITY, solarW: '420', solarTodayKwh: 0, gridTodayKwh: Number.NEGATIVE_INFINITY, gridAvailable: 'false',
    } });
    expect(invalidMeter).toMatchObject({ gridAvailable: null, status: 'Grid status unavailable', headline: { value: null }, metrics: [
      { value: null }, { value: null }, { value: 0 }, { value: null },
    ] });
    expect(readEnergyControllerState(battery, { on: false, level: Number.NaN, settings: { capacityKwh: Number.POSITIVE_INFINITY } })).toMatchObject({ chargePercent: null, capacityKwh: null, status: 'Off' });
    expect(readEnergyControllerState(generator, { on: true, level: Number.NaN, settings: { fuelPercent: Number.NaN } })).toMatchObject({ outputW: null, fuelPercent: null });
    expect(readEnergyControllerState(generator, { on: false, level: Number.NaN })).toMatchObject({ outputW: 0 });
    expect(readEnergyControllerState(solar, { on: true, level: 55, settings: { solarW: 0, solarTodayKwh: Number.NaN, inverterStatus: false, sampleChecked: 'false' } })).toMatchObject({
      headline: { value: 0 }, metrics: [{ value: null }, { value: 'Unavailable' }], inverterStatus: 'Unavailable', sampleChecked: false, status: 'Monitoring sample',
    });
  });

  it('uses canonical defaults and bounds for malformed saved preferences', () => {
    expect(readEnergyControllerState(battery, { on: false, level: 50, settings: { reservePercent: Number.NaN, storageMode: 'invalid' } })).toMatchObject({ reservePercent: 25, storageMode: 'backup', on: false });
    expect(readEnergyControllerState(battery, { on: false, level: 50, settings: { reservePercent: 101 } })).toMatchObject({ reservePercent: 100 });
    expect(readEnergyControllerState(generator, { on: false, level: 50, settings: { generatorMode: 'invalid' } })).toMatchObject({ mode: 'auto', on: false });
    expect(readEnergyControllerState(energy, { on: true, level: 50, settings: { energyBudgetKwh: Number.NaN, gridOutageAlerts: 'false' } })).toMatchObject({ budgetKwh: 120, outageAlerts: true });
  });

  it.each([
    [680, 'W', '0.68', 'kW'], [3900, 'W', '3.90', 'kW'], [0, 'W', '0.00', 'kW'],
    [18.4, 'kWh', '18.4', 'kWh'], [0, '%', '0', '%'], ['Generating', '', 'Generating', ''],
    [null, 'W', '—', ''], [Number.NaN, '%', '—', ''], [Number.POSITIVE_INFINITY, 'W', '—', ''],
  ] as const)('formats %s %s without leaking invalid numbers', (value, unit, expectedValue, expectedUnit) => {
    const reading: EnergyReading = { label: 'Sample', value, unit };
    expect(formatEnergyReading(reading)).toEqual({ value: expectedValue, unit: expectedUnit });
  });

  it.each(energyDevices)('blocks view-only and revoked %s commands even through retained callbacks', (device) => {
    const initial = useHomeStore.getState().deviceStates;
    const { toggleDevice, setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    const field = device.kind === 'battery' ? 'reservePercent' : device.kind === 'generator' ? 'generatorMode' : 'gridOutageAlerts';
    const value = device.kind === 'battery' ? 60 : device.kind === 'generator' ? 'manual' : false;
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [device.roomId], deviceIds: [device.id] };
    useHomeStore.setState({ access });
    toggleDevice(device.id);
    setDeviceSetting(device.id, field, value);
    runDeviceAction(device.id, energyActionId('outage'));
    expect(useHomeStore.getState().deviceStates).toBe(initial);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [device.id] } });
    toggleDevice(device.id);
    const accepted = useHomeStore.getState().deviceStates;
    expect(accepted[device.id]).not.toBe(initial[device.id]);
    for (const other of energyDevices) if (other.id !== device.id) expect(accepted[other.id]).toBe(initial[other.id]);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    toggleDevice(device.id);
    setDeviceSetting(device.id, field, value);
    runDeviceAction(device.id, energyActionId('outage'));
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
  });
});
