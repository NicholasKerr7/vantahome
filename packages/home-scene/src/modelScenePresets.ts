import { DEVICES, PRESETS, isPositionDevice, type PresetId } from "./data";
import { isMonitor } from "./deviceCapabilities";
import { createPositionState } from "./deviceControlActions";
import { isGasDevice } from "./gasSimulation";
import { synchronizeSolarLights } from "./lightingAutomation";
import {
  createDefaultSimulationSnapshot,
  type SimulationSnapshot,
} from "./simulationBridgeProtocol";

/** Stable IDs identify seeded scenes without inferring identity from editable display names. */
export const MODEL_SCENE_PRESETS = PRESETS.map((preset) => ({
  ...preset,
  sceneId: `model-scene:${preset.id}`,
}));

/** Accept only the four authored presets; arbitrary metadata can never select an operation. */
export function isModelPreset(value: unknown): value is PresetId {
  return MODEL_SCENE_PRESETS.some((preset) => preset.id === value);
}

/** Apply original atmosphere semantics while preserving gas safety, camera and unrelated caller state. */
export function applyModelPreset<T extends SimulationSnapshot>(
  state: T,
  preset: PresetId,
): T {
  const devices = createDefaultSimulationSnapshot().deviceStates;
  if (preset === "movie") {
    devices["living-light"] = { on: true, level: 18 };
    devices["living-fan"] = { on: true, level: 25 };
    devices["family-tv"] = { on: true, level: 45 };
    devices["master-blinds"] = createPositionState(0);
  } else if (preset === "night" || preset === "away") {
    for (const device of DEVICES) {
      devices[device.id].on =
        isMonitor(device.kind) ||
        ["fridge", "battery", "camera"].includes(device.kind);
      if (device.kind === "camera")
        devices[device.id].settings = { armed: true };
      if (isPositionDevice(device)) devices[device.id] = createPositionState(0);
    }
    if (preset === "night") devices["master-ac"] = { on: true, level: 45 };
  }
  const night = preset === "night" || preset === "movie";
  // Presets never clear a leak, reopen its linked valve, or reset consumption.
  for (const device of DEVICES)
    if (isGasDevice(device.kind))
      devices[device.id] = state.deviceStates[device.id];
  return {
    ...state,
    deviceStates: synchronizeSolarLights(devices, night),
    night,
    lightingMode: night ? "night" : "day",
  };
}
