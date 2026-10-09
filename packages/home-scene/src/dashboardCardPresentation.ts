import { isPositionDevice, type DeviceDefinition } from "./data";
import {
  deviceStatus,
  isMonitor,
  readDeviceSetting,
} from "./deviceCapabilities";
import type { DeviceState } from "./simulationTypes";

/** Format only a finite simulated value; absent or malformed readings remain explicitly unavailable. */
function numericReading(value: unknown, unit: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 10) / 10}${unit}`
    : "—";
}

/** Make the selected device's actual setting prominent without inventing live telemetry. */
export function deviceCardReading(
  device: DeviceDefinition,
  state: DeviceState,
): { value: string; caption: string } {
  const status = deviceStatus(device, state);
  if (isPositionDevice(device))
    return {
      value: `${Math.round(state.level)}%`,
      caption: `Opening position · ${status}`,
    };
  if (device.kind === "gas-leak")
    return {
      value: readDeviceSetting(device, state, "gasLeakDetected")
        ? "Leak"
        : "Clear",
      caption: "Simulation sample",
    };
  if (device.kind === "gas-meter")
    return {
      value: readDeviceSetting(device, state, "gasLeakInterlock")
        ? "Leak"
        : `${readDeviceSetting(device, state, "gasRemainingKg")} kg`,
      caption: `Sample · valve ${readDeviceSetting(device, state, "gasValveOpen") ? "open" : "closed"}`,
    };
  if (device.kind === "ac")
    return {
      value: `${readDeviceSetting(device, state, "tempC")}°C`,
      caption: `Target temperature · ${status}`,
    };
  if (device.kind === "fan")
    return {
      value: numericReading(readDeviceSetting(device, state, "speed"), "%"),
      caption: `Fan speed · ${status}`,
    };
  if (device.kind === "fridge" || device.kind === "water-heater")
    return {
      value: numericReading(readDeviceSetting(device, state, "tempC"), "°C"),
      caption: `Target temperature · ${status}`,
    };
  if (device.kind === "speaker" || device.kind === "tv")
    return {
      value: numericReading(readDeviceSetting(device, state, "volume"), "%"),
      caption: `Volume · ${status}`,
    };
  if (device.kind === "air")
    return {
      value: numericReading(
        readDeviceSetting(device, state, "airQualityIndex"),
        " AQI",
      ),
      caption: "Air quality · Simulation sample",
    };
  if (device.kind === "water")
    return {
      value: numericReading(
        readDeviceSetting(device, state, "waterLpm"),
        " L/min",
      ),
      caption: "Water flow · Simulation sample",
    };
  if (device.kind === "energy" || device.kind === "solar")
    return {
      value: numericReading(
        readDeviceSetting(
          device,
          state,
          device.kind === "solar" ? "solarW" : "powerW",
        ),
        " W",
      ),
      caption: `${device.kind === "solar" ? "Solar output" : "Power"} · Simulation sample`,
    };
  if (device.kind === "smoke")
    return {
      value:
        readDeviceSetting(device, state, "smokeDetected") === true
          ? "Smoke"
          : readDeviceSetting(device, state, "coDetected") === true
            ? "CO alert"
            : state.settings?.fireIncidentActive === true
              ? "Reset pending"
              : "Clear",
      caption: "Smoke / CO · Simulation sample",
    };
  if (device.kind === "light" && state.on)
    return { value: `${Math.round(state.level)}%`, caption: "Brightness · On" };
  if (device.kind === "battery")
    return {
      value: `${Math.round(state.level)}%`,
      caption: "Simulated charge",
    };
  return {
    value: status,
    caption: isMonitor(device.kind) ? "Simulation sample" : "Device state",
  };
}

/** Short embedded phones trade page size for readable cards, never smaller tap targets. */
export function libraryCardPageSize(viewportHeight: number): 2 | 4 {
  return viewportHeight <= 520 ? 2 : 4;
}
