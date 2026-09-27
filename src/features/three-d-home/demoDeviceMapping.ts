import { getDevice, isPositionDevice } from "../../../packages/home-scene/src/data";
import {
  getCapabilities,
  isMonitor,
  readDeviceSetting,
  validateSetting,
  type SettingValue,
} from "../../../packages/home-scene/src/deviceCapabilities";
import type { DeviceState, SimulationSnapshot } from "../../../packages/home-scene/src/simulationBridgeProtocol";
import type { Device, DeviceKind } from "../../store/useHomeStore";

/** Curated demo correspondence; user device names and room labels never select a target. */
export const DEMO_DEVICE_MAPPINGS = [
  { demoId: "d2", sceneId: "living-light", kind: "light" },
  // The original demo's drawing-room TV represents the furnished family-room TV.
  { demoId: "d3", sceneId: "family-tv", kind: "tv" },
  { demoId: "d5", sceneId: "master-bedside-left", kind: "light" },
  { demoId: "d6", sceneId: "master-ac", kind: "ac" },
  { demoId: "d8", sceneId: "kitchen-light", kind: "light" },
  { demoId: "d9", sceneId: "kitchen-coffee", kind: "coffee" },
  { demoId: "d11", sceneId: "kitchen-fridge", kind: "fridge" },
  { demoId: "d13", sceneId: "entry-door", kind: "door" },
  { demoId: "d15", sceneId: "entry-camera", kind: "camera" },
  { demoId: "d17", sceneId: "kitchen-stove", kind: "stove" },
  { demoId: "d18", sceneId: "laundry-washer", kind: "washer" },
  { demoId: "d18b", sceneId: "kitchen-dishwasher", kind: "dishwasher" },
  { demoId: "d19", sceneId: "kitchen-microwave", kind: "microwave" },
  { demoId: "d20", sceneId: "utility-energy", kind: "energy" },
  { demoId: "d21", sceneId: "utility-water", kind: "water" },
  { demoId: "d23", sceneId: "grounds-sprinkler", kind: "sprinkler" },
  { demoId: "d24", sceneId: "living-speaker", kind: "speaker" },
  { demoId: "d25", sceneId: "master-smoke", kind: "smoke" },
  { demoId: "d26", sceneId: "entry-gate", kind: "gate" },
  { demoId: "d27", sceneId: "utility-water-heater", kind: "water-heater" },
  { demoId: "d34", sceneId: "grounds-light", kind: "light" },
  { demoId: "d39", sceneId: "terrace-camera", kind: "camera" },
] as const satisfies readonly { demoId: string; sceneId: string; kind: DeviceKind }[];

// Only common controls can cross the boundary. Identity, media URLs, observations,
// schedules, telemetry and account data are deliberately absent from this list.
const SHARED_CONTROL_FIELDS = [
  "tempC", "mode", "brightness", "speed", "volume", "muted", "openPercent",
  "armed", "recording", "nightVision", "motionAlerts", "motionSensitivity",
  "micMuted", "twoWayAudio", "burnerLevel", "stoveMode", "stoveTimerMin",
  "stoveLock", "cycle", "washTemp", "spinSpeedRpm", "soilLevel", "loadSize",
  "rinseCount", "prewash", "steamWash", "sanitizeWash", "smartDispense",
  "extraSpin", "ecoWash", "timeRemainingSec", "microwavePower", "microwaveMode",
  "energyBudgetKwh", "gridOutageAlerts", "waterLeakAlerts", "waterAutoShutoff",
  "waterBudgetL", "waterPressureLowPsi", "waterPressureHighPsi", "waterPressureAlerts",
  "durationMin", "zone", "speakerSource", "speakerPreset", "bass", "treble",
  "spatialAudio", "partyMode", "nightMode", "voiceAssistantEnabled", "micEnabled",
  "shuffle", "repeat", "heaterMode", "recirculation", "antiLegionella",
  "heaterScheduleEnabled", "vacationDays", "coffeeStrength", "coffeeSizeOz",
  "color", "colorTempK", "lightEffect", "adaptiveLighting", "motionBoost", "nightShift", "autoOffMin",
  "autoOpenEnabled", "channel", "source", "fanOscillation", "fanDirection", "fanTimerMin", "fanAutoMode", "fanLightOn", "fanSleepMode",
  "vacuumSuction", "vacuumMode", "vacuumMop", "vacuumQuietMode", "heatLevel", "drynessLevel", "sensorDry", "wrinkleGuard",
  "steamRefresh", "ecoDry", "airFluff", "coolDown", "antiStatic", "freezerTempC", "fridgeMode", "fridgeDoorAlarm", "fridgeIceMaker",
  "fridgeQuickCool", "fridgeQuickFreeze", "fridgeEnergySaver", "fridgeHumidity",
  "acFanSpeed", "acSwingMode", "acEcoMode", "acTurboMode", "acQuietMode", "acTargetHumidity",
  "coffeeCupCount", "coffeeTempC", "coffeeKeepWarmMin", "coffeeGrinder", "coffeeMilkFrother", "coffeeAutoBrewTime",
  "waterHeaterType", "airAlertAqi", "airAlertCo2", "airAlertPm25", "airAlertPm10", "airAlertVoc", "airAlertPollen",
] as const satisfies readonly (keyof Device)[];
type SharedControlField = (typeof SHARED_CONTROL_FIELDS)[number];

