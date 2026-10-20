import { getDevice } from '../../../../packages/home-scene/src/data';
import { applyDeviceSetting, runDeviceActionState } from '../../../../packages/home-scene/src/deviceControlActions';
import { readLaundryControllerState } from '../../../../packages/home-scene/src/laundryController';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { validCachedDevicePatch } from '../../../store/cachedDeviceValidation';
import type { Device } from '../../../store/useHomeStore';
import { projectModelSnapshot } from '../modelHomeCatalog';

describe('native laundry activity projection', () => {
  test.each(['washer', 'dryer'] as const)('keeps %s pause after a preference edit, cache validation and scene restoration', (kind) => {
    const id = `laundry-${kind}`;
    const definition = getDevice(id)!;
    const snapshot = createDefaultSimulationSnapshot();
    let state = runDeviceActionState(id, { on: true, level: 35, settings: { progress: 32, remainingMin: 19 } }, `${kind}-pause`);
    state = applyDeviceSetting(id, state, 'cycle', 'Quick');
    snapshot.deviceStates[id] = state;
    const selected: Device = { id, kind, name: 'Selected machine', roomId: 'laundry', isOn: true };
    const partner: Device = { id: kind === 'washer' ? 'laundry-dryer' : 'laundry-washer', kind: kind === 'washer' ? 'dryer' : 'washer', name: 'Partner', roomId: 'laundry', isOn: false };
    const projected = projectModelSnapshot([selected, partner], snapshot);
    expect(projected[0]).toMatchObject({ isOn: false, laundryActivity: 'paused', cycle: 'Quick', progress: 32, remainingMin: 19 });
    expect(projected[1].isOn).toBe(false);
    expect(validCachedDevicePatch(projected[0])).toBe(true);
    const restored = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
    expect(readLaundryControllerState(definition, restored!.state.deviceStates[id])).toMatchObject({
      on: false, activity: 'paused', cycle: 'Quick', progressPercent: 32, remainingMin: 19,
    });
  });

  test('does not accept unknown laundry activity or reuse vacuum states', () => {
    expect(validCachedDevicePatch({ laundryActivity: 'stopped' })).toBe(true);
    expect(validCachedDevicePatch({ laundryActivity: 'cleaning' })).toBe(false);
    expect(validCachedDevicePatch({ laundryActivity: 1 })).toBe(false);
    expect(validCachedDevicePatch({ status: 'running' })).toBe(false);
  });
});
