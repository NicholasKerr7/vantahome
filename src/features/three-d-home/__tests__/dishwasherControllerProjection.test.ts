import { getDevice } from '../../../../packages/home-scene/src/data';
import { applyDeviceSetting, runDeviceActionState } from '../../../../packages/home-scene/src/deviceControlActions';
import { readDishwasherControllerState } from '../../../../packages/home-scene/src/dishwasherController';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { validCachedDevicePatch } from '../../../store/cachedDeviceValidation';
import type { Device } from '../../../store/useHomeStore';
import { projectModelSnapshot } from '../modelHomeCatalog';

describe('native dishwasher activity projection', () => {
  test.each(['pause', 'stop'] as const)('retains %s activity and Dry Boost after cache projection and scene restoration', (command) => {
    const id = 'kitchen-dishwasher';
    const definition = getDevice(id)!;
    const snapshot = createDefaultSimulationSnapshot();
    let state = runDeviceActionState(id, { on: true, level: 40, settings: { progress: 37, remainingMin: 19 } }, `dishwasher-${command}`);
    state = applyDeviceSetting(id, state, 'cycle', 'Quick');
    state = applyDeviceSetting(id, state, 'extraSpin', true);
    snapshot.deviceStates[id] = state;
    const selected: Device = { id, kind: 'dishwasher', name: 'Dishwasher', roomId: 'kitchen', isOn: true };
    const washer: Device = { id: 'laundry-washer', kind: 'washer', name: 'Washing machine', roomId: 'laundry', isOn: false };
    const projected = projectModelSnapshot([selected, washer], snapshot);
    const activity = command === 'pause' ? 'paused' : 'stopped';
    expect(projected[0]).toMatchObject({ isOn: false, dishwasherActivity: activity, cycle: 'Quick', extraSpin: true, progress: 37, remainingMin: 19 });
    expect(projected[0].laundryActivity).toBeUndefined();
    expect(projected[1].dishwasherActivity).toBeUndefined();
    expect(projected[1].isOn).toBe(false);
    expect(validCachedDevicePatch(projected[0])).toBe(true);
    const restored = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
    expect(readDishwasherControllerState(definition, restored!.state.deviceStates[id])).toMatchObject({
      on: false, activity, cycle: 'Quick', extraDry: true, progressPercent: 37, remainingMin: 19,
    });
  });

  test('rejects unknown or malformed activity without widening the vacuum schema', () => {
    expect(validCachedDevicePatch({ dishwasherActivity: 'stopped' })).toBe(true);
    expect(validCachedDevicePatch({ dishwasherActivity: 'complete' })).toBe(false);
    expect(validCachedDevicePatch({ dishwasherActivity: 1 })).toBe(false);
    expect(validCachedDevicePatch({ status: 'running' })).toBe(false);
  });
});
