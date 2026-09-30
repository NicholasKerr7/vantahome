import { describe, expect, it } from 'vitest';
import {
  advanceGateSafety, applyGateCommand, applyGateSetting, GATE_DEVICE_ID,
  gateClosingBlockReason, gateSafetySummary, normalizeRestoredGateState, readGateSetting, synchronizeGateSafety,
} from './gateSafetySimulation';
import { gateSafetyCapabilities, gateSafetyDefaults, gateSafetyStoredFields } from './gateSafetyCatalog';
import type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';

/** Build a gate independently of rendering, store timers, or physical device transports. */
function gate(level = 0, settings: Record<string, SettingValue> = {}): DeviceState {
  return { on: level > 0, level, settings };
}

/** Start a five-second clear-zone preview using the same controls exposed in the catalog. */
function armed(): DeviceState {
  const enabled = applyGateSetting(gate(100), 'autoCloseEnabled', true);
  return applyGateSetting(enabled, 'autoCloseDelaySec', 5);
}

/** Advance the caller-owned one-second loop without deriving elapsed time from a clock. */
function seconds(state: DeviceState, count: number, emergencyActive = false): DeviceState {
  for (let index = 0; index < count; index += 1) state = advanceGateSafety(state, 1, emergencyActive);
  return state;
}

