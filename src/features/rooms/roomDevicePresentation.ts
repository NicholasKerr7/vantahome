import { getDevice } from "../../../packages/home-scene/src/data";
import { deviceCardReading } from "../../../packages/home-scene/src/dashboardCardPresentation";
import {
  deviceStatus,
  quickActionLabel,
} from "../../../packages/home-scene/src/deviceCapabilities";
import type { DeviceState } from "../../../packages/home-scene/src/simulationTypes";
import type { DeviceCommand } from "../../services/deviceClient";
import type { Device } from "../../store/useHomeStore";

export interface RoomDevicePresentation {
  name: string;
  status: string;
  value: string;
  caption: string;
  active: boolean;
  quickActionLabel: string;
}

type NativeQuickAction =
  | { type: "controls"; label: string }
  | { type: "command"; label: string; command: DeviceCommand };
const READ_ONLY_KINDS = new Set<Device["kind"]>([
  "energy",
  "water",
  "air",
  "smoke",
  "gas-meter",
  "gas-leak",
  "solar",
  "battery",
]);
const COVER_KINDS = new Set<Device["kind"]>([
  "door",
  "garage",
  "gate",
  "window",
  "blinds",
]);

/** Keep sensor shortcuts read-only and retain meaningful camera, cover, and appliance commands. */
export function nativeRoomQuickAction(device: Device): NativeQuickAction {
  if (READ_ONLY_KINDS.has(device.kind))
    return { type: "controls", label: "View readings" };
  if (device.kind === "camera")
    return {
      type: "command",
      label: device.armed ? "Disarm" : "Arm",
      command: {
        op: "set-properties",
        deviceId: device.id,
        changes: { armed: !device.armed },
      },
    };
  if (COVER_KINDS.has(device.kind)) {
    const opened = (device.openPercent ?? (device.isOn ? 100 : 0)) > 0;
    return {
      type: "command",
      label: opened ? "Close" : "Open",
      command: {
        op: "set-properties",
        deviceId: device.id,
        changes: { openPercent: opened ? 0 : 100, isOn: !opened },
      },
    };
  }
  const label =
    device.kind === "coffee"
      ? device.isOn
        ? "Stop brewing"
        : "Brew now"
      : device.kind === "sprinkler"
        ? device.isOn
          ? "Stop watering"
          : "Start watering"
        : device.isOn
          ? "Turn off"
          : "Turn on";
  return {
    type: "command",
    label,
    command: {
      op: "set-properties",
      deviceId: device.id,
      changes: { isOn: !device.isOn },
    },
  };
}

/** Show missing observations explicitly instead of inventing a live reading. */
function reading(value: number | undefined, unit: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 10) / 10}${unit}`
    : "—";
}

/** Make the useful native reading prominent while leaving all advanced settings in full controls. */
function nativeReading(device: Device): { value: string; caption: string } {
  if (COVER_KINDS.has(device.kind))
    return {
      value: reading(device.openPercent, "%"),
      caption: "Opening position",
    };
  switch (device.kind) {
    case "light":
      return {
        value: device.isOn ? reading(device.brightness, "%") : "Off",
        caption: "Brightness",
      };
    case "ac":
      return {
        value: reading(device.tempC, "°C"),
        caption: "Target temperature",
      };
    case "fridge":
      return {
        value: reading(device.tempC, "°C"),
        caption: "Refrigerator temperature",
      };
    case "water-heater":
      return {
        value: reading(device.tempC, "°C"),
        caption: "Water temperature",
      };
    case "tv":
    case "speaker":
      return { value: reading(device.volume, "%"), caption: "Volume" };
    case "fan":
      return { value: reading(device.speed, "%"), caption: "Fan speed" };
    case "camera":
      return {
        value: device.armed ? "Armed" : "Disarmed",
        caption: device.recording ? "Recording enabled" : "Camera protection",
      };
    case "energy":
      return {
        value:
          device.gridAvailable === false
            ? "Grid offline"
            : reading(device.powerW, " W"),
        caption: "Power reading",
      };
    case "water":
      return {
        value: reading(device.waterLpm, " L/min"),
        caption: "Water flow",
      };
    case "air":
      return {
        value: reading(device.airQualityIndex, ""),
        caption: "Air quality index",
      };
    case "smoke":
      return {
        value:
          device.smokeDetected === undefined
            ? "—"
            : device.smokeDetected
              ? "Alert"
              : "Clear",
        caption: "Smoke sensor",
      };
    case "gas-meter":
      return {
        value: reading(device.gasRemainingKg, " kg"),
        caption: "Gas sample",
      };
    case "gas-leak":
      return {
        value:
          device.gasLeakDetected === undefined
            ? "—"
            : device.gasLeakDetected
              ? "Leak"
              : "Clear",
        caption: "Gas sample",
      };
    case "washer":
    case "dryer":
    case "dishwasher":
      return {
        value: device.cycle || (device.isOn ? "Running" : "Ready"),
        caption: "Selected cycle",
      };
    case "vacuum":
      return {
        value: device.status || (device.isOn ? "Cleaning" : "Ready"),
        caption: "Cleaning status",
      };
    case "microwave":
      return {
        value: reading(device.timeRemainingSec, "s"),
        caption: "Time remaining",
      };
    case "stove":
      return {
        value: reading(device.burnerLevel, ""),
        caption: "Cooking level",
      };
    default:
      return { value: device.isOn ? "On" : "Off", caption: "Device state" };
  }
}

/** Accept model state only from a verified simulation scope supplied by the room controller. */
export function roomDevicePresentation(
  device: Device,
  modelState?: DeviceState,
  modelDeviceId: string = device.id,
): RoomDevicePresentation {
  const definition = modelState ? getDevice(modelDeviceId) : undefined;
  if (definition?.kind === device.kind && modelState) {
    return {
      name: device.simulationOnly ? device.name : definition.name,
      status: deviceStatus(definition, modelState),
      ...deviceCardReading(definition, modelState),
      active: modelState.on,
      quickActionLabel: quickActionLabel(definition, modelState),
    };
  }
  // Virtual entries have no hardware observations. Never present their registry
  // placeholder as an actual off state while the scoped simulation is loading.
  if (device.simulationOnly) return {
    name: device.name,
    status: 'Simulation unavailable',
    value: '—',
    caption: 'Open controls to reconnect',
    active: false,
    quickActionLabel: 'View controls',
  };
  const native = nativeReading(device);
  return {
    name: device.name,
    status: native.value,
    ...native,
    active:
      device.kind === "camera"
        ? Boolean(device.armed)
        : COVER_KINDS.has(device.kind)
          ? (device.openPercent ?? (device.isOn ? 100 : 0)) > 0
          : device.isOn,
    quickActionLabel: nativeRoomQuickAction(device).label,
  };
}
