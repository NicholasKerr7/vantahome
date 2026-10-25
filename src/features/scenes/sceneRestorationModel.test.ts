import { AUTHORED_DEVICES } from '../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot, type DeviceState, type SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { applySceneRestoration, buildSceneRestorationPlan, createSceneRestorationReceipt, invalidateChangedSceneRestoration,
  parseSceneRestorationReceipt, type SceneRestorationDescriptor } from './sceneRestorationModel';

const descriptor: SceneRestorationDescriptor = { identityKey: '["owner","home","member"]', runId: 'run-1', sceneId: 'scene-1', sceneName: 'Evening', createdAt: 1 };
const allowed = AUTHORED_DEVICES.map((device) => device.id);

/** Update one fixture without accidentally sharing nested state between before/after snapshots. */
function patch(snapshot: SimulationSnapshot, id: string, changes: Partial<DeviceState>): SimulationSnapshot {
  return { ...snapshot, deviceStates: { ...snapshot.deviceStates, [id]: { ...snapshot.deviceStates[id], ...changes } } };
}

test('captures only actual changes and restores absent settings without touching unrelated values', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { on: false, level: 44 });
  const after = patch(before, 'living-light', { on: true, level: 20, settings: { colorTempK: 2700, lastAction: 'light-scene-warm' } });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(receipt.devices).toHaveLength(1);
  expect(receipt.devices[0].changes.map((entry) => entry.field)).toEqual(['on', 'level', 'settings.colorTempK']);
  const result = applySceneRestoration(receipt, after, allowed);
  expect(result.deviceStates['living-light']).toEqual({ on: false, level: 44, settings: { lastAction: 'light-scene-warm' } });
  expect(result.deviceStates['family-tv']).toBe(after.deviceStates['family-tv']);
  expect(result.motionDisabled).toBe(after.motionDisabled);
});

