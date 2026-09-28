import { applyDeviceSetting, runDeviceActionState } from "../../../packages/home-scene/src/deviceControlActions";
import { validateStoredSetting } from "../../../packages/home-scene/src/deviceCapabilities";
import { GAS_DEVICE_IDS, GAS_LEAK_FIELDS, GAS_METER_FIELDS, synchronizeGasSafety } from "../../../packages/home-scene/src/gasSimulation";
import type { DeviceState, DeviceStates, SettingValue } from "../../../packages/home-scene/src/simulationTypes";
import { runtimePolicy } from "../../config/runtimeMode";
import { useHomeStore, type Device } from "../../store/useHomeStore";
import { canShareDemoDevices } from "../three-d-home/simulationSession";
import { GAS_DEMO_IDS, isGasDevice, projectGasDevice } from "./gasDemoDevices";

export type GasDemoIntent =
  | { type: "setting"; field: string; value: SettingValue }
  | { type: "action"; actionId: string };

/** Construct only validated sample settings; no host store or private fields enter the reducer. */
export function gasDemoState(device: Device): DeviceState {
  if (!isGasDevice(device.kind)) return { on: true, level: 0 };
  const fields = device.kind === "gas-meter" ? GAS_METER_FIELDS : GAS_LEAK_FIELDS;
  const settings: Record<string, SettingValue> = {};
  for (const field of fields) {
    const value = validateStoredSetting(device.kind, field, device[field]);
    if (value !== undefined) settings[field] = value;
  }
  return { on: true, level: 0, settings };
}

/** Reduce the explicitly paired samples together so an active leak cannot reopen the demo valve. */
export function reduceGasDemoIntent(devices: Device[], deviceId: string, intent: GasDemoIntent): Device[] {
  const meter = devices.find((device) => device.id === GAS_DEMO_IDS.meter && device.kind === "gas-meter");
  const detector = devices.find((device) => device.id === GAS_DEMO_IDS.detector && device.kind === "gas-leak");
  if (!meter || !detector || (deviceId !== meter.id && deviceId !== detector.id)) return devices;
  const sceneId = deviceId === meter.id ? GAS_DEVICE_IDS.meter : GAS_DEVICE_IDS.detector;
  const previous: DeviceStates = {
    [GAS_DEVICE_IDS.meter]: gasDemoState(meter), [GAS_DEVICE_IDS.detector]: gasDemoState(detector),
  };
  const current = previous[sceneId];
  const next = intent.type === "action"
    ? runDeviceActionState(sceneId, current, intent.actionId)
    : applyDeviceSetting(sceneId, current, intent.field, intent.value);
  if (next === current) return devices;
  const states = synchronizeGasSafety({ ...previous, [sceneId]: next }, previous);
  return devices.map((device) => device === meter ? projectGasDevice(device, states[GAS_DEVICE_IDS.meter])
    : device === detector ? projectGasDevice(device, states[GAS_DEVICE_IDS.detector]) : device);
}

/** Recheck local demo ownership on every press; this path has no hardware command dependency. */
export function runGasDemoIntent(deviceId: string, intent: GasDemoIntent): boolean {
  const home = useHomeStore.getState();
  if (!canShareDemoDevices(home, runtimePolicy.mode)) return false;
  const devices = reduceGasDemoIntent(home.devices, deviceId, intent);
  if (devices === home.devices) return false;
  useHomeStore.setState({ devices });
  return true;
}
