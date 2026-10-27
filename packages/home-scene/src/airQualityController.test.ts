import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AIR_AQI_PRESETS, AIR_QUALITY_NOTE, readAirQualityControllerState } from './airQualityController';
import { getDevice } from './data';
import { applyDeviceSetting, toggleDeviceState } from './deviceControlActions';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState, SettingValue } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const air = getDevice('living-air')!;
const baseline: DeviceState = { on: true, level: 0 };
const readings = ['airQualityIndex', 'airCo2', 'airPm25', 'airPm10', 'airVoc', 'airPollen', 'humidity'] as const;
const thresholdSamples = [
  ['airQualityIndex', 'airAlertAqi', 100, 'AQI'],
  ['airCo2', 'airAlertCo2', 1200, 'CO₂'],
  ['airPm25', 'airAlertPm25', 35, 'PM2.5'],
  ['airPm10', 'airAlertPm10', 50, 'PM10'],
  ['airVoc', 'airAlertVoc', 300, 'VOC'],
  ['airPollen', 'airAlertPollen', 3, 'Pollen'],
] as const;

/** Isolate current simulation grants and state without touching another account or transport. */
function resetStore() { useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); }

/** Only validated preferences/check markers are persisted; the fixed samples come from the catalog. */
function expectRetained(state: DeviceState) {
  const snapshot = createDefaultSimulationSnapshot(); snapshot.deviceStates[air.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState(); browser.deviceStates[air.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[air.id]).toEqual(state);
  expect(restored.deviceStates[air.id]).toEqual(state);
  expect(readAirQualityControllerState(air, native!.state.deviceStates[air.id])).toEqual(readAirQualityControllerState(air, state));
}

beforeEach(resetStore); afterEach(resetStore);

describe('air-quality controller state', () => {
  it('projects established simulation readings only for an air monitor', () => {
    expect(readAirQualityControllerState(air, baseline)).toEqual({ aqi: 32, pm25: 8, co2: 620, voc: 120,
      humidity: 44, alertsEnabled: true, aqiThreshold: 100, sampleChecked: false,
      tone: 'within', status: 'Below saved limits', exceededLabels: [] });
    expect(readAirQualityControllerState(getDevice('living-light')!, baseline)).toBeNull();
    expect(AIR_QUALITY_NOTE).toBe('Fixed simulation samples · no live sensor connection');
  });

  it('preserves valid zero measurements without substituting defaults', () => {
    const state = { ...baseline, settings: Object.fromEntries(readings.map((field) => [field, 0])) };
    expect(readAirQualityControllerState(air, state)).toMatchObject({ aqi: 0, pm25: 0, co2: 0, voc: 0, humidity: 0,
      tone: 'within', status: 'Below saved limits' });
  });

  it.each([Number.NaN, Infinity, -1, '32', false, null, undefined])('keeps explicit malformed readings %s unknown', (value) => {
    for (const field of readings) {
      const state = { ...baseline, settings: { [field]: value } as Record<string, SettingValue> };
      const presentation = readAirQualityControllerState(air, state)!;
      expect(presentation.tone, field).toBe('unknown');
      expect(presentation.status, field).toBe('Sample unavailable');
      const displayField = { airQualityIndex: 'aqi', airPm25: 'pm25', airCo2: 'co2', airVoc: 'voc', humidity: 'humidity' } as const;
      if (field in displayField) expect(presentation[displayField[field as keyof typeof displayField]], field).toBeNull();
    }
  });

  it('rejects humidity above 100 without imposing an invented upper AQI scale', () => {
    expect(readAirQualityControllerState(air, { ...baseline, settings: { humidity: 101 } })).toMatchObject({ humidity: null, tone: 'unknown' });
    expect(readAirQualityControllerState(air, { ...baseline, settings: { airQualityIndex: 700 } })).toMatchObject({ aqi: 700, tone: 'exceeded' });
  });

  it.each(thresholdSamples)('uses strict greater-than for %s while describing equality accurately', (sample, threshold, limit, label) => {
    expect(readAirQualityControllerState(air, { ...baseline, settings: { [sample]: limit, [threshold]: limit } }))
      .toMatchObject({ tone: 'within', status: 'At saved limit', exceededLabels: [] });
    expect(readAirQualityControllerState(air, { ...baseline, settings: { [sample]: limit + 1, [threshold]: limit } }))
      .toMatchObject({ tone: 'exceeded', status: 'Saved limit exceeded', exceededLabels: [label] });
  });

  it.each([Number.NaN, Infinity, -1, 99999, 77.5, '100', false, null, undefined])('does not repair invalid saved limits %s into a clear reading', (value) => {
    for (const [, field] of thresholdSamples) {
      const state = { ...baseline, settings: { [field]: value } as Record<string, SettingValue> };
      expect(readAirQualityControllerState(air, state)).toMatchObject({ tone: 'unknown', status: 'Sample unavailable' });
    }
  });

  it('does not conceal a known exceeded limit when another sample is unavailable', () => {
    expect(readAirQualityControllerState(air, { ...baseline, settings: { airQualityIndex: 150, airPm10: 'unknown' } }))
      .toMatchObject({ aqi: 150, tone: 'exceeded', status: 'Saved limit exceeded · some samples unavailable', exceededLabels: ['AQI'] });
  });

  it.each([false, true])('does not change sample condition when notification preference is %s', (enabled) => {
    const state = { ...baseline, settings: { airQualityIndex: 150, airAlertsEnabled: enabled } };
    expect(readAirQualityControllerState(air, state)).toMatchObject({ alertsEnabled: enabled, tone: 'exceeded', status: 'Saved limit exceeded' });
    expect(readAirQualityControllerState(air, { ...state, settings: { ...state.settings, airAlertsEnabled: 'true' } }))
      .toMatchObject({ alertsEnabled: null, tone: 'exceeded' });
  });

  it.each([false, true])('does not infer purifier operation or change fixed samples when checked from power %s', (on) => {
    const state = { ...baseline, on, settings: { airPurifierSpeed: 60, airPurifierMode: 'sleep', airAlertsEnabled: false } };
    const before = readAirQualityControllerState(air, state)!;
    const checked = toggleDeviceState(air.id, state);
    expect(checked).toEqual({ ...state, on: true, settings: { ...state.settings, sampleChecked: true } });
    expect(readAirQualityControllerState(air, checked)).toEqual({ ...before, sampleChecked: true });
    expect(toggleDeviceState(air.id, checked)).toEqual(checked);
    expectRetained(checked);
  });

  it.each([false, true])('retains power %s and unrelated preferences through presets, alert changes and reopening', (on) => {
    let state: DeviceState = { ...baseline, on, settings: { airPurifierSpeed: 60, airPurifierMode: 'sleep', sampleChecked: true } };
    for (const preset of AIR_AQI_PRESETS) for (const enabled of [false, true]) {
      state = applyDeviceSetting(air.id, state, 'airAlertAqi', preset.value);
      state = applyDeviceSetting(air.id, state, 'airAlertsEnabled', enabled);
      expect(state).toMatchObject({ on, level: 0, settings: { airPurifierSpeed: 60, airPurifierMode: 'sleep', sampleChecked: true } });
      expect(readAirQualityControllerState(air, state)).toMatchObject({ aqi: 32, aqiThreshold: preset.value, alertsEnabled: enabled, tone: 'within' });
      expectRetained(state);
    }
  });

  it('rejects edits to read-only samples and invalid preference commands', () => {
    for (const field of readings) expect(applyDeviceSetting(air.id, baseline, field, 25)).toBe(baseline);
    expect(applyDeviceSetting(air.id, baseline, 'airAlertAqi', '100')).toBe(baseline);
    expect(applyDeviceSetting(air.id, baseline, 'airAlertsEnabled', 'true')).toBe(baseline);
  });

  it('does not mutate the selected input while building its presentation', () => {
    const state = Object.freeze({ ...baseline, settings: Object.freeze({ airAlertAqi: 75, sampleChecked: true }) });
    expect(readAirQualityControllerState(air, state)).toMatchObject({ aqiThreshold: 75, sampleChecked: true });
    expect(state.settings).toEqual({ airAlertAqi: 75, sampleChecked: true });
  });

  it('preserves every other device through current guarded preferences and sample checks', () => {
    const store = useHomeStore.getState(); const before = store.deviceStates;
    store.setDeviceSetting(air.id, 'airAlertAqi', 150);
    store.setDeviceSetting(air.id, 'airAlertsEnabled', false);
    store.toggleDevice(air.id);
    const after = useHomeStore.getState().deviceStates;
    expect(readAirQualityControllerState(air, after[air.id])).toMatchObject({ aqiThreshold: 150, alertsEnabled: false, sampleChecked: true });
    for (const [id, state] of Object.entries(before)) if (id !== air.id) expect(after[id]).toBe(state);
    expectRetained(after[air.id]);
  });

  it('rechecks current view-only and revoked authority for captured callbacks', () => {
    const { toggleDevice, setDeviceSetting } = useHomeStore.getState();
    const before = useHomeStore.getState().deviceStates;
    useHomeStore.setState({ access: { ...EMPTY_SCENE_ACCESS, roomIds: [air.roomId], deviceIds: [air.id] } });
    toggleDevice(air.id); setDeviceSetting(air.id, 'airAlertAqi', 75); setDeviceSetting(air.id, 'airAlertsEnabled', false);
    expect(useHomeStore.getState().deviceStates).toBe(before);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    toggleDevice(air.id); setDeviceSetting(air.id, 'airAlertAqi', 150);
    expect(useHomeStore.getState().deviceStates).toBe(before);
  });
});
