import { applyFireCommand, clearSimulatedFireSources, getFireIncident, synchronizeFireSafety } from '../../../../packages/home-scene/src/fireSafetySimulation';
import type { DeviceState, DeviceStates } from '../../../../packages/home-scene/src/simulationTypes';
import type { Device } from '../../../store/useHomeStore';
import { overlayFireDemoDevice, projectFireSimulationToDemo } from '../fireDemoMapping';

/** Keep host fixtures isolated from the persisted app store and transport subscriptions. */
function demo(fields: Partial<Device> = {}): Device {
  return { id: 'master-smoke', kind: 'smoke', name: 'Demo smoke sensor', roomId: 'master',
    isOn: true, smokeDetected: false, coDetected: false, smokeSilenced: false, ...fields };
}

/** Create a minimal sample with one unrelated reading that must survive synchronization. */
function clearState(): DeviceState {
  return { on: true, level: 0, settings: { smokeBattery: 96, smokeDetected: false, coDetected: false, smokeSilenced: false } };
}

describe('fire demo host mapping', () => {
  test('hydration cannot clear a restored alarm or reassert a stale native alarm', () => {
    const alarm = applyFireCommand(clearState(), 'test-alarm');
    expect(overlayFireDemoDevice(demo(), alarm)).toBe(alarm);
    const cleared = applyFireCommand(alarm, 'clear-alarm');
    expect(overlayFireDemoDevice(demo({ smokeDetected: true }), cleared)).toBe(cleared);
    expect(cleared.settings?.fireIncidentActive).toBe(true);
  });

  test('unrelated native updates leave newer simulation values and acknowledgments intact', () => {
    const host = demo();
    const alarm = applyFireCommand(applyFireCommand(clearState(), 'test-alarm'), 'acknowledge');
    const updatedHost = { ...host, smokeBattery: 45, name: 'Renamed sensor', observedAt: 123 };
    expect(overlayFireDemoDevice(updatedHost, alarm, host)).toBe(alarm);
    expect(overlayFireDemoDevice({ ...host }, alarm, host)).toBe(alarm);
  });

  test('explicit native smoke and CO changes latch the incident without importing metadata', () => {
    const host = demo();
    const nextHost = demo({ smokeDetected: true, coDetected: true, smokeBattery: 3, smokePpm: 150 });
    const updated = overlayFireDemoDevice(nextHost, clearState(), host);
    expect(updated.settings).toMatchObject({ smokeDetected: true, coDetected: true,
      fireIncidentActive: true, fireIncidentAcknowledged: false, smokeSilenced: false, smokeBattery: 96 });
    expect(updated.settings).not.toHaveProperty('smokePpm');
    expect(getFireIncident({ [host.id]: updated }).activeSources).toHaveLength(1);
  });

  test('silence edits keep detection active, and explicit source clearing keeps the incident latched', () => {
    const alarm = applyFireCommand(clearState(), 'test-alarm');
    const host = demo({ smokeDetected: true });
    const silencedHost = { ...host, smokeSilenced: true };
    const silenced = overlayFireDemoDevice(silencedHost, alarm, host);
    expect(silenced.settings).toMatchObject({ smokeDetected: true, smokeSilenced: true, fireIncidentActive: true });
    const clearedHost = { ...silencedHost, smokeDetected: false };
    const cleared = overlayFireDemoDevice(clearedHost, silenced, silencedHost);
    expect(getFireIncident({ [host.id]: cleared })).toMatchObject({ active: true, canReset: true });
  });

  test('rejects malformed values, different identities and non-smoke devices', () => {
    const current = clearState();
    const host = demo();
    const malformed = { ...host, smokeDetected: 'true', coDetected: 1 } as unknown as Device;
    expect(overlayFireDemoDevice(malformed, current, host)).toBe(current);
    expect(overlayFireDemoDevice(demo({ smokeDetected: true }), current, demo({ id: 'kitchen-smoke' }))).toBe(current);
    expect(overlayFireDemoDevice(demo({ kind: 'light', smokeDetected: true }), current, host)).toBe(current);
    const light = demo({ kind: 'light' });
    expect(projectFireSimulationToDemo(light, applyFireCommand(current, 'test-alarm'), current)).toBe(light);
  });

  test('projects only changed explicit flags while retaining newer native edits to unchanged fields', () => {
    const previous = clearState();
    const current = applyFireCommand(previous, 'test-alarm');
    const host = demo({ coDetected: true, isOn: false, smokeBattery: 73, observedAt: 999 });
    const projected = projectFireSimulationToDemo(host, current, previous);
    expect(projected).toEqual({ ...host, smokeDetected: true });
    expect(projected).not.toHaveProperty('fireIncidentActive');
    expect(projected).not.toHaveProperty('fireResetVersion');
    expect(projectFireSimulationToDemo(projected, current, current)).toBe(projected);
  });

  test('explicit hydration projects restored sources and clears stale host flags using simulation defaults', () => {
    const alarm = applyFireCommand(clearState(), 'simulate-co');
    expect(projectFireSimulationToDemo(demo(), alarm)).toMatchObject({ smokeDetected: false, coDetected: true, smokeSilenced: false });
    const host = demo({ smokeDetected: true, coDetected: true, smokeSilenced: true });
    expect(projectFireSimulationToDemo(host, { on: true, level: 0 })).toMatchObject({ smokeDetected: false, coDetected: false, smokeSilenced: false });
    expect(projectFireSimulationToDemo(demo(), clearState())).toEqual(demo());
  });

  test('does not turn malformed simulation flags into clears or leak incident authority into native records', () => {
    const host = demo({ smokeDetected: true });
    const malformed: DeviceState = { on: true, level: 0, settings: { smokeDetected: 'false',
      fireIncidentActive: false, fireResetVersion: 700, secret: 'never-project' } };
    const projected = projectFireSimulationToDemo(host, malformed);
    expect(projected).toBe(host);
    expect(projected).not.toHaveProperty('secret');
  });

  test('round-trips a native alarm and simulated source clearing without stale echoes or input mutation', () => {
    const host = demo();
    const previous = clearState();
    Object.freeze(host);
    Object.freeze(previous.settings);
    Object.freeze(previous);
    const changedHost = { ...host, smokeDetected: true };
    const alarm = overlayFireDemoDevice(changedHost, previous, host);
    const states: DeviceStates = synchronizeFireSafety({ [host.id]: alarm }, { [host.id]: previous });
    const cleared = clearSimulatedFireSources(states);
    const projected = projectFireSimulationToDemo(changedHost, cleared[host.id], alarm);
    expect(projected.smokeDetected).toBe(false);
    expect(overlayFireDemoDevice(projected, cleared[host.id], changedHost)).toBe(cleared[host.id]);
    expect(getFireIncident(cleared)).toMatchObject({ active: true, canReset: true });
    expect(host.smokeDetected).toBe(false);
    expect(previous.settings?.smokeDetected).toBe(false);
  });
});
