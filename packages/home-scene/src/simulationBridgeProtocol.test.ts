import { describe, expect, it } from 'vitest';
import { DEVICES } from './data';
import { getCapabilities } from './deviceCapabilities';
import {
  createDefaultSimulationSnapshot, diffSimulationSnapshots, MAX_SIMULATION_MESSAGE_LENGTH,
  mergeSimulationChanges, rebaseSimulationChanges, simulationChangeBaseline, parseSimulationRequest, parseSimulationSnapshotMessage, SIMULATION_CHANNEL,
} from './simulationBridgeProtocol';

const envelope = { channel: SIMULATION_CHANNEL, version: 1 } as const;
/** Exercise serialized native messages and structured web messages with the same request shape. */
function patch(changes: unknown, requestId = 1): unknown { return { ...envelope, type: 'patch', requestId, base: changes, changes }; }

describe('simulation bridge protocol', () => {
  it('accepts exact handshakes and complete independent defaults', () => {
    expect(parseSimulationRequest({ ...envelope, type: 'request' })?.type).toBe('request');
    const state = createDefaultSimulationSnapshot();
    expect(Object.keys(state.deviceStates)).toHaveLength(DEVICES.length);
    expect(parseSimulationSnapshotMessage(JSON.stringify({ ...envelope, type: 'snapshot', state }))?.state).toEqual(state);
    state.deviceStates['living-light'].on = false;
    expect(createDefaultSimulationSnapshot().deviceStates['living-light'].on).toBe(true);
  });

  it('accepts scene settings, explicit action statuses and monitor sample acknowledgements', () => {
    for (const device of DEVICES) {
      for (const capability of getCapabilities(device.kind)) {
        if (capability.type !== 'action') continue;
        const { isOn, ...settings } = capability.patch;
        const current = createDefaultSimulationSnapshot().deviceStates[device.id];
        expect(parseSimulationRequest(patch({ deviceStates: { [device.id]: { ...current, on: isOn ?? current.on, settings } } })), `${device.id}/${capability.id}`).not.toBeNull();
      }
    }
    const smoke = DEVICES.find((device) => device.kind === 'smoke')!;
    expect(parseSimulationRequest(patch({ deviceStates: { [smoke.id]: { on: true, level: 50, settings: { sampleChecked: true } } } }))).not.toBeNull();
    expect(parseSimulationRequest(patch({ deviceStates: { 'master-ac': { on: true, level: 75, settings: { tempC: 20, mode: 'cold' } } } }))).not.toBeNull();
  });

  it.each([
    { 'living-light': { on: true, level: 50, settings: { url: 'https://example.com' } } },
    { 'living-light': { on: true, level: 50, settings: { sampleChecked: true } } },
    { 'master-ac': { on: true, level: 50, settings: { tempC: 200 } } },
    { 'master-ac': { on: true, level: 50, settings: { tempC: 20.5 } } },
    { 'master-ac': { on: true, level: 50, settings: { mode: 'https://example.com' } } },
    { 'living-light': { on: 'true', level: 50 } },
    { 'living-light': { on: true, level: 101 } },
    { 'living-light': { on: true, level: Number.NaN } },
    { 'living-light': { on: true, level: 50, householdId: 'private' } },
    { unknown: { on: true, level: 50 } },
    { 'master-blinds': { on: false, level: 75 } },
  ])('rejects unsupported device values %#', (deviceStates) => {
    expect(parseSimulationRequest(patch({ deviceStates }))).toBeNull();
  });

  it('rejects added envelope capabilities, malformed IDs, incomplete snapshots and oversized data', () => {
    expect(parseSimulationRequest({ ...envelope, type: 'request', url: 'https://example.com' })).toBeNull();
    expect(parseSimulationRequest(patch({ auth: 'private' }))).toBeNull();
    expect(parseSimulationRequest(patch({ lightingMode: 'sunset' }))).toBeNull();
    expect(parseSimulationRequest(patch({ motionDisabled: 1 }))).toBeNull();
    expect(parseSimulationRequest(patch({ motionDisabled: true }, 0))).toBeNull();
    expect(parseSimulationRequest(patch({ motionDisabled: true }, Number.MAX_SAFE_INTEGER + 1))).toBeNull();
    expect(parseSimulationRequest(' '.repeat(MAX_SIMULATION_MESSAGE_LENGTH + 1))).toBeNull();
    expect(parseSimulationRequest('{')).toBeNull();
    expect(parseSimulationSnapshotMessage({ ...envelope, type: 'snapshot', state: { ...createDefaultSimulationSnapshot(), deviceStates: {} } })).toBeNull();
    expect(parseSimulationSnapshotMessage({ ...envelope, type: 'snapshot', state: createDefaultSimulationSnapshot(), acknowledgedRequestId: -1 })).toBeNull();
    const poisoned = JSON.parse('{"__proto__":{"on":true,"level":50}}');
    expect(parseSimulationRequest(patch({ deviceStates: poisoned }))).toBeNull();
  });

  it('retains unrelated devices and replaces removed settings without mutating the source', () => {
    const original = createDefaultSimulationSnapshot();
    original.deviceStates['master-ac'] = { on: true, level: 50, settings: { mode: 'fan' } };
    const next = mergeSimulationChanges(original, { deviceStates: { 'master-ac': { on: false, level: 50 } }, motionDisabled: true });
    expect(next.deviceStates['living-light']).toBe(original.deviceStates['living-light']);
    expect(next.deviceStates['master-ac'].settings).toBeUndefined();
    expect(original.deviceStates['master-ac'].settings?.mode).toBe('fan');
    expect(diffSimulationSnapshots(original, next)).toEqual({ deviceStates: { 'master-ac': { on: false, level: 50 } }, motionDisabled: true });
    expect(diffSimulationSnapshots(original, JSON.parse(JSON.stringify(original)))).toEqual({});
  });
});


