import {
  GAS_LEAK_FIELDS, GAS_METER_FIELDS, readGasSetting,
} from "../../../packages/home-scene/src/gasSimulation";
import type { DeviceState } from "../../../packages/home-scene/src/simulationTypes";
import type { Device } from "../../store/useHomeStore";

export type GasDeviceKind = "gas-meter" | "gas-leak";
export const GAS_DEMO_IDS = { meter: "d40", detector: "d41" } as const;

/** Gas monitors are explicitly simulated and never use the generic power command. */
export function isGasDevice(kind: Device["kind"]): kind is GasDeviceKind {
  return kind === "gas-meter" || kind === "gas-leak";
}

/** Read only the shared gas field contract, excluding identity and transport metadata. */
export function projectGasDevice(device: Device, state: DeviceState): Device {
  if (!isGasDevice(device.kind)) return device;
  let next = device;
  const fields = device.kind === "gas-meter" ? GAS_METER_FIELDS : GAS_LEAK_FIELDS;
  for (const field of fields) {
    const value = readGasSetting(device.kind, state, field);
    if (value !== undefined && device[field] !== value) next = { ...next, [field]: value };
  }
  return next;
}

/** Seed the same reproducible samples as the model; only local demo hydration adds them. */
export function createGasDemoDevices(): Device[] {
  const empty: DeviceState = { on: true, level: 0 };
  return [
    projectGasDevice({ id: GAS_DEMO_IDS.meter, name: "LPG Smart Gas Meter", kind: "gas-meter", roomId: "r3", isOn: true }, empty),
    projectGasDevice({ id: GAS_DEMO_IDS.detector, name: "Kitchen Gas Leak Detector", kind: "gas-leak", roomId: "r3", isOn: true }, empty),
  ];
}

/** Upgrade an older demo once, preserving its device ordering and saved samples. */
export function addMissingGasDemoDevices(devices: Device[]): Device[] {
  const existing = new Set(devices.map((device) => device.id));
  const added = createGasDemoDevices().filter((device) => !existing.has(device.id));
  return added.length ? [...devices, ...added] : devices;
}
