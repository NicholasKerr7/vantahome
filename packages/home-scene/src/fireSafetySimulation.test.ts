import { describe, expect, it } from 'vitest';
import manifest from './house-manifest.json';
import {
  acknowledgeFireIncident, applyFireCommand, applyFireSetting, clearSimulatedFireSources,
  FIRE_DEFAULTS, FIRE_RESET_VERSION_MAX, getFireIncident, resetFireIncident, synchronizeFireSafety,
} from './fireSafetySimulation';
import { fireCapabilities, fireStoredFields } from './fireSafetyCatalog';
import type { DeviceState, DeviceStates } from './simulationTypes';

const smokeId = 'master-smoke';
const secondId = 'kitchen-smoke';

/** Build only the real catalog's devices so unknown IDs cannot masquerade as alarm sources. */
function sampleStates(): DeviceStates {
  return Object.fromEntries(manifest.devices.map((device) => [device.id, {
    on: device.defaultOn, level: device.defaultLevel,
    ...(device.kind === 'smoke' ? { settings: { ...FIRE_DEFAULTS, smokeBattery: 96 } } : {}),
  }]));
}

/** Mirror a bridge merge: replace one device and synchronize against the prior full snapshot. */
function updateSensor(states: DeviceStates, id: string, current: DeviceState): DeviceStates {
  return synchronizeFireSafety({ ...states, [id]: current }, states);
}

/** Start an explicit smoke scenario through the same reducer exposed to both renderers. */
function smokeScenario(states = sampleStates()): DeviceStates {
  return updateSensor(states, smokeId, applyFireCommand(states[smokeId], 'test-alarm'));
}

