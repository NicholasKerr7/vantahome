import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHORED_DEVICES, getDevice } from './data';
import { createDefaultDevicePlacement, getRuntimePlacements, replaceRuntimeDevices, type RuntimePlacedDevice } from './devicePlacement';
import { FULL_SCENE_ACCESS, type SceneAccess } from './sceneAccess';
import { createSimulationBridgeClient } from './simulationBridgeClient';
import { createDefaultSimulationSnapshot, parseSimulationRequest, parseSimulationSnapshotMessage, parseStoredSimulationSnapshotMessage, reconcileSimulationSnapshot, SIMULATION_CHANNEL, type SimulationSnapshot, type SimulationSnapshotMessage } from './simulationBridgeProtocol';

const id = 'placed-00000000-0000-4000-8000-000000000001';
const placement: RuntimePlacedDevice = { id, name: 'Reading light', placement: createDefaultDevicePlacement('master-bedside-left', 'living')! };
/** A full snapshot can be validated in a fresh renderer before its runtime catalog is installed. */
function message(): SimulationSnapshotMessage {
  const state = createDefaultSimulationSnapshot();
  state.deviceStates[id] = { on: true, level: 34, settings: { brightness: 34 } };
  return { channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', placements: [placement], state,
    access: { ...FULL_SCENE_ACCESS, deviceIds: [...FULL_SCENE_ACCESS.deviceIds, id], controllableDeviceIds: [...FULL_SCENE_ACCESS.controllableDeviceIds, id] } };
}
afterEach(() => { replaceRuntimeDevices([]); });

describe('runtime device snapshot boundaries', () => {
  it('validates host and stored definitions without changing the active catalog', () => {
    const input = message();
    expect(parseSimulationSnapshotMessage(input)).toEqual(input);
    expect(parseStoredSimulationSnapshotMessage(JSON.stringify(input))?.state.deviceStates[id].level).toBe(34);
    expect(getDevice(id)).toBeUndefined();
    expect(getRuntimePlacements()).toEqual([]);
  });

  it('rejects undeclared devices, malformed definitions, device-room grant mismatches and extra capabilities', () => {
    const input = message();
    expect(parseSimulationSnapshotMessage({ ...input, placements: [] })).toBeNull();
    expect(parseSimulationSnapshotMessage({ ...input, placements: [{ ...placement, placement: { ...placement.placement, templateId: 'entry-gate' } }] })).toBeNull();
    expect(parseSimulationSnapshotMessage({ ...input, access: { fullHome: false, roomIds: ['family'], deviceIds: [id], controllableDeviceIds: [id] } })).toBeNull();
    expect(parseSimulationSnapshotMessage({ ...input, state: { ...input.state, deviceStates: { ...input.state.deviceStates, [id]: { on: true, level: 34, settings: { entityId: 'real.light' } } } } })).toBeNull();
    expect(getDevice(id)).toBeUndefined();
  });

  it('renderer patches cannot introduce device definitions or control an unknown custom identity', () => {
    const changes = { deviceStates: { [id]: { on: false, level: 22 } } };
    const input = { channel: SIMULATION_CHANNEL, version: 1, type: 'patch', requestId: 1, changes, base: changes };
    expect(parseSimulationRequest(input)).toBeNull();
    replaceRuntimeDevices([placement]);
    expect(parseSimulationRequest(input)).not.toBeNull();
    expect(parseSimulationRequest({ ...input, placements: [placement] })).toBeNull();
  });

  it('adds defaults on registry growth and drops only removed devices without resetting existing settings', () => {
    const saved = createDefaultSimulationSnapshot();
    saved.deviceStates['living-light'] = { on: false, level: 23 };
    replaceRuntimeDevices([placement]);
    const expanded = reconcileSimulationSnapshot(saved);
    expect(expanded.deviceStates['living-light']).toEqual(saved.deviceStates['living-light']);
    expect(expanded.deviceStates[id]).toEqual({ on: false, level: getDevice(id)!.defaultLevel });
    expanded.deviceStates[id] = { on: true, level: 34 };
    expect(reconcileSimulationSnapshot(expanded).deviceStates[id]).toEqual({ on: true, level: 34 });
    replaceRuntimeDevices([]);
    const reduced = reconcileSimulationSnapshot(expanded);
    expect(reduced.deviceStates[id]).toBeUndefined();
    expect(Object.keys(reduced.deviceStates)).toHaveLength(AUTHORED_DEVICES.length);
    expect(reduced.deviceStates['living-light'].level).toBe(23);
  });

  it('installs valid fixtures before applying their access/state, and clears them on a later empty scope', () => {
    const received: { state: SimulationSnapshot; access?: SceneAccess }[] = [];
    const client = createSimulationBridgeClient({ store: { subscribe: () => () => {}, applySnapshot(state, access) {
      if (state.deviceStates[id]) expect(getDevice(id)?.name).toBe(placement.name);
      received.push({ state, access });
    } }, send: vi.fn(), onHydrated: vi.fn(), onSyncError: vi.fn() });
    client.receive(message());
    expect(received).toHaveLength(1);
    expect(getDevice(id)).toBeDefined();
    replaceRuntimeDevices([]);
    const empty = createDefaultSimulationSnapshot();
    replaceRuntimeDevices([placement]);
    client.receive({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', placements: [], state: empty, access: FULL_SCENE_ACCESS });
    expect(received).toHaveLength(2);
    expect(getDevice(id)).toBeUndefined();
    client.dispose();
  });

  it('does not install a catalog carried by an invalid acknowledgement or failed snapshot', () => {
    const client = createSimulationBridgeClient({ store: { subscribe: () => () => {}, applySnapshot: vi.fn() }, send: vi.fn(), onHydrated: vi.fn(), onSyncError: vi.fn() });
    client.receive({ ...message(), acknowledgedRequestId: 99 });
    expect(getDevice(id)).toBeUndefined();
    client.receive({ ...message(), state: { deviceStates: {} } });
    expect(getDevice(id)).toBeUndefined();
    client.dispose();
  });
});
