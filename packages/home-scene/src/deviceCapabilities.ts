import { gateSafetySummary, readGateSetting } from './gateSafetySimulation';
import type { FireCommand } from './fireSafetySimulation';
import inventory from './device-capabilities.json';
import { gasActionFeedback, gasDeviceStatus, isGasDevice, readGasSetting, type GasCommand } from './gasSimulation';
import { supplementalCapabilities, supplementalDefaults, simulatedStatusFields, scheduleCapabilities } from './deviceControlCatalog';
import type { DeviceDefinition } from './data';
import type { DeviceState, SettingValue } from './simulationTypes';
import { configurationPageNote, describeCapabilitySupport } from './deviceCapabilitySupport';
import { readVacuumActivity, vacuumActivityLabel } from './vacuumActivity';
import { readSpeakerPlayback, speakerPlaybackStatus } from './speakerPlayback';
import { readFanActivity } from './fanActivity';
import { isLaundryKind, laundryActivityLabel, readLaundryActivity } from './laundryActivity';
import { dishwasherActivityLabel, readDishwasherActivity } from './dishwasherActivity';
import { isOpeningDeviceKind, openingPositionStatus, readOpeningPosition } from './openingPosition';
export type { SettingValue } from './simulationTypes';

export const DEVICE_KINDS = ['ac', 'light', 'tv', 'coffee', 'fridge', 'gate', 'garage', 'fan', 'door', 'vacuum', 'camera', 'window', 'stove', 'washer', 'dryer', 'dishwasher', 'microwave', 'energy', 'water', 'water-heater', 'air', 'sprinkler', 'speaker', 'smoke', 'blinds', 'generator', 'battery', 'solar', 'gas-meter', 'gas-leak'] as const;
export type DeviceKind = typeof DEVICE_KINDS[number];
export type ControlGroup = 'controls' | 'modes' | 'schedule' | 'status';
export type DeviceActionOperation =
  | { type: 'increment'; field: 'channel' | 'timeRemainingSec' | 'volume' | 'tempC' | 'freezerTempC' | 'coffeeCupCount' | 'acFanSpeed' | 'openPercent' | 'brightness' | 'waterBudgetL' | 'vacuumSuction' | 'speed' | 'durationMin'; delta: number }
  | { type: 'media'; command: 'play-pause' | 'rewind' | 'forward' | 'previous' | 'next' }
  | { type: 'gas'; command: GasCommand }
  | { type: 'fire'; command: FireCommand }
  | { type: 'navigate'; direction: 'up' | 'down' | 'left' | 'right' | 'select' | 'home' | 'back' };
interface CapabilityBase { id: string; label: string; group?: ControlGroup; configurationOnly?: boolean }
export type DeviceCapability = CapabilityBase & (
  | { type: 'range'; field: string; min: number; max: number; step?: number; unit?: string }
  | { type: 'enum'; field: string; options: { label: string; value: string | number }[] }
  | { type: 'toggle'; field: string; onLabel?: string; offLabel?: string }
  | { type: 'stat'; field: string; unit?: string }
  | { type: 'action'; patch: Record<string, SettingValue>; operation?: DeviceActionOperation }
);
const originalProfiles = inventory.profiles as Partial<Record<DeviceKind, DeviceCapability[]>>;
// Custom original screens supplement the exported schema; matching IDs intentionally replace it.
const profiles = Object.fromEntries(DEVICE_KINDS.map((kind) => {
  const controls = new Map((originalProfiles[kind] ?? []).map((capability) => [capability.id, capability]));
  for (const capability of supplementalCapabilities[kind] ?? []) controls.set(capability.id, capability);
  for (const capability of scheduleCapabilities(kind)) controls.set(capability.id, capability);
  return [kind, [...controls.values()].map((capability) => describeCapabilitySupport(kind, capability))];
})) as Record<DeviceKind, DeviceCapability[]>;
const defaults: Partial<Record<DeviceKind, Record<string, SettingValue>>> = inventory.defaults;
export const LEGACY_DEVICE_IDS = ['living-light', 'living-fan', 'family-tv', 'laundry-washer', 'master-ac', 'master-blinds', 'entry-gate'] as const;

