import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICES, getDevice } from './data';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from './deviceControlActions';
import { deviceActionFeedback, deviceStatus, getCapabilities, getControlPages, isMonitor, quickActionLabel, readDeviceSetting, validateStoredSetting } from './deviceCapabilities';
import { GAS_DEVICE_IDS, gasStatusTone, readGasSetting, synchronizeGasSafety, type GasDeviceKind } from './gasSimulation';
import { createDefaultSimulationSnapshot, mergeSimulationChanges, parseSimulationRequest, parseSimulationSnapshotMessage, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL, type SimulationSnapshot } from './simulationBridgeProtocol';
import { applyPreset, createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
import type { DeviceState } from './simulationTypes';

const meterId = GAS_DEVICE_IDS.meter;
const detectorId = GAS_DEVICE_IDS.detector;
const envelope = { channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot' } as const;

/** Commit a catalog action through the same merge used by optimistic native and host acknowledgements. */
function action(snapshot: SimulationSnapshot, id: string, actionId: string): SimulationSnapshot {
  const next = runDeviceActionState(id, snapshot.deviceStates[id], actionId);
  return mergeSimulationChanges(snapshot, { deviceStates: { [id]: next } });
}
/** Read a gas scenario value without duplicating its derived-reading rules. */
function reading(snapshot: SimulationSnapshot, kind: GasDeviceKind, field: string) {
  return readGasSetting(kind, snapshot.deviceStates[kind === 'gas-meter' ? meterId : detectorId], field);
}
/** Verify both strict bridge acceptance and exact browser/native persistence retention. */
function roundTrip(snapshot: SimulationSnapshot): void {
  const { deviceStates, night, lightingMode, motionDisabled } = snapshot;
  const state = { deviceStates, night, lightingMode, motionDisabled };
  const message = { ...envelope, state };
  expect(parseSimulationSnapshotMessage(message)?.state).toEqual(state);
  expect(parseStoredSimulationSnapshotMessage(JSON.stringify(message))?.state).toEqual(state);
  const browser = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: { ...createDefaultState(), ...snapshot } }));
  expect(browser.deviceStates).toEqual(snapshot.deviceStates);
}

