import { getCameraConsolePresentation, cameraControllerActionId } from '../../../../packages/home-scene/src/cameraController';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { applyDeviceSetting, runDeviceActionState } from '../../../../packages/home-scene/src/deviceControlActions';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { validCachedDevicePatch } from '../../../store/cachedDeviceValidation';
import type { Device } from '../../../store/useHomeStore';
import { projectModelSnapshot } from '../modelHomeCatalog';

describe('native camera console projection', () => {
  test.each([true, false])('retains independent host power=%s while arming and preview preferences survive restoration', (power) => {
    const id = 'entry-camera';
    const definition = getDevice(id)!;
    const snapshot = createDefaultSimulationSnapshot();
    let state = applyDeviceSetting(id, snapshot.deviceStates[id], 'armed', !power);
    state = applyDeviceSetting(id, state, 'nightVision', false);
    state = applyDeviceSetting(id, state, 'motionAlerts', false);
    state = applyDeviceSetting(id, state, 'recording', true);
    state = runDeviceActionState(id, state, cameraControllerActionId('snapshot'));
    snapshot.deviceStates[id] = state;
    const selected: Device = { id, kind: 'camera', name: definition.name, roomId: definition.roomId,
      isOn: power, armed: power, streamUrl: 'https://private.invalid/feed',
      thumbnailUrl: 'https://private.invalid/frame', lastThumbnailUrl: 'https://private.invalid/last' };
    const projected = projectModelSnapshot([selected], snapshot)[0];
    expect(projected).toMatchObject({ id, isOn: power, armed: !power, nightVision: false, motionAlerts: false, recording: true });
    expect(projected).not.toHaveProperty('streamUrl');
    expect(projected).not.toHaveProperty('thumbnailUrl');
    expect(projected).not.toHaveProperty('lastThumbnailUrl');
    expect(projected).not.toHaveProperty('cameraPreviewEvent');
    expect(validCachedDevicePatch(projected)).toBe(true);
    const restored = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
    expect(restored?.state.deviceStates[id]).toEqual(state);
    expect(getCameraConsolePresentation(definition, restored!.state.deviceStates[id])).toMatchObject({
      armed: !power, nightVision: false, motionAlerts: false, recording: true,
      previewEvent: { kind: 'snapshot', label: 'Simulated snapshot' },
    });
  });
});