/** Resolve supported controls from the audited repository's declarative profiles. */
export function getCapabilities(kind: DeviceKind): readonly DeviceCapability[] { return profiles[kind]; }

export interface DeviceControlPage {
  id: string;
  label: string;
  group: ControlGroup;
  capabilities: readonly DeviceCapability[];
  compact: boolean;
  note?: string;
}

/** Classify existing exported fields without changing their stable control identifiers. */
function controlGroup(capability: DeviceCapability): ControlGroup {
  if (capability.group) return capability.group;
  if (capability.type === 'stat') return 'status';
  if ('field' in capability && /schedule|timer|autoOff|vacationDays|autoBrew/i.test(capability.field)) return 'schedule';
  if (capability.type === 'enum' || capability.type === 'toggle') return 'modes';
  return 'controls';
}

/** Paginate every control once, keeping compact actions separate from touch-sized fields. */
export function getControlPages(kindOrDevice: DeviceKind | Pick<DeviceDefinition, 'kind'>, options: { maxControlsPerPage?: 1 | 2 | 3; maxActionsPerPage?: 1 | 2 | 3 | 4 | 6 } = {}): readonly DeviceControlPage[] {
  const kind = typeof kindOrDevice === 'string' ? kindOrDevice : kindOrDevice.kind;
  const pages: DeviceControlPage[] = [];
  const labels: Record<ControlGroup, string> = { controls: 'Controls', modes: 'Modes', schedule: 'Schedule', status: 'Status' };
  for (const group of ['controls', 'modes', 'schedule', 'status'] as const) {
    const fields = getCapabilities(kind).filter((item) => controlGroup(item) === group);
    const batches: DeviceCapability[][] = [];
    for (const capability of fields) {
      const last = batches[batches.length - 1];
      const compact = capability.type === 'action';
      const limit = compact ? options.maxActionsPerPage ?? 6 : options.maxControlsPerPage ?? 3;
      if (!last || (last[0].type === 'action') !== compact || Boolean(last[0].configurationOnly) !== Boolean(capability.configurationOnly) || last.length >= limit) batches.push([capability]);
      else last.push(capability);
    }
    batches.forEach((capabilities, index) => pages.push({ id: `${group}-${index + 1}`, label: `${labels[group]}${batches.length > 1 ? ` ${index + 1}` : ''}`, group, capabilities, compact: capabilities[0].type === 'action', note: configurationPageNote(kind, capabilities) }));
  }
  return pages;
}

/** Monitoring hardware presents readings and a sample check instead of fake power. */
export function isMonitor(kind: DeviceKind): boolean { return ['energy', 'water', 'air', 'smoke', 'solar', 'gas-meter', 'gas-leak'].includes(kind); }

/** Preserve the seven original animation levels while offering richer settings. */
export function hasLegacyLevel(device: DeviceDefinition): boolean { return (LEGACY_DEVICE_IDS as readonly string[]).includes(device.id); }