/** Narrow catalog field strings to an audited, typed dashboard control field. */
function isSharedControl(field: string): field is SharedControlField {
  return SHARED_CONTROL_FIELDS.some((candidate) => candidate === field);
}

/** Preserve percentages used by geometry while AC's explicit setting keeps its full range. */
function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Translate the supported setting's storage representation without importing a scene store. */
function writeSceneControl(
  kind: DeviceKind,
  state: DeviceState,
  field: SharedControlField,
  value: SettingValue,
): DeviceState {
  if (field === "openPercent" && typeof value === "number") {
    return state.level === value && state.on === (value > 0)
      ? state : { ...state, level: value, on: value > 0 };
  }
  if ((field === "brightness" && kind === "light") || (field === "speed" && kind === "fan")) {
    return typeof value !== "number" || state.level === value ? state : { ...state, level: value };
  }
  const on = field === "armed" && typeof value === "boolean" ? value : state.on;
  const level = kind === "ac" && field === "tempC" && typeof value === "number"
    ? clampPercentage((26 - value) / 0.08) : state.level;
  if (state.settings?.[field] === value && state.on === on && state.level === level) return state;
  return { ...state, on, level, settings: { ...state.settings, [field]: value } };
}

/** Infer white/color intent from original demo edits and mirror its absent cleared effect. */
function synchronizeDemoLightAppearance(device: Device, previous: DeviceState, state: DeviceState): DeviceState {
  if (device.kind !== 'light') return state;
  let next = state;
  if (device.lightEffect === undefined && next.settings?.lightEffect && next.settings.lightEffect !== 'none') {
    next = { ...next, settings: { ...next.settings, lightEffect: 'none' } };
  }
  const color = getCapabilities('light').find((capability) => 'field' in capability && capability.field === 'color');
  const temperature = getCapabilities('light').find((capability) => 'field' in capability && capability.field === 'colorTempK');
  const validColor = color && validateSetting(color, device.color);
  const validTemperature = temperature && validateSetting(temperature, device.colorTempK);
  const colorChanged = validColor !== undefined && previous.settings?.color !== validColor;
  const temperatureChanged = validTemperature !== undefined && previous.settings?.colorTempK !== validTemperature;
  const mode = colorChanged ? 'color' : validTemperature !== undefined && (temperatureChanged || validColor === undefined) ? 'temperature' : undefined;
  if (mode && next.settings?.lightColorMode !== mode) next = { ...next, settings: { ...next.settings, lightColorMode: mode } };
  return next;
}

/**
 * Apply explicitly paired dashboard demo controls to a simulation snapshot.
 * Callers must separately enforce demo mode, no authenticated user and no active home.
 * Missing fields retain the scene's remembered value; nothing is guessed from a name.
 */