it('requires a validated sender baseline matching exactly the changed devices and preferences', () => {
  const state = createDefaultSimulationSnapshot();
  const changes = { deviceStates: { 'living-light': { on: false, level: 44 } }, motionDisabled: true };
  const message = { ...envelope, type: 'patch', requestId: 1, changes, base: simulationChangeBaseline(state, changes) };
  expect(parseSimulationRequest(message)).not.toBeNull();
  expect(parseSimulationRequest({ ...message, base: undefined })).toBeNull();
  expect(parseSimulationRequest({ ...message, base: { motionDisabled: false } })).toBeNull();
  expect(parseSimulationRequest({ ...message, base: { ...message.base, night: false } })).toBeNull();
  expect(parseSimulationRequest({ ...message, base: { ...message.base, deviceStates: { 'master-light': state.deviceStates['master-light'] } } })).toBeNull();
  expect(parseSimulationRequest({ ...message, base: { ...message.base, deviceStates: { 'living-light': { on: true, level: -1 } } } })).toBeNull();
});

it('rebases settings deletions without restoring unrelated stale power or level', () => {
  const original = createDefaultSimulationSnapshot();
  original.deviceStates['living-light'] = { on: true, level: 30, settings: { color: '#A0E9FF', colorTempK: 4000 } };
  const changes = { deviceStates: { 'living-light': { on: true, level: 30, settings: { colorTempK: 5000 } } } };
  const latest = mergeSimulationChanges(original, { deviceStates: { 'living-light': { ...original.deviceStates['living-light'], on: false, level: 70 } } });
  expect(rebaseSimulationChanges(latest, simulationChangeBaseline(original, changes), changes).deviceStates['living-light'])
    .toEqual({ on: false, level: 70, settings: { colorTempK: 5000 } });
});

it('retains position on/level invariants when rebasing a slider over newer position changes', () => {
  const original = createDefaultSimulationSnapshot();
  original.deviceStates['master-blinds'] = { on: true, level: 30 };
  const changes = { deviceStates: { 'master-blinds': { on: true, level: 70 } } };
  const latest = mergeSimulationChanges(original, { deviceStates: { 'master-blinds': { on: false, level: 0 } } });
  expect(rebaseSimulationChanges(latest, simulationChangeBaseline(original, changes), changes).deviceStates['master-blinds'])
    .toEqual({ on: true, level: 70 });
});