/** Read a validated setting, falling back to an appropriate reproducible demo value. */
export function readDeviceSetting(device: DeviceDefinition, state: DeviceState, field: string): SettingValue {
  if (device.kind === 'gate') {
    const gateValue = readGateSetting(state, field);
    if (gateValue !== undefined) return gateValue;
  }
  if (isGasDevice(device.kind)) {
    const gasValue = readGasSetting(device.kind, state, field);
    if (gasValue !== undefined) return gasValue;
  }
  if (field === 'isOn') return state.on;
  if (isLaundryKind(device.kind) && field === 'laundryActivity') return readLaundryActivity(device.kind, state);
  if (device.kind === 'dishwasher' && field === 'dishwasherActivity') return readDishwasherActivity(state);
  // The advanced Activity sample must agree with power-authoritative quick and full controls.
  if (device.kind === 'vacuum' && field === 'status') return readVacuumActivity(state);
  if (device.kind === 'speaker' && field === 'playbackState') return readSpeakerPlayback(state);
  if (device.kind === 'speaker' && field === 'volume') {
    // Relative steps and every status surface recover from malformed levels using the same schema.
    const capability = profiles.speaker.find((item) => 'field' in item && item.field === field);
    return (capability && validateSetting(capability, state.settings?.volume)) ?? defaults.speaker?.volume ?? 0;
  }
  if (field === 'armed' && device.kind === 'camera') return state.on;
  if (field === 'powerW' && device.kind === 'generator') return state.on ? Math.round(state.level * 60) : 0;
  if (field === 'chargePercent' && device.kind === 'battery') return state.level;
  if (field === 'speed' && device.kind === 'fan') return readFanActivity(state).speed;
  if (field === 'openPercent' && isOpeningDeviceKind(device.kind)) return readOpeningPosition(state) ?? Number.NaN;
  if (field === 'openPercent' || (field === 'brightness' && device.kind === 'light')) return state.level;
  if (field === 'tempC' && device.kind === 'ac' && state.settings?.[field] === undefined) return 26 - Math.round(state.level * 0.08);
  if (field === 'playbackState' && !state.on && state.settings?.playbackState === 'playing') return 'paused';
  if (state.settings?.[field] !== undefined) return state.settings[field];
  const capability = profiles[device.kind].find((item) => 'field' in item && item.field === field);
  const seed = supplementalDefaults[device.kind]?.[field] ?? defaults[device.kind]?.[field];
  if (capability?.type === 'enum') return capability.options.some((option) => option.value === seed) ? seed! : capability.options[0].value;
  if (seed !== undefined) return seed;
  if (capability?.type === 'range') return capability.min;
  if (capability?.type === 'toggle') return false;
  return capability?.type === 'stat' && capability.unit ? 0 : 'Ready';
}

/** Validate stored local outcomes as strictly as controls, without making telemetry editable. */
export function validateStoredSetting(kind: DeviceKind, field: string, input: unknown): SettingValue | undefined {
  if (field === 'lastAction') return typeof input === 'string' && profiles[kind].some((item) => item.type === 'action' && item.id === input) ? input : undefined;
  const capability = profiles[kind].find((item) => 'field' in item && item.field === field);
  const value = capability && validateSetting(capability, input);
  if (value !== undefined) return value;
  const simulated = simulatedStatusFields[kind]?.find((item) => 'field' in item && item.field === field);
  if (simulated) return validateSetting(simulated, input);
  if (field === 'sampleChecked' && input === true && isMonitor(kind)) return true;
  const action = profiles[kind].find((item) => item.type === 'action' && field !== 'isOn' && Object.hasOwn(item.patch, field) && item.patch[field] === input);
  return action ? input as SettingValue : undefined;
}

