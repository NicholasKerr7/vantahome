import { beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, getCapabilities } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import {
  CLIMATE_FAN_BOUNDS, CLIMATE_MODE_OPTIONS, CLIMATE_PRESET_OPTIONS, CLIMATE_SWING_OPTIONS,
  CLIMATE_TEMPERATURE_BOUNDS, climateActionId, climatePresetCommand, climateTemperatureStepLabel,
  formatClimateTemperature, readClimateControllerState,
  type ClimateControllerKey, type ClimatePreset,
} from './climateController';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const ac = getDevice('master-ac')!;

/** Exercise the exact commands consumed by native and web without bypassing the reducers. */
function applyPreset(state: DeviceState, preset: ClimatePreset): DeviceState {
  const command = climatePresetCommand(preset);
  return command.type === 'action'
    ? runDeviceActionState(ac.id, state, command.actionId)
    : applyDeviceSetting(ac.id, state, command.field, command.value);
}

/** Verify native hydration and browser persistence retain the same validated controller state. */
function expectRetained(state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[ac.id] = state;
  const native = parseStoredSimulationSnapshotMessage(JSON.stringify({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot }));
  const browser = createDefaultState();
  browser.deviceStates[ac.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[ac.id]).toEqual(state);
  expect(restored.deviceStates[ac.id]).toEqual(state);
}

