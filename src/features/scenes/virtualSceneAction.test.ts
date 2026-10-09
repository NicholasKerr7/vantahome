import { isMonitor } from '../../../packages/home-scene/src/deviceCapabilities';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { Device, Scene } from '../../store/useHomeStore';
import { buildVirtualSceneAction, normalizeSceneOverride } from './virtualSceneAction';
import { reduceSimulationScene } from './simulationSceneExecution';
import { virtualSceneHome } from './sceneTestFixtures';
import { sceneSelectableDevices } from './sceneScope';

test('every selectable virtual appliance authors settings accepted by the shared reducer', () => {
  const state = virtualSceneHome();
  const devices = sceneSelectableDevices(state.devices, 'home', '');
  expect(devices.every((device) => !isMonitor(device.kind))).toBe(true);
  for (const device of devices) {
    const action = buildVirtualSceneAction(device);
    const scene: Scene = { id: device.id, name: 'Test', roomId: '', scope: 'home', actions: [action] };
    expect(() => reduceSimulationScene(createDefaultSimulationSnapshot(), scene, new Map([[device.id, device.modelDeviceId!]]))).not.toThrow();
    if (action.type === 'patch') {
      for (const field of ['status', 'progress', 'remainingMin', 'observedAt']) expect(action.patch).not.toHaveProperty(field);
    }
  }
});

test.each(['master-blinds', 'entry-gate', 'entry-door'])( 'saving Off for %s cannot retain an open target', (id) => {
  const device = { ...virtualSceneHome().devices.find((device) => device.modelDeviceId === id)!, isOn: true, openPercent: 100 };
  const patch = normalizeSceneOverride(device, { isOn: false });
  expect(patch).toEqual({ isOn: false, openPercent: 0 });
  expect(buildVirtualSceneAction(device, patch)).toMatchObject({ patch: { isOn: false, openPercent: 0 } });
});

test('camera arming and vacuum docking follow the control intent rather than stale state fields', () => {
  const state = virtualSceneHome();
  const camera = { ...state.devices.find((device) => device.kind === 'camera')!, isOn: true, armed: true };
  expect(buildVirtualSceneAction(camera, normalizeSceneOverride(camera, { isOn: false }))).toMatchObject({ patch: { isOn: false, armed: false } });
  const vacuum = state.devices.find((device) => device.kind === 'vacuum')!;
  expect(normalizeSceneOverride(vacuum, { status: 'docked' })).toEqual({ isOn: false });
  expect(buildVirtualSceneAction(vacuum, { status: 'docked', progress: 80 } as Partial<Device>)).toMatchObject({ patch: { isOn: false } });
});

test('monitors reject authored fake power states', () => {
  const monitor = virtualSceneHome().devices.find((device) => device.kind === 'smoke')!;
  expect(() => buildVirtualSceneAction(monitor, { isOn: false })).toThrow('monitor');
});
