import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { getCapabilities } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import { gateActionId, readGateControllerState, type GateControllerKey } from './gateController';
import { advanceGateSafety, gateSafetySummary } from './gateSafetySimulation';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState, SettingValue } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const gate = getDevice('entry-gate')!;
const actionKeys: readonly GateControllerKey[] = ['open', 'close', 'holdOpen', 'releaseHold', 'resume'];

/** Build a coherent selected-gate fixture without another state owner or timer. */
function gateState(position = 0, settings?: Record<string, SettingValue>): DeviceState {
  return { on: position > 0, level: position, ...(settings ? { settings } : {}) };
}

/** Reset current grants after cases that retain and then revoke store callbacks. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Exercise both restoration boundaries, which intentionally pause movement and countdowns. */
function restoredStates(state: DeviceState): readonly DeviceState[] {
  const native = createDefaultSimulationSnapshot();
  native.deviceStates[gate.id] = state;
  const restoredNative = parseStoredSimulationSnapshotMessage(JSON.stringify({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: native,
  }));
  expect(restoredNative).not.toBeNull();
  const browser = createDefaultState();
  browser.deviceStates[gate.id] = state;
  const restoredBrowser = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  return [restoredNative!.state.deviceStates[gate.id], restoredBrowser.deviceStates[gate.id]];
}