describe('shared climate controller', () => {
  beforeEach(() => useHomeStore.setState(createDefaultState()));

  it('keeps mode, swing, bounds and commands aligned with the allowlisted catalog', () => {
    const capabilities = getCapabilities('ac');
    for (const [field, options] of [['mode', CLIMATE_MODE_OPTIONS], ['acSwingMode', CLIMATE_SWING_OPTIONS]] as const) {
      const capability = capabilities.find((item) => 'field' in item && item.field === field);
      expect(capability?.type).toBe('enum');
      if (capability?.type !== 'enum') throw new Error('Expected a climate selector');
      expect(capability.options).toEqual(options);
    }
    const keys: ClimateControllerKey[] = ['temperatureUp', 'temperatureDown', 'fanUp', 'fanDown'];
    const actions = capabilities.filter((item) => item.type === 'action');
    expect(new Set(keys.map(climateActionId)).size).toBe(keys.length);
    for (const key of keys) expect(actions.some((action) => action.id === climateActionId(key))).toBe(true);
    for (const [field, bounds] of [['tempC', CLIMATE_TEMPERATURE_BOUNDS], ['acFanSpeed', CLIMATE_FAN_BOUNDS]] as const) {
      const capability = capabilities.find((item) => 'field' in item && item.field === field);
      expect(capability).toMatchObject({ type: 'range', min: bounds.min, max: bounds.max });
    }
    expect(CLIMATE_PRESET_OPTIONS.map((option) => option.value)).toEqual(['normal', 'eco', 'quiet', 'turbo']);
  });

  it('projects sparse defaults and saved setpoints without inventing a room reading', () => {
    const state = { on: false, level: 50 };
    expect(readClimateControllerState(ac, state)).toEqual({
      on: false, targetC: 22, mode: 'cold', fanSpeed: 60, swing: 'both', preset: 'normal',
      airflowStrength: 0, tempMin: 15, tempMax: 28, fanMin: 0, fanMax: 100,
    });
    expect(readClimateControllerState(ac, { on: true, level: 0, settings: {
      tempC: 28, mode: 'dry', acFanSpeed: 47, acSwingMode: 'horizontal',
    } })).toMatchObject({ targetC: 28, mode: 'dry', fanSpeed: 47, swing: 'horizontal', airflowStrength: 0.47 });
  });

  it('formats the preferred temperature unit without changing persisted Celsius targets or steps', () => {
    const state = { on: false, level: 50, settings: { tempC: 22 } };
    const target = readClimateControllerState(ac, state).targetC;
    expect(formatClimateTemperature(target, 'C')).toBe('22');
    expect(formatClimateTemperature(target, 'F')).toBe('72');
    expect(formatClimateTemperature(15, 'F')).toBe('59');
    expect(formatClimateTemperature(28, 'F')).toBe('82');
    expect(climateTemperatureStepLabel('C')).toBe('1°C');
    expect(climateTemperatureStepLabel('F')).toBe('1.8°F');
    const next = runDeviceActionState(ac.id, state, climateActionId('temperatureUp'));
    expect(next.settings?.tempC).toBe(23);
    expect(formatClimateTemperature(readClimateControllerState(ac, next).targetC, 'F')).toBe('73');
    expect(state.settings.tempC).toBe(22);
  });

  it.each([false, true])('bounds relative setpoints while preserving power %s and unrelated preferences', (on) => {
    const original = { on, level: 50, settings: { tempC: 22, mode: 'fan', acFanSpeed: 55, acSwingMode: 'vertical', scheduleEnabled: true } };
    let state: DeviceState = original;
    for (let index = 0; index < 20; index += 1) {
      state = runDeviceActionState(ac.id, state, climateActionId('temperatureUp'));
      state = runDeviceActionState(ac.id, state, climateActionId('fanUp'));
    }
    expect(readClimateControllerState(ac, state)).toMatchObject({ on, targetC: 28, fanSpeed: 100, mode: 'fan', swing: 'vertical' });
    expect(state.settings?.scheduleEnabled).toBe(true);
    expect(deviceActionFeedback(ac, state)).toBe('Fan 100% · simulation');
    expectRetained(state);
    for (let index = 0; index < 20; index += 1) {
      state = runDeviceActionState(ac.id, state, climateActionId('fanDown'));
      state = runDeviceActionState(ac.id, state, climateActionId('temperatureDown'));
    }
    expect(readClimateControllerState(ac, state)).toMatchObject({ on, targetC: 15, fanSpeed: 0, mode: 'fan', swing: 'vertical', airflowStrength: 0 });
    expect(deviceActionFeedback(ac, state)).toBe('Target 15°C · simulation');
    expect(original.settings).toEqual({ tempC: 22, mode: 'fan', acFanSpeed: 55, acSwingMode: 'vertical', scheduleEnabled: true });
    expectRetained(state);
  });

  it('accumulates rapid keys using the latest shared state and retains temperature across modes', () => {
    const store = useHomeStore.getState();
    store.setDeviceSetting(ac.id, 'tempC', 22);
    store.setDeviceSetting(ac.id, 'acFanSpeed', 20);
    const beforePower = store.deviceStates[ac.id].on;
    for (let index = 0; index < 4; index += 1) {
      store.runDeviceAction(ac.id, climateActionId('temperatureUp'));
      store.runDeviceAction(ac.id, climateActionId('fanUp'));
    }
    store.runDeviceAction(ac.id, climateActionId('temperatureDown'));
    store.runDeviceAction(ac.id, climateActionId('fanDown'));
    for (const option of CLIMATE_MODE_OPTIONS) {
      store.setDeviceSetting(ac.id, 'mode', option.value);
      const state = useHomeStore.getState().deviceStates[ac.id];
      expect(readClimateControllerState(ac, state)).toMatchObject({ on: beforePower, targetC: 25, fanSpeed: 50, mode: option.value });
      expectRetained(state);
    }
  });

  it.each([false, true])('keeps presets exclusive and manual airflow honest while power is %s', (on) => {
    let state: DeviceState = { on, level: 50, settings: { tempC: 22, acFanSpeed: 80, mode: 'dry', acSwingMode: 'off' } };
    for (const [preset, strength] of [['eco', 0.5], ['turbo', 1], ['quiet', 0.3], ['normal', 0.8]] as const) {
      state = applyPreset(state, preset);
      expect(readClimateControllerState(ac, state)).toMatchObject({ on, preset, fanSpeed: 80, targetC: 22, mode: 'dry', swing: 'off', airflowStrength: on ? strength : 0 });
      expect(state.settings).toMatchObject({ acEcoMode: preset === 'eco', acTurboMode: preset === 'turbo', acQuietMode: preset === 'quiet' });
      expectRetained(state);
    }
    state = applyPreset(state, 'turbo');
    state = runDeviceActionState(ac.id, state, climateActionId('fanDown'));
    expect(readClimateControllerState(ac, state)).toMatchObject({ on, preset: 'normal', fanSpeed: 70, airflowStrength: on ? 0.7 : 0 });
    const toggled = toggleDeviceState(ac.id, state);
    expect(readClimateControllerState(ac, toggled)).toMatchObject({ on: !on, targetC: 22, fanSpeed: 70, mode: 'dry', swing: 'off' });
  });

  it('matches scene airflow when older saves contain conflicting presets', () => {
    const state = { on: true, level: 50, settings: { acFanSpeed: 80, acQuietMode: true, acEcoMode: true, acTurboMode: true } };
    expect(readClimateControllerState(ac, state)).toMatchObject({ preset: 'quiet', airflowStrength: 0.3 });
    expect(readClimateControllerState(ac, { ...state, settings: { ...state.settings, acQuietMode: false } })).toMatchObject({ preset: 'eco', airflowStrength: 0.5 });
    expect(readClimateControllerState(ac, applyPreset(state, 'normal'))).toMatchObject({ preset: 'normal', airflowStrength: 0.8 });
  });

  it('rejects malformed native state rather than accepting unsupported readings or controls', () => {
    const malformedSettings: NonNullable<DeviceState['settings']>[] = [
      { tempC: 29 }, { acFanSpeed: -1 }, { mode: 'heat' }, { acSwingMode: 'diagonal' },
      { roomTemperatureC: 22 }, { lastAction: 'ac-start-hardware' },
    ];
    for (const settings of malformedSettings) {
      const snapshot = createDefaultSimulationSnapshot();
      snapshot.deviceStates[ac.id] = { on: true, level: 50, settings };
      expect(parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot })).toBeNull();
    }
  });
});