describe('gate safety simulation', () => {
  it('keeps legacy gates indefinitely open until explicitly enabling auto-close', () => {
    const restored = normalizeRestoredGateState(gate(100, { autoOpenEnabled: true }));
    expect(readGateSetting(restored, 'autoCloseEnabled')).toBe(false);
    expect(readGateSetting(restored, 'autoCloseDelaySec')).toBe(30);
    expect(seconds(restored, 300)).toBe(restored);
    expect(gateSafetySummary(restored)).toBe('100% open · auto-close off');
    expect(restored.settings?.autoOpenEnabled).toBe(true);
  });

  it('keeps unchanged legacy snapshots sparse during restoration, merges, and idle ticks', () => {
    const current = { on: false, level: 0 };
    expect(normalizeRestoredGateState(current)).toBe(current);
    expect(advanceGateSafety(current, 1)).toBe(current);
    const states = { [GATE_DEVICE_ID]: current };
    expect(synchronizeGateSafety(states)).toBe(states);
    expect(current).not.toHaveProperty('settings');
  });

  it('waits the complete clear-zone interval, exposes closing, then closes over four ticks', () => {
    let state = armed();
    state = seconds(state, 4);
    expect(state.level).toBe(100);
    expect(state.settings).toMatchObject({ gatePhase: 'countdown', gateCountdownSec: 1 });
    state = advanceGateSafety(state, 1);
    expect(state.level).toBe(100);
    expect(state.settings).toMatchObject({ gatePhase: 'closing', gateCountdownSec: 0 });
    expect(gateSafetySummary(state)).toBe('Closing preview · 100% open');
    state = advanceGateSafety(state, 1);
    expect(state.level).toBe(75);
    state = seconds(state, 3);
    expect(state).toMatchObject({ level: 0, on: false, settings: { gatePhase: 'idle', gateLastEvent: 'closed' } });
    expect(seconds(state, 100)).toBe(state);
  });

  it('does not skip the closing phase when a supplied countdown step exceeds its duration', () => {
    const state = advanceGateSafety(armed(), 100);
    expect(state).toMatchObject({ level: 100, settings: { gatePhase: 'closing' } });
  });

  it('requires fully open position before counting and resets when delay preferences change', () => {
    let state = applyGateSetting(gate(60), 'autoCloseEnabled', true);
    expect(seconds(state, 60).settings?.gatePhase).toBe('idle');
    state = applyGateCommand(state, 'open');
    state = seconds(state, 8);
    expect(state.settings?.gateCountdownSec).toBe(22);
    state = applyGateSetting(state, 'autoCloseDelaySec', 12);
    expect(state.settings?.gateCountdownSec).toBe(12);
    state = applyGateSetting(state, 'autoCloseEnabled', false);
    expect(seconds(state, 100)).toBe(state);
    expect(state.level).toBe(100);
  });

  it.each(['gateVehiclePresent', 'gateBeamBlocked'])('resets the full countdown while %s is active', (field) => {
    let state = seconds(armed(), 3);
    state = applyGateSetting(state, field, true);
    expect(seconds(state, 100)).toBe(state);
    expect(state.settings).toMatchObject({ gatePhase: 'idle', gateCountdownSec: 0 });
    state = applyGateSetting(state, field, false);
    expect(state.settings).toMatchObject({ gatePhase: 'countdown', gateCountdownSec: 5 });
    expect(seconds(state, 4).level).toBe(100);
  });

  it.each(['gateVehiclePresent', 'gateBeamBlocked'])('reopens an in-progress close when %s arrives and requires fresh clearance', (field) => {
    let state = seconds(armed(), 7);
    expect(state.level).toBe(50);
    state = applyGateSetting(state, field, true);
    expect(state).toMatchObject({ level: 100, on: true, settings: { gateLastEvent: 'obstruction-reopened', gatePhase: 'idle' } });
    expect(applyGateCommand(state, 'close').level).toBe(100);
    state = applyGateSetting(state, field, false);
    expect(state.settings?.gateCountdownSec).toBe(5);
  });

  it.each(['gateVehiclePresent', 'gateBeamBlocked', 'gateSensorFault', 'gateHoldOpen', 'gateEmergencyHold'])('does not allow commands, sliders, or direct scene patches to close through %s', (field) => {
    const current = normalizeRestoredGateState(gate(100, { [field]: true }));
    expect(applyGateCommand(current, 'close').level).toBe(100);
    expect(applyGateSetting(current, 'openPercent', 0).level).toBe(100);
    expect(applyGateSetting(current, 'isOn', false).level).toBe(100);
    const previous = { [GATE_DEVICE_ID]: current };
    const merged = synchronizeGateSafety({ [GATE_DEVICE_ID]: gate(0, current.settings) }, previous);
    expect(merged[GATE_DEVICE_ID].level).toBe(100);
    // A preset that replaces the settings object must not move through an existing interlock either.
    expect(synchronizeGateSafety({ [GATE_DEVICE_ID]: gate(0) }, previous)[GATE_DEVICE_ID].level).toBe(100);
    expect(synchronizeGateSafety({ [GATE_DEVICE_ID]: gate(0) }, previous)[GATE_DEVICE_ID].settings?.[field]).toBe(true);
    expect(gateClosingBlockReason(current)).not.toBeNull();
  });

  it('converts direct clear-zone scene closure into observable travel and accepts normal ticking merges', () => {
    let previous: DeviceStates = { [GATE_DEVICE_ID]: normalizeRestoredGateState(gate(100)) };
    let states = synchronizeGateSafety({ [GATE_DEVICE_ID]: gate(0) }, previous);
    expect(states[GATE_DEVICE_ID]).toMatchObject({ level: 100, settings: { gatePhase: 'closing' } });
    for (let index = 0; index < 4; index += 1) {
      previous = states;
      const next = advanceGateSafety(states[GATE_DEVICE_ID], 1);
      states = synchronizeGateSafety({ [GATE_DEVICE_ID]: next }, previous);
    }
    expect(states[GATE_DEVICE_ID].level).toBe(0);
  });

  it('keeps closing commands and tick results idempotent across optimistic and canonical merges', () => {
    let previous = { [GATE_DEVICE_ID]: armed() };
    let state = applyGateCommand(previous[GATE_DEVICE_ID], 'close');
    for (let index = 0; index < 5; index += 1) {
      const optimistic = { [GATE_DEVICE_ID]: state };
      expect(synchronizeGateSafety(optimistic, previous)).toBe(optimistic);
      expect(synchronizeGateSafety(optimistic, optimistic)).toBe(optimistic);
      previous = optimistic;
      state = advanceGateSafety(state, 1);
    }
    expect(state.level).toBe(0);
  });

  it('retains omitted safety fields and cannot erase a hold without the explicit release action', () => {
    const held = applyGateCommand(armed(), 'hold-open');
    const previous = { [GATE_DEVICE_ID]: held };
    for (const candidate of [gate(100), gate(100, { gateHoldOpen: false })]) {
      const next = synchronizeGateSafety({ [GATE_DEVICE_ID]: candidate }, previous)[GATE_DEVICE_ID];
      expect(next.settings).toMatchObject({ gateHoldOpen: true, autoCloseEnabled: true, autoCloseDelaySec: 5 });
      expect(seconds(next, 30).level).toBe(100);
    }
    const released = applyGateCommand(held, 'release-hold');
    expect(synchronizeGateSafety({ [GATE_DEVICE_ID]: released }, previous)[GATE_DEVICE_ID].settings?.gateHoldOpen).toBe(false);
  });

  it('handles direct sensor input during a closing tick before accepting any travel', () => {
    const closing = seconds(armed(), 6);
    const previous = { [GATE_DEVICE_ID]: closing };
    const candidate = { [GATE_DEVICE_ID]: { ...closing, level: 50, settings: { ...closing.settings, gateBeamBlocked: true } } };
    const stopped = synchronizeGateSafety(candidate, previous)[GATE_DEVICE_ID];
    expect(stopped).toMatchObject({ level: 100, settings: { gateLastEvent: 'obstruction-reopened' } });
    const fault = { [GATE_DEVICE_ID]: { ...candidate[GATE_DEVICE_ID], settings: { ...candidate[GATE_DEVICE_ID].settings, gateSensorFault: true } } };
    expect(synchronizeGateSafety(fault, previous)[GATE_DEVICE_ID]).toMatchObject({ level: 75, settings: { gatePhase: 'paused' } });
  });

  it('stops on a sensor fault without reversing or resuming travel when the fault clears', () => {
    let state = seconds(armed(), 7);
    expect(state.level).toBe(50);
    state = applyGateSetting(state, 'gateSensorFault', true);
    state = applyGateSetting(state, 'gateBeamBlocked', true);
    expect(seconds(state, 100).level).toBe(50);
    expect(state.settings?.gatePhase).toBe('paused');
    expect(applyGateCommand(state, 'open').level).toBe(50);
    expect(gateSafetySummary(state)).toContain('Sensor fault');
    state = applyGateSetting(state, 'gateSensorFault', false);
    state = applyGateSetting(state, 'gateBeamBlocked', false);
    expect(seconds(state, 100)).toBe(state);
    expect(state.level).toBe(50);
    state = applyGateCommand(state, 'open');
    expect(state.level).toBe(100);
    expect(state.settings?.gateCountdownSec).toBe(5);
  });

  it('cancels the countdown for a fault and starts a complete new interval after recovery', () => {
    let state = applyGateSetting(seconds(armed(), 4), 'gateSensorFault', true);
    expect(state.settings?.gateCountdownSec).toBe(0);
    state = applyGateSetting(state, 'gateSensorFault', false);
    expect(state.settings?.gateCountdownSec).toBe(5);
  });

  it('holds indefinitely and releases into a fresh interval, without overriding an occupied zone', () => {
    let state = applyGateCommand(seconds(armed(), 3), 'hold-open');
    expect(seconds(state, 100)).toBe(state);
    expect(applyGateCommand(state, 'close').level).toBe(100);
    state = applyGateSetting(state, 'gateVehiclePresent', true);
    state = applyGateSetting(state, 'gateReleaseHold', true);
    expect(state.settings).toMatchObject({ gateHoldOpen: false, gateCountdownSec: 0 });
    state = applyGateSetting(state, 'gateVehiclePresent', false);
    expect(state.settings?.gateCountdownSec).toBe(5);
  });

  it('moves an explicit clear manual position in the same closing phase, with no unwanted auto-close from partial opening', () => {
    let state = applyGateSetting(gate(100), 'openPercent', 40);
    expect(state.level).toBe(100);
    state = seconds(state, 3);
    expect(state).toMatchObject({ level: 40, on: true, settings: { gatePhase: 'idle', gateLastEvent: 'positioned' } });
    expect(applyGateSetting(state, 'openPercent', 80).level).toBe(80);
    expect(seconds(state, 50)).toBe(state);
  });

  it.each(['countdown', 'closing'])('restores %s as paused and never reuses a persisted deadline', (phase) => {
    const saved = phase === 'countdown' ? seconds(armed(), 4) : seconds(armed(), 7);
    let restored = normalizeRestoredGateState(JSON.parse(JSON.stringify(saved)) as DeviceState);
    expect(restored.settings).toMatchObject({ gatePhase: 'paused', gateCountdownSec: 0, gateLastEvent: 'restored-paused' });
    expect(seconds(restored, 100)).toBe(restored);
    restored = applyGateSetting(restored, 'gateResume', true);
    expect(restored.settings?.gatePhase).toBe(restored.level === 100 ? 'countdown' : 'idle');
    if (restored.level === 100) expect(restored.settings?.gateCountdownSec).toBe(5);
    else expect(seconds(restored, 100)).toBe(restored);
  });

  it('latches emergency hold, safely opens a clear gate, and requires manual release after the incident clears', () => {
    let state = advanceGateSafety(applyGateSetting(gate(), 'autoCloseEnabled', true), 1, true);
    expect(state).toMatchObject({ level: 100, settings: { gateEmergencyActive: true, gateEmergencyHold: true, gateCountdownSec: 0 } });
    expect(seconds(state, 100, true)).toBe(state);
    expect(applyGateCommand(state, 'release-hold')).toBe(state);
    expect(applyGateCommand(state, 'close').level).toBe(100);
    state = advanceGateSafety(state, 1, false);
    expect(state.settings).toMatchObject({ gateEmergencyActive: false, gateEmergencyHold: true, gateCountdownSec: 0 });
    expect(seconds(state, 100)).toBe(state);
    expect(gateSafetySummary(state)).toContain('release manually');
    state = applyGateCommand(state, 'release-hold');
    expect(state.settings).toMatchObject({ gateEmergencyHold: false, gatePhase: 'countdown', gateCountdownSec: 30 });
  });

  it.each(['gateVehiclePresent', 'gateBeamBlocked', 'gateSensorFault'])('does not force emergency opening through %s', (field) => {
    let state = advanceGateSafety(gate(25, { [field]: true }), 1, true);
    expect(state.level).toBe(25);
    expect(state.settings?.gateEmergencyHold).toBe(true);
    expect(gateSafetySummary(state)).toContain('blocked');
    state = applyGateSetting(state, field, false);
    state = advanceGateSafety(state, 1, true);
    expect(state.level).toBe(100);
    expect(state.settings?.gateCountdownSec).toBe(0);
  });

  it('emergency clear does not open a formerly blocked gate or release a restored emergency latch', () => {
    let state = advanceGateSafety(gate(0, { gateBeamBlocked: true }), 1, true);
    state = normalizeRestoredGateState(state);
    state = advanceGateSafety(state, 1, false);
    state = applyGateSetting(state, 'gateBeamBlocked', false);
    expect(seconds(state, 100).level).toBe(0);
    expect(state.settings?.gateEmergencyHold).toBe(true);
  });

  it('checks emergency input before any closing travel and retains other devices unchanged', () => {
    const closing = seconds(armed(), 6);
    const lamp = { on: true, level: 60 };
    const previous = { [GATE_DEVICE_ID]: closing, lamp };
    const next = synchronizeGateSafety(previous, previous, true);
    expect(next[GATE_DEVICE_ID].level).toBe(100);
    expect(next.lamp).toBe(lamp);
    expect(synchronizeGateSafety(next, next, true)).toBe(next);
    expect(synchronizeGateSafety({ lamp })).toEqual({ lamp });
  });

  it('bounds configuration, rejects invalid controls, and keeps status fields read-only', () => {
    const state = armed();
    expect(applyGateSetting(state, 'autoCloseDelaySec', -9).settings?.autoCloseDelaySec).toBe(5);
    expect(applyGateSetting(state, 'autoCloseDelaySec', 999).settings?.autoCloseDelaySec).toBe(120);
    for (const field of ['autoCloseDelaySec', 'openPercent']) expect(applyGateSetting(state, field, Number.NaN)).toBe(state);
    for (const field of ['gatePhase', 'gateCountdownSec', 'gateEmergencyActive', 'gateEmergencyHold', 'unknown']) expect(applyGateSetting(state, field, true)).toBe(state);
    expect(applyGateSetting(state, 'gateBeamBlocked', 'false')).toBe(state);
    for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(advanceGateSafety(state, delta)).toBe(state);
    expect(readGateSetting(state, 'unknown')).toBeUndefined();
  });

  it('catalog defaults and persisted fields cover the modeled state without storing action requests', () => {
    const fields = [...gateSafetyCapabilities, ...gateSafetyStoredFields].flatMap((capability) => 'field' in capability ? [capability.field] : []);
    for (const field of Object.keys(gateSafetyDefaults)) expect(fields).toContain(field);
    expect(fields).not.toContain('gateReleaseHold');
    expect(fields).not.toContain('gateResume');
    expect(gateSafetyCapabilities.filter((capability) => capability.type === 'action')).toHaveLength(3);
  });
});
