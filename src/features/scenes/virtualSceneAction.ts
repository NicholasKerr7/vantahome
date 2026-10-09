import { getDevice, isPositionDevice } from '../../../packages/home-scene/src/data';
import { getCapabilities, isMonitor, readDeviceSetting, validateSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { Device, DeviceKind, SceneAction } from '../../store/useHomeStore';

const editorFields: Partial<Record<DeviceKind, readonly (keyof Device)[]>> = {
  ac: ['tempC', 'mode'], light: ['brightness'], tv: ['volume', 'channel', 'muted', 'source'], fan: ['speed'],
  blinds: ['openPercent'], garage: ['openPercent'], door: ['openPercent'], gate: ['openPercent'], window: ['openPercent'],
  camera: ['armed', 'recording'], stove: ['burnerLevel', 'stoveMode', 'stoveTimerMin', 'stoveLock'],
  washer: ['cycle', 'washTemp', 'spinSpeedRpm', 'soilLevel'], dryer: ['cycle', 'heatLevel', 'drynessLevel'],
  microwave: ['timeRemainingSec', 'microwavePower', 'microwaveMode'], fridge: ['tempC'],
};

/** Keep power, position, camera arming and vacuum intent consistent at each editor interaction. */
export function normalizeSceneOverride(device: Device, patch: Partial<Device>): Partial<Device> {
  const position = ['blinds', 'window', 'door', 'gate', 'garage'].includes(device.kind);
  if (position && patch.openPercent !== undefined) return { ...patch, isOn: patch.openPercent > 0 };
  if (position && patch.isOn !== undefined) return { ...patch, openPercent: patch.isOn ? 100 : 0 };
  if (device.kind === 'camera' && patch.armed !== undefined) return { ...patch, isOn: patch.armed };
  if (device.kind === 'camera' && patch.isOn !== undefined) return { ...patch, armed: patch.isOn };
  if (device.simulationOnly && device.kind === 'vacuum' && patch.status !== undefined) return { isOn: patch.status === 'cleaning' };
  return patch;
}

/** Author real control intent only; read-only observations never become saved simulation commands. */
export function buildVirtualSceneAction(device: Device, override: Partial<Device> = {}): SceneAction {
  const definition = device.modelDeviceId ? getDevice(device.modelDeviceId) : undefined;
  if (!definition || definition.kind !== device.kind) throw new Error('This device is no longer linked to the 3D home. Review the scene before saving.');
  if (isMonitor(device.kind)) throw new Error('This monitor belongs in device status, not a power scene.');
  const defaults = createDefaultSimulationSnapshot().deviceStates[definition.id];
  const capabilities = getCapabilities(device.kind);
  const normalized = normalizeSceneOverride(device, override);
  const patch: Partial<Device> = { isOn: normalized.isOn ?? device.isOn };
  for (const field of editorFields[device.kind] ?? []) {
    const capability = capabilities.find((entry) => 'field' in entry && entry.field === field);
    if (!capability || capability.type === 'stat') continue;
    const desired = normalized[field] ?? device[field] ?? readDeviceSetting(definition, defaults, field);
    const valid = validateSetting(capability, desired);
    if (valid !== undefined) Object.assign(patch, { [field]: valid });
  }
  // Presets may include additional supported values (such as warm-white color temperature).
  for (const [field, value] of Object.entries(normalized)) {
    if (field === 'isOn') continue;
    const capability = capabilities.find((entry) => 'field' in entry && entry.field === field);
    if (!capability || capability.type === 'stat') continue;
    const valid = validateSetting(capability, value);
    if (valid !== undefined) Object.assign(patch, { [field]: valid });
  }
  if (isPositionDevice(definition) && patch.openPercent !== undefined) patch.isOn = patch.openPercent > 0;
  if (device.kind === 'camera' && patch.armed !== undefined) patch.isOn = patch.armed;
  return { type: 'patch', deviceId: device.id, patch };
}