describe('local fire incident simulation', () => {
  it('keeps idle snapshots stable and ignores alarms on unknown or non-sensor devices', () => {
    const states = sampleStates();
    expect(synchronizeFireSafety(states)).toBe(states);
    expect(getFireIncident(states)).toEqual({ active: false, acknowledged: false, sources: [], activeSources: [], canReset: false });
    const forged = { ...states, unknown: { on: true, level: 0, settings: { smokeDetected: true } },
      'living-light': { ...states['living-light'], settings: { coDetected: true } } };
    expect(getFireIncident(forged).active).toBe(false);
    expect(acknowledgeFireIncident(states)).toBe(states);
    expect(clearSimulatedFireSources(states)).toBe(states);
    expect(resetFireIncident(states)).toBe(states);
  });

  it('latches smoke and CO sources with their actual catalog rooms without touching other devices', () => {
    const before = sampleStates();
    let states = smokeScenario(before);
    states = updateSensor(states, secondId, applyFireCommand(states[secondId], 'simulate-co'));
    expect(getFireIncident(states)).toMatchObject({ active: true, acknowledged: false, canReset: false,
      sources: [
        { id: smokeId, roomName: 'Primary suite', smokeDetected: true, coDetected: false },
        { id: secondId, roomName: 'Kitchen & dining', smokeDetected: false, coDetected: true },
      ] });
    expect(getFireIncident(states).activeSources).toHaveLength(2);
    for (const device of manifest.devices.filter((device) => device.kind !== 'smoke')) {
      expect(states[device.id]).toBe(before[device.id]);
    }
    expect(states[smokeId].settings?.smokeBattery).toBe(96);
    expect(resetFireIncident(states)).toBe(states);
  });

  it('separates acknowledgment and silence from detection and incident clearing', () => {
    let states = acknowledgeFireIncident(smokeScenario());
    expect(getFireIncident(states)).toMatchObject({ active: true, acknowledged: true, canReset: false });
    expect(states[smokeId].settings?.smokeSilenced).toBe(false);
    states = updateSensor(states, smokeId, applyFireCommand(states[smokeId], 'silence'));
    expect(states[smokeId].settings).toMatchObject({ smokeDetected: true, smokeSilenced: true,
      fireIncidentActive: true, fireIncidentAcknowledged: true });
    expect(resetFireIncident(states)).toBe(states);
  });

  it('requires clear sources before a separate atomic reset and preserves the rest of the scene', () => {
    const active = acknowledgeFireIncident(smokeScenario());
    const clear = clearSimulatedFireSources(active);
    expect(getFireIncident(clear)).toMatchObject({ active: true, acknowledged: true, canReset: true, activeSources: [] });
    expect(getFireIncident(clear).sources.map((source) => source.id)).toEqual([smokeId]);
    const reset = resetFireIncident(clear);
    expect(getFireIncident(reset)).toMatchObject({ active: false, acknowledged: false, canReset: false });
    expect(reset[smokeId].settings).toMatchObject({ smokeDetected: false, coDetected: false,
      smokeSilenced: false, fireIncidentActive: false, fireIncidentAcknowledged: false, fireResetVersion: 1 });
    expect(reset['entry-gate']).toBe(clear['entry-gate']);
    expect(reset['living-light']).toBe(clear['living-light']);
    expect(resetFireIncident(reset)).toBe(reset);
  });

  it('rejects a reset of one clear detector while any other source is still active', () => {
    let active = smokeScenario();
    active = updateSensor(active, secondId, applyFireCommand(active[secondId], 'simulate-co'));
    const clearOne = updateSensor(active, smokeId, applyFireCommand(active[smokeId], 'clear-alarm'));
    const attemptedReset = updateSensor(clearOne, smokeId, applyFireCommand(clearOne[smokeId], 'reset'));
    expect(getFireIncident(attemptedReset)).toMatchObject({ active: true, canReset: false });
    expect(getFireIncident(attemptedReset).sources).toHaveLength(2);
    const clearedLater = clearSimulatedFireSources(attemptedReset);
    expect(synchronizeFireSafety(clearedLater, attemptedReset)[smokeId].settings?.fireIncidentActive).toBe(true);
    expect(getFireIncident(resetFireIncident(clearedLater)).active).toBe(false);
  });

  it('does not let an ordinary snapshot erase a latched incident or reuse an old reset version', () => {
    const active = smokeScenario();
    const forged = { ...active[smokeId], settings: { ...active[smokeId].settings,
      smokeDetected: false, coDetected: false, fireIncidentActive: false } };
    const retained = updateSensor(active, smokeId, forged);
    expect(getFireIncident(retained)).toMatchObject({ active: true, canReset: true });
    const reset = resetFireIncident(retained);
    const secondIncident = smokeScenario(reset);
    const stale = synchronizeFireSafety(reset, secondIncident);
    expect(getFireIncident(stale).active).toBe(true);
    expect(stale[smokeId].settings?.fireResetVersion).toBe(1);
  });

  it('carries explicit reset intent across a local merge, host merge, and persisted restoration', () => {
    const clear = clearSimulatedFireSources(smokeScenario());
    const localReset = resetFireIncident(clear);
    const hostReset = synchronizeFireSafety(localReset, clear);
    expect(getFireIncident(hostReset).active).toBe(false);
    expect(synchronizeFireSafety(hostReset, hostReset)).toBe(hostReset);
    const restored = JSON.parse(JSON.stringify(hostReset)) as DeviceStates;
    expect(synchronizeFireSafety(restored)).toBe(restored);
    expect(getFireIncident(restored).active).toBe(false);
  });

  it('restores both active and source-cleared incidents without dismissing acknowledgment', () => {
    const active = acknowledgeFireIncident(smokeScenario());
    for (const saved of [active, clearSimulatedFireSources(active)]) {
      const restored = JSON.parse(JSON.stringify(saved)) as DeviceStates;
      expect(synchronizeFireSafety(restored)).toBe(restored);
      expect(getFireIncident(restored)).toEqual(getFireIncident(saved));
    }
    const legacy = sampleStates();
    legacy[smokeId] = { on: false, level: 0, settings: { smokeDetected: true } };
    const restoredLegacy = synchronizeFireSafety(legacy);
    expect(restoredLegacy[smokeId]).toMatchObject({ on: true, settings: { fireIncidentActive: true, fireIncidentAcknowledged: false } });
  });

  it('reopens acknowledgment for a new source or a signal that reasserts after clearing', () => {
    const acknowledged = acknowledgeFireIncident(smokeScenario());
    const additional = updateSensor(acknowledged, secondId, applyFireCommand(acknowledged[secondId], 'simulate-co'));
    expect(getFireIncident(additional).acknowledged).toBe(false);
    const silenced = updateSensor(acknowledged, smokeId, applyFireCommand(acknowledged[smokeId], 'silence'));
    const clear = clearSimulatedFireSources(silenced);
    const reasserted = updateSensor(clear, smokeId, applyFireSetting(clear[smokeId], 'smokeDetected', true));
    expect(reasserted[smokeId].settings).toMatchObject({ fireIncidentAcknowledged: false, smokeSilenced: false });
    expect(getFireIncident(reasserted).active).toBe(true);
  });

  it('validates settings and never treats latch fields as ordinary editable values', () => {
    const current = smokeScenario()[smokeId];
    expect(applyFireSetting(current, 'smokeDetected', 'true')).toBe(current);
    expect(applyFireSetting(current, 'fireIncidentActive', false)).toBe(current);
    expect(applyFireSetting(current, 'fireResetVersion', 1)).toBe(current);
    expect(applyFireSetting(current, 'smokeDetected', false).settings?.fireIncidentActive).toBe(true);
    const co = applyFireCommand(current, 'simulate-co');
    expect(co.settings).toMatchObject({ smokeDetected: true, coDetected: true });
  });

  it('keeps bounded counters monotonic and refuses exhausted reset generations', () => {
    const clear = clearSimulatedFireSources(smokeScenario());
    const exhausted = { ...clear, [smokeId]: { ...clear[smokeId], settings: {
      ...clear[smokeId].settings, fireResetVersion: FIRE_RESET_VERSION_MAX,
    } } };
    expect(resetFireIncident(exhausted)).toBe(exhausted);
    const rollback = updateSensor(exhausted, smokeId, { ...exhausted[smokeId], settings: {
      ...exhausted[smokeId].settings, fireResetVersion: 0,
    } });
    expect(rollback[smokeId].settings?.fireResetVersion).toBe(FIRE_RESET_VERSION_MAX);
  });

  it('never mutates frozen inputs or adds timer, audio, hardware, gate, or light effects', () => {
    const before = sampleStates();
    for (const state of Object.values(before)) {
      if (state.settings) Object.freeze(state.settings);
      Object.freeze(state);
    }
    Object.freeze(before);
    const active = smokeScenario(before);
    const clear = clearSimulatedFireSources(acknowledgeFireIncident(active));
    const reset = resetFireIncident(clear);
    expect(getFireIncident(before).active).toBe(false);
    expect(getFireIncident(reset).active).toBe(false);
    for (const device of manifest.devices.filter((device) => device.kind !== 'smoke')) {
      expect(reset[device.id]).toBe(before[device.id]);
    }
  });

  it('keeps legacy action identifiers while giving every new incident field a stored schema', () => {
    const actions = fireCapabilities.smoke.filter((capability) => capability.type === 'action');
    expect(actions.find((capability) => capability.id === 'smoke-test-alarm')).toMatchObject({ operation: { type: 'fire', command: 'test-alarm' }, patch: {} });
    expect(actions.find((capability) => capability.id === 'smoke-silence')).toMatchObject({ operation: { type: 'fire', command: 'silence' }, patch: {} });
    expect(fireStoredFields.smoke.map((capability) => 'field' in capability ? capability.field : '')).toEqual(Object.keys(FIRE_DEFAULTS));
  });
});
