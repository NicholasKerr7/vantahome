import { describe, expect, it } from 'vitest';
import { DEVICES } from './data';
import { applyDeviceSetting, runDeviceActionState, setDeviceLevelState, toggleDeviceState } from './deviceControlActions';
import { getFireIncident, acknowledgeFireIncident, clearSimulatedFireSources, resetFireIncident } from './fireSafetySimulation';
import { applyModelPreset } from './modelScenePresets';
import { createDefaultSimulationSnapshot, mergeSimulationChanges, parseSimulationRequest, parseStoredSimulationSnapshotMessage, type SimulationSnapshot } from './simulationBridgeProtocol';
import { advanceSafetySimulation, FIRE_PREVIEW_LIGHT_IDS, pauseSafetySimulation, restoreSafetySimulation } from './safetySimulation';
import type { DeviceState, DeviceStates } from './simulationTypes';

const gateId = 'entry-gate';
const smokeId = DEVICES.find((device) => device.kind === 'smoke')!.id;

/** Exercise the real validated transaction boundary, including canonical reapplication. */
function change(state: SimulationSnapshot, id: string, value: DeviceState): SimulationSnapshot {
  const request = parseSimulationRequest({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId: 1, changes: { deviceStates: { [id]: value } } });
  if (request?.type !== 'patch') throw new Error('Safety state must pass bridge validation');
  const optimistic = mergeSimulationChanges(state, request.changes);
  const canonical = mergeSimulationChanges(state, { deviceStates: optimistic.deviceStates });
  expect(canonical).toEqual(optimistic);
  return canonical;
}

/** Apply a global safety operation through the same snapshot transaction used by the native client. */
function globalChange(state: SimulationSnapshot, reduce: (states: DeviceStates) => DeviceStates): SimulationSnapshot {
  return mergeSimulationChanges(state, { deviceStates: reduce(state.deviceStates) });
}

/** Open and arm a short but valid timer for deterministic foreground tick tests. */
function armed(): SimulationSnapshot {
  let state = createDefaultSimulationSnapshot();
  state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], 'autoCloseDelaySec', 5));
  state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], 'autoCloseEnabled', true));
  return change(state, gateId, runDeviceActionState(gateId, state.deviceStates[gateId], 'gate-command-open'));
}

/** Trigger only a catalog simulation action, never a fabricated physical reading. */
function alarm(state = createDefaultSimulationSnapshot()): SimulationSnapshot {
  return change(state, smokeId, runDeviceActionState(smokeId, state.deviceStates[smokeId], 'smoke-test-alarm'));
}

