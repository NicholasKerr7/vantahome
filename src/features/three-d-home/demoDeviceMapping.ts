import { overlayFireDemoDevice, projectFireSimulationToDemo } from './fireDemoMapping';
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
import { synchronizeSafetySimulation } from '../../../packages/home-scene/src/safetySimulation';
import { overlayGasDemoDevice, projectGasSimulationToDemo } from './gasDemoMapping';
import { HOST_CONTROL_FIELDS, LEGACY_MODEL_DEVICE_ALIASES } from './modelHomeCatalog';

/** Explicit aliases retained only for migration of older local demonstrations. */
export const DEMO_DEVICE_MAPPINGS = LEGACY_MODEL_DEVICE_ALIASES;

/** Resolve canonical model IDs first, retaining explicit aliases only for older demo caches. */
export function resolveDemoDeviceMapping(device: Pick<Device, 'id' | 'kind'>): { demoId: string; sceneId: string; kind: DeviceKind } | undefined {
  const definition = getDevice(device.id);
  if (definition?.kind === device.kind) return { demoId: device.id, sceneId: definition.id, kind: device.kind };
  return DEMO_DEVICE_MAPPINGS.find((entry) => entry.demoId === device.id && entry.kind === device.kind);
}

// Only common controls can cross the boundary. Identity, media URLs, observations,
// schedules, telemetry and account data are deliberately absent from this list.
const SHARED_CONTROL_FIELDS = HOST_CONTROL_FIELDS;
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
  const definition = getDevice(resolveDemoDeviceMapping(device)?.sceneId ?? null);
  if (!definition) return state;
  let next = state;
  if (device.lightEffect === undefined && next.settings?.lightEffect && next.settings.lightEffect !== 'none') {
    next = { ...next, settings: { ...next.settings, lightEffect: 'none' } };
  }
  const color = getCapabilities('light').find((capability) => 'field' in capability && capability.field === 'color');
  const temperature = getCapabilities('light').find((capability) => 'field' in capability && capability.field === 'colorTempK');
  const validColor = color && validateSetting(color, device.color);
  const validTemperature = temperature && validateSetting(temperature, device.colorTempK);
  // Materialized host defaults are not edits: keep a saved white-light mode when
  // its optional color field was never written by the scene.
  const colorChanged = validColor !== undefined && readDeviceSetting(definition, previous, 'color') !== validColor;
  const temperatureChanged = validTemperature !== undefined && readDeviceSetting(definition, previous, 'colorTempK') !== validTemperature;
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
  previousDevices?: readonly Device[],
): SimulationSnapshot {
  let deviceStates = snapshot.deviceStates;
  for (const device of devices) {
    const mapping = resolveDemoDeviceMapping(device);
    if (!mapping) continue;
    const definition = getDevice(mapping.sceneId);
    const previous = deviceStates[mapping.sceneId];
    if (!device || device.kind !== mapping.kind || definition?.kind !== mapping.kind || !previous) continue;
    let next = previous;
    const before = previousDevices?.find((candidate) => candidate.id === device.id && candidate.kind === device.kind);
    // A routine's plain power command must move positional equipment. An explicit
    // position command takes precedence, and hydration never invents a power edit.
    const positionPowerChanged = isPositionDevice(definition) && before
      && device.isOn !== before.isOn && device.openPercent === before.openPercent;
    if (positionPowerChanged) next = writeSceneControl(device.kind, next, 'openPercent', device.isOn ? 100 : 0);
    // Camera `on` means armed in the scene; its dashboard power remains independent.
    if (!isMonitor(device.kind) && device.kind !== "camera" && !isPositionDevice(definition)
      && typeof device.isOn === "boolean" && previous.on !== device.isOn) {
      next = { ...next, on: device.isOn };
    }
    for (const capability of getCapabilities(definition.kind)) {
      if (!("field" in capability) || !isSharedControl(capability.field)) continue;
      if (positionPowerChanged && capability.field === 'openPercent') continue;
      // A restored safety-aware gate owns its position; stale dashboard cache cannot restart it.
      if (device.kind === 'gate' && !before && previous.settings?.gatePhase !== undefined && capability.field === 'openPercent') continue;
      const value = validateSetting(capability, device[capability.field]);
      if (value !== undefined) next = writeSceneControl(device.kind, next, capability.field, value);
    }
    next = synchronizeDemoLightAppearance(device, previous, next);
    next = overlayGasDemoDevice(device, next);
    next = overlayFireDemoDevice(device, next, before);
    if (next !== previous) {
      if (deviceStates === snapshot.deviceStates) deviceStates = { ...deviceStates };
      deviceStates[mapping.sceneId] = next;
    }
  }
  deviceStates = synchronizeSafetySimulation(deviceStates, snapshot.deviceStates);
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
    const mapping = resolveDemoDeviceMapping(device);
    if (!mapping || mapping.kind !== device.kind) return;
    const definition = getDevice(mapping.sceneId);
    const state = snapshot.deviceStates[mapping.sceneId];
    const previous = previousSnapshot.deviceStates[mapping.sceneId];
    if (definition?.kind !== mapping.kind || !state || !previous || state === previous) return;
    let next = device;
    if (isPositionDevice(definition) && (next.openPercent !== state.level || next.isOn !== state.on)) {
      next = { ...next, openPercent: state.level, isOn: state.on };
    }
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
    next = projectGasSimulationToDemo(next, state, previous);
    next = projectFireSimulationToDemo(next, state, previous);
    if (next !== device) {
      result ??= devices.slice();
      result[index] = next;
    }
  });
  return result ?? devices;
}