describe('shared entry gate controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('projects only the entry gate covered by the existing simulation clock and catalog', () => {
    expect(readGateControllerState(getDevice('master-blinds')!, gateState())).toBeNull();
    expect(readGateControllerState({ ...gate, id: 'unmodeled-gate' }, gateState())).toBeNull();
    const actions = getCapabilities('gate').filter((capability) => capability.type === 'action').map((capability) => capability.id);
    for (const key of actionKeys) expect(actions).toContain(gateActionId(key));
    expect(new Set(actionKeys.map(gateActionId)).size).toBe(actionKeys.length);
  });

  it('reads canonical position and modeled defaults without confusing power or stale aliases with position', () => {
    const state = { on: false, level: 55, settings: { openPercent: 90, autoOpenEnabled: true } };
    expect(readGateControllerState(gate, state)).toMatchObject({
      position: 55, target: null, phase: 'idle', moving: false, paused: false,
      status: gateSafetySummary(state), safety: 'clear', safetyLabel: 'Clear in simulation',
      vehiclePresent: false, beamBlocked: false, sensorFault: false,
      holdOpen: false, emergencyHold: false, emergencyActive: false,
      canOpen: true, canClose: true, canHoldOpen: true, canReleaseHold: false, canResume: false,
      autoCloseEnabled: false, autoCloseDelaySec: 30, countdownSec: null,
    });
    expect(state).toEqual({ on: false, level: 55, settings: { openPercent: 90, autoOpenEnabled: true } });
    expect(readGateControllerState(gate, gateState())).toMatchObject({ position: 0, status: 'Closed preview', canOpen: true, canClose: false });
    expect(readGateControllerState(gate, gateState(100))).toMatchObject({ position: 100, canOpen: false, canClose: true });
  });

  it('opens immediately but reports accepted closing separately from the next foreground position sample', () => {
    const opened = runDeviceActionState(gate.id, gateState(), gateActionId('open'));
    expect(readGateControllerState(gate, opened)).toMatchObject({ position: 100, target: null, phase: 'idle', moving: false });
    const closing = runDeviceActionState(gate.id, opened, gateActionId('close'));
    expect(readGateControllerState(gate, closing)).toMatchObject({ position: 100, target: 0, phase: 'closing', moving: true, canOpen: true });
    expect(readGateControllerState(gate, advanceGateSafety(closing, 1))).toMatchObject({ position: 75, target: 0, moving: true });
    const reopenedBeforeTick = runDeviceActionState(gate.id, closing, gateActionId('open'));
    expect(readGateControllerState(gate, reopenedBeforeTick)).toMatchObject({ position: 100, target: null, phase: 'idle', moving: false });
    expect(advanceGateSafety(reopenedBeforeTick, 1).level).toBe(100);
  });

  it('keeps a bounded partial closing target distinct from the current position until reached', () => {
    const closing = applyDeviceSetting(gate.id, gateState(100), 'openPercent', 40);
    expect(readGateControllerState(gate, closing)).toMatchObject({ position: 100, target: 40, moving: true });
    const advanced = advanceGateSafety(closing, 1);
    expect(readGateControllerState(gate, advanced)).toMatchObject({ position: 75, target: 40, moving: true });
    expect(readGateControllerState(gate, advanceGateSafety(advanced, 2))).toMatchObject({ position: 40, target: null, phase: 'idle', moving: false });
    expect(readGateControllerState(gate, applyDeviceSetting(gate.id, gateState(), 'openPercent', 200))).toMatchObject({ position: 100 });
    expect(readGateControllerState(gate, applyDeviceSetting(gate.id, gateState(100), 'openPercent', -20))).toMatchObject({ position: 100, target: 0 });
  });

  it.each([
    ['gateVehiclePresent', 'Vehicle present', 'blocked'], ['gateBeamBlocked', 'Safety beam blocked', 'blocked'],
    ['gateSensorFault', 'Safety-sensor fault', 'unknown'],
  ] as const)('reports %s as an inhibitor for both opening and closing', (field, reason, safety) => {
    const state = applyDeviceSetting(gate.id, gateState(25), field, true);
    expect(readGateControllerState(gate, state)).toMatchObject({
      position: 25, safety, openBlockReason: reason, closeBlockReason: reason,
      canOpen: false, canClose: false, canHoldOpen: false, moving: false,
    });
    for (const key of ['open', 'close'] as const) {
      expect(runDeviceActionState(gate.id, state, gateActionId(key)).level).toBe(25);
    }
    // Existing Hold still latches its preference when opening is blocked; it is not a Stop action.
    const held = runDeviceActionState(gate.id, state, gateActionId('holdOpen'));
    expect(readGateControllerState(gate, held)).toMatchObject({ position: 25, holdOpen: true, canReleaseHold: true, canClose: false });
  });

  it.each(['gateVehiclePresent', 'gateBeamBlocked'])('shows reopening after %s interrupts a closing preview', (field) => {
    const closing = runDeviceActionState(gate.id, gateState(100), gateActionId('close'));
    const advanced = advanceGateSafety(closing, 1);
    const obstructed = applyDeviceSetting(gate.id, advanced, field, true);
    expect(obstructed.settings?.gateLastEvent).toBe('obstruction-reopened');
    expect(readGateControllerState(gate, obstructed)).toMatchObject({ position: 100, phase: 'idle', target: null, moving: false, safety: 'blocked', canOpen: false, canClose: false });
  });

  it('exposes sensor-fault pause without implying automatic resumption when the fault clears', () => {
    const closing = runDeviceActionState(gate.id, gateState(100), gateActionId('close'));
    const faulted = applyDeviceSetting(gate.id, advanceGateSafety(closing, 1), 'gateSensorFault', true);
    expect(readGateControllerState(gate, faulted)).toMatchObject({ position: 75, phase: 'paused', paused: true, moving: false, safety: 'unknown', target: null });
    const cleared = applyDeviceSetting(gate.id, faulted, 'gateSensorFault', false);
    expect(readGateControllerState(gate, cleared)).toMatchObject({ position: 75, paused: true, moving: false, canOpen: true, canClose: true, canResume: false });
    expect(advanceGateSafety(cleared, 10).level).toBe(75);
    const resumed = runDeviceActionState(gate.id, cleared, gateActionId('resume'));
    expect(readGateControllerState(gate, resumed)).toMatchObject({ position: 75, phase: 'idle', moving: false, target: null });
  });

  it('reports the actual auto-close countdown without inventing a timer at partial opening', () => {
    let state = applyDeviceSetting(gate.id, gateState(50), 'autoCloseDelaySec', 5);
    state = applyDeviceSetting(gate.id, state, 'autoCloseEnabled', true);
    expect(readGateControllerState(gate, state)).toMatchObject({ position: 50, phase: 'idle', countdownSec: null, autoCloseEnabled: true, autoCloseDelaySec: 5 });
    state = runDeviceActionState(gate.id, state, gateActionId('open'));
    expect(readGateControllerState(gate, state)).toMatchObject({ position: 100, phase: 'countdown', moving: false, countdownSec: 5 });
    state = advanceGateSafety(state, 1.25);
    expect(readGateControllerState(gate, state)).toMatchObject({ countdownSec: 3.75, status: 'Auto-close preview in 4s' });
    state = advanceGateSafety(state, 3.75);
    expect(readGateControllerState(gate, state)).toMatchObject({ position: 100, phase: 'closing', countdownSec: null, target: 0, moving: true });
  });

  it('retains manual holds and configuration across restoration until explicit release', () => {
    const preferences = { autoOpenEnabled: true, autoCloseEnabled: true, autoCloseDelaySec: 12, scheduleEnabled: true, scheduleHour: 19 };
    const held = runDeviceActionState(gate.id, gateState(25, preferences), gateActionId('holdOpen'));
    for (const restored of restoredStates(held)) {
      expect(restored.settings).toMatchObject({ ...preferences, gateHoldOpen: true });
      expect(readGateControllerState(gate, restored)).toMatchObject({ position: 100, holdOpen: true, canClose: false, canReleaseHold: true, countdownSec: null });
      const released = runDeviceActionState(gate.id, restored, gateActionId('releaseHold'));
      expect(readGateControllerState(gate, released)).toMatchObject({ holdOpen: false, phase: 'countdown', countdownSec: 12 });
    }
  });

  it.each(['countdown', 'closing'] as const)('restores %s without resuming motion or a stale countdown', (phase) => {
    const enabled = applyDeviceSetting(gate.id, gateState(100), 'autoCloseEnabled', true);
    const state = phase === 'countdown' ? advanceGateSafety(enabled, 3) : advanceGateSafety(runDeviceActionState(gate.id, enabled, gateActionId('close')), 1);
    for (const restored of restoredStates(state)) {
      const position = phase === 'countdown' ? 100 : 75;
      expect(readGateControllerState(gate, restored)).toMatchObject({ position, phase: 'paused', paused: true, moving: false, target: null, countdownSec: null, canOpen: true, canResume: phase === 'countdown' });
      expect(advanceGateSafety(restored, 60).level).toBe(position);
      const resumed = runDeviceActionState(gate.id, restored, gateActionId('resume'));
      expect(readGateControllerState(gate, resumed)).toMatchObject({ position, moving: false, phase: phase === 'countdown' ? 'countdown' : 'idle', countdownSec: phase === 'countdown' ? 30 : null });
    }
  });

  it('keeps active emergency holds unreleasable and allows deliberate release only after clear', () => {
    const emergency = advanceGateSafety(gateState(25), 1, true);
    expect(readGateControllerState(gate, emergency)).toMatchObject({ position: 100, emergencyActive: true, emergencyHold: true, closeBlockReason: 'Emergency hold', canClose: false, canReleaseHold: false });
    const rejected = runDeviceActionState(gate.id, emergency, gateActionId('releaseHold'));
    expect(readGateControllerState(gate, rejected)).toMatchObject({ emergencyHold: true, canReleaseHold: false });
    const cleared = advanceGateSafety(rejected, 1, false);
    expect(readGateControllerState(gate, cleared)).toMatchObject({ emergencyActive: false, emergencyHold: true, canReleaseHold: true });
    const released = runDeviceActionState(gate.id, cleared, gateActionId('releaseHold'));
    expect(readGateControllerState(gate, released)).toMatchObject({ emergencyHold: false, canClose: true });
  });

  it.each([
    gateState(Number.NaN), gateState(50, { gateVehiclePresent: 'false' }),
    gateState(50, { gateBeamBlocked: 0 }), gateState(50, { gateSensorFault: 'healthy' }),
    gateState(50, { gateEmergencyHold: 'false' }), gateState(50, { gatePhase: 'opening' }),
    gateState(50, { gatePhase: 'closing', gateCloseTargetPercent: Number.NaN }),
    gateState(100, { gatePhase: 'countdown', gateCountdownSec: Number.POSITIVE_INFINITY }),
  ])('does not render malformed simulation input as known safety or actionable movement', (state) => {
    const projection = readGateControllerState(gate, state)!;
    expect(projection).toMatchObject({ safety: 'unknown', status: 'Gate simulation state unavailable', moving: false, canOpen: false, canClose: false, canHoldOpen: false, canResume: false });
    for (const value of [projection.position, projection.target, projection.countdownSec]) expect(value === null || Number.isFinite(value)).toBe(true);
  });

  it('blocks retained actions and settings when control is view-only or later revoked', () => {
    const { runDeviceAction, setDeviceSetting } = useHomeStore.getState();
    const initial = useHomeStore.getState().deviceStates;
    const viewAccess = { ...EMPTY_SCENE_ACCESS, roomIds: [gate.roomId], deviceIds: [gate.id] };
    useHomeStore.setState({ access: viewAccess });
    for (const key of actionKeys) runDeviceAction(gate.id, gateActionId(key));
    setDeviceSetting(gate.id, 'openPercent', 100);
    setDeviceSetting(gate.id, 'autoCloseEnabled', true);
    expect(useHomeStore.getState().deviceStates).toBe(initial);
    useHomeStore.setState({ access: { ...viewAccess, controllableDeviceIds: [gate.id] } });
    runDeviceAction(gate.id, gateActionId('open'));
    const accepted = useHomeStore.getState().deviceStates;
    expect(readGateControllerState(gate, accepted[gate.id])).toMatchObject({ position: 100 });
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    for (const key of actionKeys) runDeviceAction(gate.id, gateActionId(key));
    setDeviceSetting(gate.id, 'gateHoldOpen', true);
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
  });
});
