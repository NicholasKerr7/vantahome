import { describe, expect, it } from 'vitest';
import { DEVICES, getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, getControlPages, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { fanPreviewVelocity } from './devicePreviewBehavior';
import { isExtractorFan } from './fanActivity';
import { EXTRACTOR_SPEED_PRESETS, fanControllerActionId, readFanControllerState } from './fanController';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import { createDefaultState, parseStoredState, STORAGE_VERSION } from './state';

const extractor = getDevice('bath-1-fan')!;
const ceilingFan = getDevice('living-fan')!;
const unsupportedFields = ['fanDirection', 'fanOscillation', 'fanLightOn', 'fanAutoMode'] as const;
const legacyState = { on: true, level: 80, settings: {
  fanDirection: 'reverse', fanOscillation: true, fanLightOn: true, fanAutoMode: true,
  fanSleepMode: true, fanTimerMin: 30, lastAction: 'fan-speed-up',
} };

describe('exhaust-only bathroom fan policy', () => {
  it('identifies authored extractors by model and filters every More page without changing generic fans', () => {
    const extractors = DEVICES.filter(isExtractorFan);
    expect(extractors).toHaveLength(7);
    const renamedCeilingFan = { ...ceilingFan, name: 'Bathroom ventilation fan', roomId: 'bath-1' };
    expect(isExtractorFan(renamedCeilingFan)).toBe(false);
    expect(isExtractorFan({ kind: 'ac', model: 'extractor' })).toBe(false);
    for (const device of extractors) {
      const capabilities = getCapabilities(device);
      expect(getControlPages(device).flatMap((page) => page.capabilities)).toEqual(expect.arrayContaining([...capabilities]));
      for (const field of unsupportedFields) {
        expect(capabilities.some((entry) => 'field' in entry && entry.field === field)).toBe(false);
        expect(getControlPages(device).some((page) => page.capabilities.some((entry) => 'field' in entry && entry.field === field))).toBe(false);
      }
      expect(capabilities.find((entry) => 'field' in entry && entry.field === 'fanSleepMode')).toMatchObject({ label: 'Quiet mode' });
      expect(capabilities.find((entry) => 'field' in entry && entry.field === 'fanTimerMin')).toMatchObject({ configurationOnly: true });
    }
    expect(getCapabilities(ceilingFan)).toBe(getCapabilities('fan'));
    for (const field of unsupportedFields) expect(getCapabilities(ceilingFan).some((entry) => 'field' in entry && entry.field === field)).toBe(true);
  });

  it('ignores a saved reverse preference consistently without editing the legacy snapshot', () => {
    const state = structuredClone(legacyState);
    const projected = readFanControllerState(extractor, state)!;
    expect(projected).toMatchObject({ direction: 'forward', speed: 80, effectiveSpeed: 35, status: 'Quiet extraction preview', velocity: 35 * 0.13 });
    expect(fanPreviewVelocity(extractor, state)).toBe(projected.velocity);
    expect(deviceStatus(extractor, state)).toBe(projected.status);
    expect(deviceActionFeedback(extractor, state)).toBe(projected.status);
    expect(readDeviceSetting(extractor, state, 'fanDirection')).toBe('forward');
    expect(state).toEqual(legacyState);
    expect(readFanControllerState(ceilingFan, state)).toMatchObject({ direction: 'reverse', status: 'Sleep preview', velocity: -35 * 0.13 });
  });

  it('preserves all old settings in native and browser saves while restoring exhaust-only motion', () => {
    const snapshot = createDefaultSimulationSnapshot(); snapshot.deviceStates[extractor.id] = legacyState;
    const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
    const browser = createDefaultState(); browser.deviceStates[extractor.id] = legacyState;
    const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
    for (const state of [native!.state.deviceStates[extractor.id], restored.deviceStates[extractor.id]]) {
      expect(state).toEqual(legacyState);
      expect(fanPreviewVelocity(extractor, state)).toBe(35 * 0.13);
    }
  });

  it('rejects unsupported extractor writes before clearing activity or touching saved settings', () => {
    for (const field of unsupportedFields) {
      expect(applyDeviceSetting(extractor.id, legacyState, field, field === 'fanDirection' ? 'forward' : false)).toBe(legacyState);
      expect(runDeviceActionState(extractor.id, legacyState, `fan-${field}`)).toBe(legacyState);
    }
    expect(applyDeviceSetting(ceilingFan.id, legacyState, 'fanDirection', 'forward').settings?.fanDirection).toBe('forward');
  });

  it.each([false, true])('keeps power %s and remembered settings while changing exhaust speed', (on) => {
    for (const preset of EXTRACTOR_SPEED_PRESETS) {
      const state = applyDeviceSetting(extractor.id, { ...legacyState, on }, 'speed', preset.value);
      expect(readFanControllerState(extractor, state)).toMatchObject({ on, speed: preset.value, effectiveSpeed: on ? Math.min(35, preset.value) : 0, direction: 'forward' });
      expect(state.settings).toMatchObject({ fanDirection: 'reverse', fanTimerMin: 30, fanSleepMode: true });
    }
    const raised = runDeviceActionState(extractor.id, { ...legacyState, on }, fanControllerActionId('speedUp'));
    expect(raised).toMatchObject({ on, level: 90 });
    const fullSpeed = applyDeviceSetting(extractor.id, raised, 'fanSleepMode', false);
    expect(readFanControllerState(extractor, fullSpeed)).toMatchObject({ on, effectiveSpeed: on ? 90 : 0, status: on ? 'Extracting preview' : 'Off' });
    expect(fanPreviewVelocity(extractor, toggleDeviceState(extractor.id, { ...fullSpeed, on: true }))).toBe(0);
    expect(fanPreviewVelocity(extractor, { ...fullSpeed, on: true, level: 0 })).toBe(0);
  });
});
