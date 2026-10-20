import { getDevice } from '../../../../packages/home-scene/src/data';
import { applyDeviceSetting, runDeviceActionState } from '../../../../packages/home-scene/src/deviceControlActions';
import { openingControllerActionId, readOpeningControllerState } from '../../../../packages/home-scene/src/openingController';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { validCachedDevicePatch } from '../../../store/cachedDeviceValidation';
import type { Device } from '../../../store/useHomeStore';
import { projectModelSnapshot } from '../modelHomeCatalog';

describe('native fixture position projection', () => {
  test.each([
    ['door', 'entry-door'], ['garage', 'utility-shutter'], ['window', 'kitchen-window'],
  ] as const)('%s projects accepted position while its scene snapshot retains saved preferences', (kind, id) => {
    const definition = getDevice(id)!;
    const snapshot = createDefaultSimulationSnapshot();
    let state = runDeviceActionState(id, { on: false, level: 35 }, openingControllerActionId(kind, 'increase'));
    state = applyDeviceSetting(id, state, 'scheduleEnabled', true);
    state = applyDeviceSetting(id, state, 'scheduleHour', 19);
    snapshot.deviceStates[id] = state;
    const selected: Device = { id, kind, name: definition.name, roomId: definition.roomId, isOn: false };
    const light: Device = { id: 'living-light', kind: 'light', name: 'Pendant', roomId: 'living', isOn: false };
    const projected = projectModelSnapshot([selected, light], snapshot);
    expect(projected[0]).toMatchObject({ id, kind, isOn: true, openPercent: 40 });
    expect(projected[1].openPercent).toBeUndefined();
    expect(validCachedDevicePatch(projected[0])).toBe(true);
    const restored = parseStoredSimulationSnapshotMessage({
      channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot,
    });
    expect(restored?.state.deviceStates[id].settings).toMatchObject({ scheduleEnabled: true, scheduleHour: 19 });
    expect(readOpeningControllerState(definition, restored!.state.deviceStates[id])).toMatchObject({ kind, openPercent: 40, status: '40% open' });
    snapshot.deviceStates[id] = runDeviceActionState(id, state, openingControllerActionId(kind, 'close'));
    expect(projectModelSnapshot([selected], snapshot)[0]).toMatchObject({ isOn: false, openPercent: 0 });
  });
});