test.each(['light', 'ac', 'fan', 'tv', 'speaker', 'blinds'])('permits reversible %s power/level while retaining unrelated preferences', (kind) => {
  const device = AUTHORED_DEVICES.find((candidate) => candidate.kind === kind)!;
  const before = patch(createDefaultSimulationSnapshot(), device.id, { on: false, level: 0 });
  const after = patch(before, device.id, { on: true, level: 65 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(buildSceneRestorationPlan(receipt, after, allowed).restorable).toEqual([{ deviceId: device.id, fields: ['on', 'level'] }]);
  expect(applySceneRestoration(receipt, after, allowed).deviceStates[device.id]).toEqual(before.deviceStates[device.id]);
});

test.each(['gate', 'door', 'garage', 'window', 'camera', 'washer', 'dryer', 'dishwasher', 'smoke', 'generator', 'battery', 'solar', 'gas-meter', 'gas-leak', 'water-heater', 'sprinkler'])('never restores %s, even when its scene changed state', (kind) => {
  const device = AUTHORED_DEVICES.find((candidate) => candidate.kind === kind)!;
  const before = createDefaultSimulationSnapshot();
  const after = patch(before, device.id, { on: !before.deviceStates[device.id].on, level: 33 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(receipt.devices).toEqual([{ deviceId: device.id, kind, changes: [], afterFingerprint: null, eligible: false }]);
  expect(buildSceneRestorationPlan(receipt, after, allowed).skipped).toEqual([{ deviceId: device.id, reason: 'unsupported' }]);
  expect(applySceneRestoration(receipt, after, allowed)).toBe(after);
});

test('does not restore microphone, voice assistant, scheduling or transport position from speakers', () => {
  const before = createDefaultSimulationSnapshot();
  const after = patch(before, 'living-speaker', { settings: { micEnabled: false, voiceAssistantEnabled: false,
    scheduleEnabled: true, playbackPositionSec: 30 } });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(receipt.devices[0].changes).toEqual([]);
  expect(applySceneRestoration(receipt, after, allowed)).toBe(after);
});

test('preserves any later device edit and permanently blocks ABA restoration', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { level: 80 });
  const after = patch(before, 'living-light', { level: 20 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  const changed = patch(after, 'living-light', { level: 45 });
  expect(buildSceneRestorationPlan(receipt, changed, allowed).skipped[0].reason).toBe('changed');
  const invalidated = invalidateChangedSceneRestoration(receipt, changed);
  expect(invalidated.devices[0].eligible).toBe(false);
  expect(invalidateChangedSceneRestoration(invalidated, after).devices[0].eligible).toBe(false);
  expect(applySceneRestoration(invalidated, after, allowed)).toBe(after);
});

test('retains unrelated device edits while restoring the still eligible light', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { level: 80 });
  const after = patch(before, 'living-light', { level: 20 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  const latest = patch(after, 'family-tv', { on: false, level: 77 });
  const result = applySceneRestoration(receipt, latest, allowed);
  expect(result.deviceStates['living-light'].level).toBe(80);
  expect(result.deviceStates['family-tv']).toEqual(latest.deviceStates['family-tv']);
});

test('permission revocation and deletion never fall back to another device', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { level: 80 });
  const after = patch(before, 'living-light', { level: 20 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(buildSceneRestorationPlan(receipt, after, []).skipped).toEqual([{ deviceId: 'living-light', reason: 'unavailable' }]);
  const removed = { ...after, deviceStates: { ...after.deviceStates } }; delete removed.deviceStates['living-light'];
  expect(applySceneRestoration(receipt, removed, allowed)).toBe(removed);
});

test('restores only unchanged scene appearance; motion and later time choices survive', () => {
  const before = createDefaultSimulationSnapshot();
  const after: SimulationSnapshot = { ...before, lightingMode: 'night', night: true, motionDisabled: true };
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(buildSceneRestorationPlan(receipt, after, []).appearance).toBe('restore');
  expect(applySceneRestoration(receipt, after, [])).toEqual({ ...before, motionDisabled: true });
  const changed: SimulationSnapshot = { ...after, lightingMode: 'day', night: false };
  const invalidated = invalidateChangedSceneRestoration(receipt, changed);
  expect(buildSceneRestorationPlan(invalidated, after, []).appearance).toBe('changed');
});

test('strict receipt validation rejects unsafe paths, malformed values, identity omissions and duplicate devices', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { level: 80 });
  const after = patch(before, 'living-light', { level: 20 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  const candidate = (change: unknown) => ({ ...receipt, devices: [{ ...receipt.devices[0], changes: [change] }] });
  for (const value of [
    { ...receipt, identityKey: '' }, { ...receipt, unknown: true }, { ...receipt, revision: 0 },
    { ...receipt, devices: [receipt.devices[0], receipt.devices[0]] },
    candidate({ field: 'settings.micEnabled', before: true, after: false }),
    candidate({ field: 'level', before: 101, after: 20 }),
    candidate({ field: 'level', before: 80, after: 21 }),
    { ...receipt, devices: [{ ...receipt.devices[0], kind: 'gate' }] },
    { ...receipt, devices: [{ ...receipt.devices[0], afterFingerprint: '{"secret":"x"}' }] },
  ]) expect(parseSceneRestorationReceipt(value, after)).toBeNull();
  expect(parseSceneRestorationReceipt(receipt, after)).toEqual(receipt);
});

test('hydrate mismatches disable restoration without accepting a receipt tied to another snapshot', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { level: 80 });
  const after = patch(before, 'living-light', { level: 20 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  expect(parseSceneRestorationReceipt(receipt, before)?.devices[0].eligible).toBe(false);
});

test('materialized default preferences are not later edits, while explicit different values still are', () => {
  const before = patch(createDefaultSimulationSnapshot(), 'living-light', { level: 70 });
  const after = patch(before, 'living-light', { level: 18 });
  const receipt = createSceneRestorationReceipt(descriptor, before, after);
  const projected = patch(after, 'living-light', { settings: { ...after.deviceStates['living-light'].settings,
    colorTempK: 3200, adaptiveLighting: false, autoOffMin: 0, motionBoost: false, nightShift: false } });
  const retained = invalidateChangedSceneRestoration(receipt, projected);
  expect(retained.devices[0].eligible).toBe(true);
  expect(applySceneRestoration(retained, projected, allowed).deviceStates['living-light'].level).toBe(70);
  const changed = patch(projected, 'living-light', { settings: { ...projected.deviceStates['living-light'].settings, colorTempK: 2700 } });
  expect(invalidateChangedSceneRestoration(retained, changed).devices[0].eligible).toBe(false);
});