/** Summarize the last local action immediately, without claiming hardware, media, or automation ran. */
export function deviceActionFeedback(device: DeviceDefinition, state: DeviceState): string | null {
  if (device.kind === 'gate') return gateSafetySummary(state);
  if (device.kind === 'smoke' && state.settings?.fireIncidentActive) return state.settings.fireIncidentAcknowledged ? 'Emergency simulation · acknowledged' : 'Emergency simulation · review incident';
  if (isGasDevice(device.kind)) return state.settings?.gasLastEvent && state.settings.gasLastEvent !== 'ready' ? gasActionFeedback(device.kind, state) : null;
  const action = profiles[device.kind].find((item) => item.type === 'action' && item.id === state.settings?.lastAction);
  if (action?.type !== 'action') return null;
  const operation = action.operation;
  if (isLaundryKind(device.kind)) return laundryActivityLabel(device.kind, state);
  if (device.kind === 'dishwasher') return dishwasherActivityLabel(state);
  if (isOpeningDeviceKind(device.kind)) {
    const position = readOpeningPosition(state);
    return position === null ? 'Position unavailable' : position === 0 ? 'Closed in preview' : `${position}% open in preview`;
  }
  if (device.kind === 'fan') return readFanActivity(state).status;
  // A remembered transport command cannot override current power, mute or playback state.
  if (device.kind === 'speaker') {
    const status = deviceStatus(device, state);
    if (operation?.type === 'increment' && operation.field === 'volume') return `${status} · Volume ${readDeviceSetting(device, state, 'volume')}%`;
    return status;
  }
  if (operation?.type === 'navigate') {
    if (operation.direction === 'home') return 'Preview home';
    if (operation.direction === 'back') return 'Preview back';
    return operation.direction === 'select' ? `Preview tile ${readDeviceSetting(device, state, 'remoteSelection')} selected` : `Preview focus · tile ${readDeviceSetting(device, state, 'remoteFocus')}`;
  }
  if (operation?.type === 'media') {
    if (operation.command === 'play-pause') return `${readDeviceSetting(device, state, 'playbackState')} · local preview`;
    if (operation.command === 'previous' || operation.command === 'next') return `Preview track ${readDeviceSetting(device, state, 'trackIndex')}`;
    return `Preview position ${readDeviceSetting(device, state, 'playbackPositionSec')}s`;
  }
  if (device.kind === 'tv' && operation?.type === 'increment' && operation.field === 'volume') return `Preview volume ${readDeviceSetting(device, state, 'volume')}%`;
  if (device.kind === 'tv' && (operation?.type === 'increment' || 'source' in action.patch)) return operation ? `Preview channel ${readDeviceSetting(device, state, 'channel')} · Live TV` : `${readDeviceSetting(device, state, 'source')} · local preview`;
  if (device.kind === 'ac' && operation?.type === 'increment') return operation.field === 'tempC' ? `Target ${readDeviceSetting(device, state, 'tempC')}°C · simulation` : `Fan ${readDeviceSetting(device, state, 'acFanSpeed')}% · simulation`;
  if (device.kind === 'water-heater' && operation?.type === 'increment') return `Target ${readDeviceSetting(device, state, 'tempC')}°C · saved preference`;
  if (device.kind === 'water' && operation?.type === 'increment') return `Usage budget ${readDeviceSetting(device, state, 'waterBudgetL')} L · saved preference`;
  if (device.kind === 'sprinkler' && operation?.type === 'increment') return `Duration ${readDeviceSetting(device, state, 'durationMin')} min · saved preference`;
  if (device.kind === 'coffee') return operation?.type === 'increment' ? `Cups ${readDeviceSetting(device, state, 'coffeeCupCount')} · saved preference` : state.on ? 'Brewing preview' : 'Idle · recipe remembered';
  if (device.kind === 'fridge' && operation?.type === 'increment') return `${operation.field === 'freezerTempC' ? 'Freezer' : 'Fridge'} target ${readDeviceSetting(device, state, operation.field)}°C · saved preference`;
  if (device.kind === 'vacuum') return operation?.type === 'increment'
    ? `${vacuumActivityLabel(state)} · Suction ${readDeviceSetting(device, state, 'vacuumSuction')}% · saved preference`
    : vacuumActivityLabel(state);
  if (device.kind === 'camera') return String(readDeviceSetting(device, state, 'cameraPreviewEvent'));
  if (device.kind === 'light') return `${state.on ? '' : 'Off · '}${action.label} · ${state.level}%`;
  if ('openPercent' in action.patch || (operation?.type === 'increment' && operation.field === 'openPercent')) return state.level === 0 ? 'Closed in preview' : `${state.level}% open in preview`;
  if (operation?.type === 'increment') return `Preview time ${readDeviceSetting(device, state, operation.field)}s`;
  return `${action.label} · simulation`;
}