describe('shared safety transactions', () => {
  it('counts foreground clearance then closes in four interruptible seconds through bridge merges', () => {
    let state = armed();
    expect(state.deviceStates[gateId].settings?.gateCountdownSec).toBe(5);
    for (let i = 0; i < 5; i++) state = globalChange(state, (states) => advanceSafetySimulation(states, 1));
    expect(state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { gatePhase: 'closing' } });
    for (const level of [75, 50, 25, 0]) {
      state = globalChange(state, (states) => advanceSafetySimulation(states, 1));
      expect(state.deviceStates[gateId].level).toBe(level);
    }
    expect(state.deviceStates[gateId].on).toBe(false);
  });

  it.each(['gateVehiclePresent', 'gateBeamBlocked', 'gateSensorFault'])('prevents quick controls, sliders and scenes bypassing %s', (field) => {
    let state = armed();
    state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], field, true));
    for (const reduce of [toggleDeviceState, (id: string, gate: DeviceState) => setDeviceLevelState(id, gate, 0)]) {
      state = change(state, gateId, reduce(gateId, state.deviceStates[gateId]));
      expect(state.deviceStates[gateId].level).toBe(100);
    }
    state = applyModelPreset(state, 'away');
    expect(state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { [field]: true } });
    state = change(state, gateId, { on: false, level: 0 });
    expect(state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { [field]: true } });
  });

  it('resets the clearance interval after occupancy and reopens an interrupted close', () => {
    let state = armed();
    state = globalChange(state, (states) => advanceSafetySimulation(states, 1));
    state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], 'gateVehiclePresent', true));
    state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], 'gateVehiclePresent', false));
    expect(state.deviceStates[gateId].settings?.gateCountdownSec).toBe(5);
    state = change(state, gateId, runDeviceActionState(gateId, state.deviceStates[gateId], 'gate-command-close'));
    state = globalChange(state, (states) => advanceSafetySimulation(states, 1));
    expect(state.deviceStates[gateId].level).toBe(75);
    state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], 'gateBeamBlocked', true));
    expect(state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { gateCountdownSec: 0 } });
  });

  it('pauses on background and disk restoration without catching up or restarting a stale close', () => {
    let state = armed();
    state = globalChange(state, pauseSafetySimulation);
    expect(state.deviceStates[gateId].settings?.gatePhase).toBe('paused');
    for (let i = 0; i < 15; i++) state = globalChange(state, (states) => advanceSafetySimulation(states, 1));
    expect(state.deviceStates[gateId].level).toBe(100);
    const moving = change(state, gateId, runDeviceActionState(gateId, state.deviceStates[gateId], 'gate-command-close'));
    const stored = parseStoredSimulationSnapshotMessage({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: moving });
    expect(stored?.state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { gatePhase: 'paused' } });
  });

  it('latches a fire simulation, holds steady lights and retains it through scenes, silence and reload', () => {
    let state = alarm();
    for (const id of FIRE_PREVIEW_LIGHT_IDS) expect(state.deviceStates[id]).toMatchObject({ on: true, level: 100, settings: { lightEffect: 'none' } });
    expect(state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { gateEmergencyHold: true } });
    state = change(state, smokeId, runDeviceActionState(smokeId, state.deviceStates[smokeId], 'smoke-silence'));
    expect(state.deviceStates[smokeId].settings?.smokeDetected).toBe(true);
    state = applyModelPreset(state, 'away');
    state = globalChange(state, restoreSafetySimulation);
    expect(getFireIncident(state.deviceStates)).toMatchObject({ active: true, canReset: false });
    for (const id of FIRE_PREVIEW_LIGHT_IDS) expect(state.deviceStates[id].on).toBe(true);
  });

  it('does not move a faulted gate to provide simulated emergency access', () => {
    let state = createDefaultSimulationSnapshot();
    state = change(state, gateId, applyDeviceSetting(gateId, state.deviceStates[gateId], 'gateSensorFault', true));
    state = alarm(state);
    expect(state.deviceStates[gateId]).toMatchObject({ level: 0, settings: { gateEmergencyHold: true, gateSensorFault: true } });
  });

  it('requires sources clear before reset and keeps the emergency gate hold until deliberate release', () => {
    let state = alarm();
    state = globalChange(state, acknowledgeFireIncident);
    state = globalChange(state, resetFireIncident);
    expect(getFireIncident(state.deviceStates)).toMatchObject({ active: true, acknowledged: true, canReset: false });
    state = globalChange(state, clearSimulatedFireSources);
    expect(getFireIncident(state.deviceStates)).toMatchObject({ active: true, canReset: true });
    state = globalChange(state, resetFireIncident);
    expect(getFireIncident(state.deviceStates).active).toBe(false);
    expect(state.deviceStates[gateId]).toMatchObject({ level: 100, settings: { gateEmergencyHold: true, gateEmergencyActive: false } });
    state = change(state, gateId, runDeviceActionState(gateId, state.deviceStates[gateId], 'gate-release-hold'));
    expect(state.deviceStates[gateId].settings?.gateEmergencyHold).toBe(false);
  });

  it('does not write or rerender idle safety ticks', () => {
    const state = createDefaultSimulationSnapshot().deviceStates;
    expect(advanceSafetySimulation(state, 1)).toBe(state);
  });
});