describe('smart gas sample controls', () => {
  beforeEach(() => useHomeStore.getState().reset());

  it('adds both always-monitored devices with bounded advanced pages and reproducible sample units', () => {
    const snapshot = createDefaultSimulationSnapshot();
    for (const id of [meterId, detectorId]) {
      const device = getDevice(id)!;
      expect(device).toBeDefined();
      expect(isMonitor(device.kind)).toBe(true);
      expect(snapshot.deviceStates[id].on).toBe(true);
      const pages = getControlPages(device);
      expect(pages.flatMap((page) => page.capabilities)).toHaveLength(getCapabilities(device.kind).length);
      expect(pages.every((page) => page.capabilities.length <= (page.compact ? 6 : 3))).toBe(true);
    }
    expect(quickActionLabel(getDevice(detectorId)!, snapshot.deviceStates[detectorId])).toBe('Run self-test');
    expect(reading(snapshot, 'gas-meter', 'gasCapacityKg')).toBe(12.5);
    expect(reading(snapshot, 'gas-meter', 'gasRemainingPercent')).toBe(70);
    expect(reading(snapshot, 'gas-meter', 'gasFlowKgH')).toBe(0);
    expect(gasStatusTone('light', snapshot.deviceStates[meterId])).toBe('normal');
    expect(synchronizeGasSafety(snapshot.deviceStates)).toBe(snapshot.deviceStates);
  });

  it('conserves sample supply through usage, clamps depletion, and refills without erasing usage totals', () => {
    let snapshot = createDefaultSimulationSnapshot();
    snapshot = action(snapshot, meterId, 'gas-meter-use-sample');
    expect(reading(snapshot, 'gas-meter', 'gasRemainingKg')).toBe(8.5);
    expect(reading(snapshot, 'gas-meter', 'gasTodayKg')).toBe(1);
    expect(reading(snapshot, 'gas-meter', 'gasMonthKg')).toBe(6.5);
    expect(reading(snapshot, 'gas-meter', 'gasFlowKgH')).toBe(0.5);
    for (let index = 0; index < 80; index += 1) snapshot = action(snapshot, meterId, 'gas-meter-use-sample');
    expect(reading(snapshot, 'gas-meter', 'gasRemainingKg')).toBe(0);
    expect(reading(snapshot, 'gas-meter', 'gasTodayKg')).toBe(9.5);
    expect(reading(snapshot, 'gas-meter', 'gasMonthKg')).toBe(15);
    expect(reading(snapshot, 'gas-meter', 'gasFlowKgH')).toBe(0);
    expect(reading(snapshot, 'gas-meter', 'gasRefillDue')).toBe(true);
    snapshot = action(snapshot, meterId, 'gas-meter-refill');
    expect(reading(snapshot, 'gas-meter', 'gasRemainingKg')).toBe(12.5);
    expect(reading(snapshot, 'gas-meter', 'gasRemainingPercent')).toBe(100);
    expect(reading(snapshot, 'gas-meter', 'gasRefillDue')).toBe(false);
    expect(reading(snapshot, 'gas-meter', 'gasMonthKg')).toBe(15);
    roundTrip(snapshot);
  });

  it('blocks usage behind a closed preview valve and bounds decimal and alert preferences', () => {
    let snapshot = action(createDefaultSimulationSnapshot(), meterId, 'gas-meter-close-valve');
    snapshot = action(snapshot, meterId, 'gas-meter-use-sample');
    expect(reading(snapshot, 'gas-meter', 'gasRemainingKg')).toBe(8.75);
    expect(reading(snapshot, 'gas-meter', 'gasLastSampleKg')).toBe(0);
    expect(deviceActionFeedback(getDevice(meterId)!, snapshot.deviceStates[meterId])).toContain('blocked');
    let meter = applyDeviceSetting(meterId, snapshot.deviceStates[meterId], 'gasBudgetKg', -100);
    meter = applyDeviceSetting(meterId, meter, 'gasRefillAlertPercent', 999);
    expect(meter.settings).toMatchObject({ gasBudgetKg: 5, gasRefillAlertPercent: 50 });
    expect(readGasSetting('gas-meter', meter, 'gasBudgetExceeded')).toBe(true);
    expect(applyDeviceSetting(meterId, meter, 'gasRemainingKg', 12)).toBe(meter);
    expect(applyDeviceSetting(meterId, meter, 'gasBudgetKg', Number.NaN)).toBe(meter);
    for (const value of [0.29, 1.13, 4.56, 9.95, 12.49]) expect(validateStoredSetting('gas-meter', 'gasRemainingKg', value)).toBe(value);
    snapshot = mergeSimulationChanges(snapshot, { deviceStates: { [meterId]: meter } });
    roundTrip(snapshot);
  });

  it('closes the linked preview valve on leak, keeps detection when silenced/tested, and never reopens on clear', () => {
    let snapshot = action(createDefaultSimulationSnapshot(), detectorId, 'gas-leak-simulate-leak');
    expect(reading(snapshot, 'gas-leak', 'gasLeakDetected')).toBe(true);
    expect(reading(snapshot, 'gas-leak', 'gasConcentrationPercentLel')).toBe(35);
    expect(reading(snapshot, 'gas-meter', 'gasValveOpen')).toBe(false);
    expect(reading(snapshot, 'gas-meter', 'gasLeakInterlock')).toBe(true);
    snapshot = action(snapshot, detectorId, 'gas-leak-silence');
    expect(reading(snapshot, 'gas-leak', 'gasLeakDetected')).toBe(true);
    expect(reading(snapshot, 'gas-leak', 'gasAlarmSilenced')).toBe(true);
    expect(gasStatusTone('gas-leak', snapshot.deviceStates[detectorId])).toBe('alarm');
    const detector = toggleDeviceState(detectorId, snapshot.deviceStates[detectorId]);
    snapshot = mergeSimulationChanges(snapshot, { deviceStates: { [detectorId]: detector } });
    expect(reading(snapshot, 'gas-leak', 'gasTestCount')).toBe(1);
    expect(reading(snapshot, 'gas-leak', 'gasTestResult')).toBe('passed');
    expect(reading(snapshot, 'gas-leak', 'gasLeakDetected')).toBe(true);
    expect(reading(snapshot, 'gas-leak', 'gasAlarmSilenced')).toBe(true);
    snapshot = action(snapshot, meterId, 'gas-meter-open-valve');
    expect(reading(snapshot, 'gas-meter', 'gasValveOpen')).toBe(false);
    expect(deviceActionFeedback(getDevice(meterId)!, snapshot.deviceStates[meterId])).toContain('Opening blocked');
    roundTrip(snapshot);
    snapshot = action(snapshot, detectorId, 'gas-leak-clear-leak');
    expect(reading(snapshot, 'gas-leak', 'gasLeakDetected')).toBe(false);
    expect(reading(snapshot, 'gas-leak', 'gasAlarmSilenced')).toBe(false);
    expect(reading(snapshot, 'gas-meter', 'gasLeakInterlock')).toBe(false);
    expect(reading(snapshot, 'gas-meter', 'gasValveOpen')).toBe(false);
    expect(gasStatusTone('gas-meter', snapshot.deviceStates[meterId])).toBe('closed');
    snapshot = action(snapshot, meterId, 'gas-meter-open-valve');
    expect(reading(snapshot, 'gas-meter', 'gasValveOpen')).toBe(true);
    roundTrip(snapshot);
  });

  it('respects disabled auto-shutoff but still prevents reopening during an active leak', () => {
    let snapshot = createDefaultSimulationSnapshot();
    snapshot = mergeSimulationChanges(snapshot, { deviceStates: { [detectorId]: applyDeviceSetting(detectorId, snapshot.deviceStates[detectorId], 'gasAutoShutoff', false) } });
    snapshot = action(snapshot, detectorId, 'gas-leak-simulate-leak');
    expect(reading(snapshot, 'gas-meter', 'gasValveOpen')).toBe(true);
    expect(deviceStatus(getDevice(meterId)!, snapshot.deviceStates[meterId])).toContain('still open');
    snapshot = action(snapshot, meterId, 'gas-meter-close-valve');
    const forgedOpening: DeviceState = { ...snapshot.deviceStates[meterId], settings: { ...snapshot.deviceStates[meterId].settings, gasValveOpen: true, gasLeakInterlock: false } };
    snapshot = mergeSimulationChanges(snapshot, { deviceStates: { [meterId]: forgedOpening } });
    expect(reading(snapshot, 'gas-meter', 'gasValveOpen')).toBe(false);
    expect(reading(snapshot, 'gas-meter', 'gasLeakInterlock')).toBe(true);
    const attempted = applyDeviceSetting(meterId, snapshot.deviceStates[meterId], 'gasValveOpen', true);
    expect(readGasSetting('gas-meter', attempted, 'gasValveOpen')).toBe(false);
    roundTrip(snapshot);
  });

  it('keeps DOM, optimistic native merges, presets and reloads on the same linked outcome', () => {
    const before = createDefaultState();
    const native = action(before, detectorId, 'gas-leak-simulate-leak');
    useHomeStore.getState().runDeviceAction(detectorId, 'gas-leak-simulate-leak');
    expect(useHomeStore.getState().deviceStates).toEqual(native.deviceStates);
    useHomeStore.getState().setDeviceSetting(meterId, 'gasValveOpen', true);
    expect(readGasSetting('gas-meter', useHomeStore.getState().deviceStates[meterId], 'gasValveOpen')).toBe(false);
    for (const preset of ['morning', 'movie', 'night', 'away'] as const) {
      const next = applyPreset({ ...before, deviceStates: native.deviceStates }, preset);
      expect(next.deviceStates[meterId]).toBe(native.deviceStates[meterId]);
      expect(next.deviceStates[detectorId]).toBe(native.deviceStates[detectorId]);
    }
    const ids = Object.keys(native.deviceStates);
    expect(Object.keys(synchronizeGasSafety(native.deviceStates))).toEqual(ids);
    expect(synchronizeGasSafety(native.deviceStates)).toBe(native.deviceStates);
    expect(native.deviceStates['living-light']).toBe(before.deviceStates['living-light']);
    roundTrip(native);
  });

  it('migrates old caches only for missing new gas IDs while preserving advanced settings', () => {
    const state = createDefaultSimulationSnapshot();
    state.deviceStates['living-light'] = { on: true, level: 27, settings: { color: '#B69CFF', lightColorMode: 'color', scheduleHour: 19 } };
    state.deviceStates['master-blinds'] = { on: true, level: 37, settings: { scheduleEnabled: true } };
    delete state.deviceStates[meterId];
    delete state.deviceStates[detectorId];
    expect(parseSimulationSnapshotMessage({ ...envelope, state })).toBeNull();
    const restored = parseStoredSimulationSnapshotMessage(JSON.stringify({ ...envelope, state }))!.state;
    expect(restored.deviceStates['living-light']).toEqual(state.deviceStates['living-light']);
    expect(restored.deviceStates['master-blinds']).toEqual(state.deviceStates['master-blinds']);
    expect(Object.keys(restored.deviceStates)).toHaveLength(DEVICES.length);
    roundTrip(restored);
    delete state.deviceStates['living-light'];
    expect(parseStoredSimulationSnapshotMessage({ ...envelope, state })).toBeNull();
  });

  it('rejects invalid gas bridge fields and does not allow monitors to be powered off', () => {
    const initial = createDefaultSimulationSnapshot();
    const meter = initial.deviceStates[meterId];
    const detector = initial.deviceStates[detectorId];
    for (const settings of [{ gasRemainingKg: -1 }, { gasRemainingKg: 13 }, { gasRemainingKg: 1.234 }, { gasFlowKgH: Infinity }, { gasCapacityKg: 20 }, { gasRemainingPercent: 40 }, { gasLastEvent: 'hardware-success' }]) {
      expect(parseSimulationRequest({ channel: SIMULATION_CHANNEL, version: 1, type: 'patch', requestId: 1, changes: { deviceStates: { [meterId]: { ...meter, settings } } } })).toBeNull();
    }
    for (const id of [meterId, detectorId]) {
      const current = initial.deviceStates[id];
      expect(parseSimulationRequest({ channel: SIMULATION_CHANNEL, version: 1, type: 'patch', requestId: 2, changes: { deviceStates: { [id]: { ...current, on: false } } } })).toBeNull();
      expect(setDeviceLevelState(id, current, 0)).toBe(current);
    }
    expect(readDeviceSetting(getDevice(detectorId)!, detector, 'isOn')).toBe(true);
    const tested = runDeviceActionState(detectorId, { ...detector, settings: { gasTestCount: 9999 } }, 'gas-leak-self-test');
    expect(tested.settings?.gasTestCount).toBe(9999);
  });
});