/** Accept only finite, schema-bounded controls; telemetry is deliberately read-only. */
export function validateSetting(capability: DeviceCapability, value: unknown): SettingValue | undefined {
  if (capability.type === 'range' && typeof value === 'number' && Number.isFinite(value)) {
    const step = capability.step ?? 1;
    // Decimal sample units need stable rounding before exact bridge validation.
    const rounded = Number((Math.round((value - capability.min) / step) * step + capability.min).toFixed(8));
    return Math.min(capability.max, Math.max(capability.min, rounded));
  }
  if (capability.type === 'toggle' && typeof value === 'boolean') return value;
  if (capability.type === 'enum' && capability.options.some((option) => option.value === value)) return value as string | number;
  return undefined;
}

/** Render a catalog value with explicit units and a readable boolean status. */
export function formatCapabilityValue(capability: DeviceCapability, value: SettingValue): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if ('unit' in capability && capability.unit) return `${value}${capability.unit === '%' || capability.unit === '°C' ? '' : ' '}${capability.unit}`;
  if (capability.type === 'enum') return capability.options.find((option) => option.value === value)?.label ?? String(value);
  return String(value);
}

/** Give every quick card one meaningful action without treating sensors as switches. */
export function quickActionLabel(device: DeviceDefinition, state: DeviceState): string {
  if (isMonitor(device.kind)) return device.kind === 'smoke' || device.kind === 'gas-leak' ? 'Run self-test' : 'Refresh sample';
  if (device.kind === 'camera') return readDeviceSetting(device, state, 'armed') ? 'Disarm' : 'Arm';
  if (['gate', 'garage', 'blinds', 'window', 'door'].includes(device.kind)) return `${state.level > 0 ? 'Close' : 'Open'} ${device.kind === 'garage' ? 'shutter' : device.kind}`;
  if (isLaundryKind(device.kind)) return state.on ? 'Pause' : readLaundryActivity(device.kind, state) === 'paused' ? 'Resume' : 'Start';
  if (device.kind === 'dishwasher') return state.on ? 'Pause' : readDishwasherActivity(state) === 'paused' ? 'Resume' : 'Start';
  if (device.kind === 'microwave') return state.on ? 'Pause' : 'Start';
  if (device.kind === 'coffee') return state.on ? 'Stop brewing' : 'Brew now';
  if (device.kind === 'vacuum') return state.on ? 'Dock' : 'Start cleaning';
  if (device.kind === 'generator') return state.on ? 'Stop generator' : 'Start generator';
  return state.on ? 'Turn off' : 'Turn on';
}

/** Describe state consistently in quick cards, room lists and the full inspector. */
export function deviceStatus(device: DeviceDefinition, state: DeviceState): string {
  if (device.kind === 'gate') return gateSafetySummary(state);
  if (device.kind === 'smoke' && (state.settings?.fireIncidentActive || state.settings?.smokeDetected || state.settings?.coDetected)) return state.settings?.smokeDetected || state.settings?.coDetected ? 'Alarm simulation active' : 'Simulation clear · reset pending';
  if (isGasDevice(device.kind)) return gasDeviceStatus(device.kind, state);
  if (device.kind === 'camera') return readDeviceSetting(device, state, 'armed') ? 'Armed' : 'Disarmed';
  if (isMonitor(device.kind)) return state.settings?.sampleChecked ? 'Sample checked' : 'Monitoring sample';
  if (device.kind === 'vacuum') return vacuumActivityLabel(state);
  if (device.kind === 'fan') return readFanActivity(state).status;
  if (isLaundryKind(device.kind)) return laundryActivityLabel(device.kind, state);
  if (device.kind === 'dishwasher') return dishwasherActivityLabel(state);
  if (isOpeningDeviceKind(device.kind)) return openingPositionStatus(state);
  if (device.kind === 'speaker') {
    return speakerPlaybackStatus(state, Number(readDeviceSetting(device, state, 'volume')), readDeviceSetting(device, state, 'muted') === true);
  }
  if (['gate', 'garage', 'window', 'blinds', 'door'].includes(device.kind)) return state.level === 0 ? 'Closed' : state.level === 100 ? 'Fully open' : `${state.level}% open`;
  if (['microwave', 'coffee', 'generator'].includes(device.kind)) return state.on ? 'Running' : 'Idle';
  return state.on ? 'On' : 'Off';
}