export function overlayDemoDevices(
  snapshot: SimulationSnapshot,
  devices: readonly Device[],
): SimulationSnapshot {
  let deviceStates = snapshot.deviceStates;
  for (const mapping of DEMO_DEVICE_MAPPINGS) {
    const device = devices.find((candidate) => candidate.id === mapping.demoId);
    const definition = getDevice(mapping.sceneId);
    const previous = deviceStates[mapping.sceneId];
    if (!device || device.kind !== mapping.kind || definition?.kind !== mapping.kind || !previous) continue;
    let next = previous;
    // Camera `on` means armed in the scene; its dashboard power remains independent.
    if (!isMonitor(device.kind) && device.kind !== "camera" && !isPositionDevice(definition)
      && typeof device.isOn === "boolean" && previous.on !== device.isOn) {
      next = { ...next, on: device.isOn };
    }
    for (const capability of getCapabilities(definition.kind)) {
      if (!("field" in capability) || !isSharedControl(capability.field)) continue;
      const value = validateSetting(capability, device[capability.field]);
      if (value !== undefined) next = writeSceneControl(device.kind, next, capability.field, value);
    }
    next = synchronizeDemoLightAppearance(device, previous, next);
    if (next !== previous) {
      if (deviceStates === snapshot.deviceStates) deviceStates = { ...deviceStates };
      deviceStates[mapping.sceneId] = next;
    }
  }
  return deviceStates === snapshot.deviceStates ? snapshot : { ...snapshot, deviceStates };
}

/** Apply a validated catalog value to its allowlisted dashboard control field. */
function patchControl(device: Device, field: SharedControlField, value: SettingValue): Device {
  // The original light screen represents a cleared effect by an absent value.
  if (field === 'lightEffect' && value === 'none') return device.lightEffect === undefined ? device : { ...device, lightEffect: undefined };
  // The explicit key list prevents identity/URL writes; catalog validation supplies
  // the matching primitive or enum for every listed field.
  return device[field] === value ? device : { ...device, [field]: value };
}

/** Keep mutable store callers' array type while also accepting readonly audit snapshots. */
export function projectSimulationToDemo(
  snapshot: SimulationSnapshot, previousSnapshot: SimulationSnapshot, devices: Device[],
): Device[];
export function projectSimulationToDemo(
  snapshot: SimulationSnapshot, previousSnapshot: SimulationSnapshot, devices: readonly Device[],
): readonly Device[];
/**
 * Project only controls changed by the scene, preserving every unrelated device field.
 * Comparing snapshots prevents untouched scene defaults from overwriting dashboard edits.
 */
export function projectSimulationToDemo(
  snapshot: SimulationSnapshot,
  previousSnapshot: SimulationSnapshot,
  devices: readonly Device[],
): readonly Device[] {
  let result: Device[] | undefined;
  devices.forEach((device, index) => {
    const mapping = DEMO_DEVICE_MAPPINGS.find((candidate) => candidate.demoId === device.id);
    if (!mapping || mapping.kind !== device.kind) return;
    const definition = getDevice(mapping.sceneId);
    const state = snapshot.deviceStates[mapping.sceneId];
    const previous = previousSnapshot.deviceStates[mapping.sceneId];
    if (definition?.kind !== mapping.kind || !state || !previous || state === previous) return;
    let next = device;
    if (!isMonitor(device.kind) && device.kind !== "camera" && !isPositionDevice(definition)
      && typeof state.on === "boolean" && state.on !== previous.on && state.on !== device.isOn) {
      next = { ...next, isOn: state.on };
    }
    for (const capability of getCapabilities(definition.kind)) {
      if (!("field" in capability) || !isSharedControl(capability.field)) continue;
      const value = validateSetting(capability, readDeviceSetting(definition, state, capability.field));
      const oldValue = validateSetting(capability, readDeviceSetting(definition, previous, capability.field));
      if (value === undefined || value === oldValue) continue;
      next = patchControl(next, capability.field, value);
      if (capability.field === "openPercent" && typeof value === "number" && next.isOn !== (value > 0)) {
        next = { ...next, isOn: value > 0 };
      }
    }
    if (next !== device) {
      result ??= devices.slice();
      result[index] = next;
    }
  });
  return result ?? devices;
}
