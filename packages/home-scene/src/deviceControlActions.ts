import { getDevice, isPositionDevice, type DeviceDefinition, type DeviceId } from './data';
import { getCapabilities, isMonitor, readDeviceSetting, validateSetting, validateStoredSetting, type DeviceActionOperation } from './deviceCapabilities';
import type { DeviceState, SettingValue } from './simulationTypes';

/** Keep all scene inputs finite and within the supported percentage range. */
export function clampLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

/** Derive opening state from position so gates and blinds cannot report contradictory states. */
export function createPositionState(level: number): DeviceState {
  const position = clampLevel(level);
  return { on: position > 0, level: position };
}

/** Clear an active light effect when the user explicitly sets a manual light value. */
function clearLightEffect(current: DeviceState): DeviceState {
  if (!current.settings?.lightEffect || current.settings.lightEffect === 'none') return current;
  return { ...current, settings: { ...current.settings, lightEffect: 'none' } };
}

/** A later manual control dismisses an old action outcome rather than showing stale feedback. */
function clearActionFeedback(current: DeviceState): DeviceState {
  if (!current.settings?.lastAction) return current;
  const settings = { ...current.settings };
  delete settings.lastAction;
  const next: DeviceState = { ...current, settings };
  if (!Object.keys(settings).length) delete next.settings;
  return next;
}

/** Apply percentage changes without losing remembered power, opening, or temperature semantics. */
export function setDeviceLevelState(id: DeviceId, current: DeviceState, level: number): DeviceState {
  const device = getDevice(id);
  if (!device) return current;
  const manual = clearActionFeedback(current);
  const source = device.kind === 'light' ? clearLightEffect(manual) : manual;
  const next = isPositionDevice(device) ? { ...source, ...createPositionState(level) } : { ...source, level: clampLevel(level) };
  if (device.kind === 'ac' && next.settings?.tempC !== undefined) next.settings = { ...next.settings, tempC: 26 - Math.round(next.level * 0.08) };
  return next;
}

/** Validate a setting and update only local state; this reducer has no device transport. */
export function applyDeviceSetting(id: DeviceId, current: DeviceState, field: string, input: SettingValue): DeviceState {
  const device = getDevice(id);
  if (!device) return current;
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  if (!capability) return current;
  const value = validateSetting(capability, input);
  if (value === undefined) return current;
  current = clearActionFeedback(current);
  if (field === 'openPercent') return { ...current, ...createPositionState(Number(value)) };
  if ((device.kind === 'light' && field === 'brightness') || (device.kind === 'fan' && field === 'speed')) return setDeviceLevelState(id, current, Number(value));
  if (field === 'isOn') return { ...current, on: Boolean(value) };
  const next = { ...current, settings: { ...current.settings, [field]: value } };
  if (field === 'armed') next.on = Boolean(value);
  if (device.kind === 'ac' && field === 'tempC') next.level = clampLevel((26 - Number(value)) / 0.08);
  if (device.kind === 'light' && (field === 'color' || field === 'colorTempK')) {
    next.settings.lightColorMode = field === 'color' ? 'color' : 'temperature';
    next.settings.lightEffect = 'none';
  }
  // Pressure thresholds must remain ordered, matching the original water controls.
  if (device.kind === 'water' && field === 'waterPressureLowPsi' && Number(value) >= Number(readDeviceSetting(device, current, 'waterPressureHighPsi'))) next.settings.waterPressureHighPsi = Math.min(100, Number(value) + 10);
  if (device.kind === 'water' && field === 'waterPressureHighPsi' && Number(value) <= Number(readDeviceSetting(device, current, 'waterPressureLowPsi'))) next.settings.waterPressureLowPsi = Math.max(20, Number(value) - 10);
  return next;
}

/** Resolve a primary action through device semantics rather than a fake sensor power switch. */
export function toggleDeviceState(id: DeviceId, current: DeviceState): DeviceState {
  const device = getDevice(id);
  if (!device) return current;
  current = clearActionFeedback(current);
  if (isMonitor(device.kind)) return { ...current, on: true, settings: { ...current.settings, sampleChecked: true } };
  if (device.kind === 'camera') return applyDeviceSetting(id, current, 'armed', !readDeviceSetting(device, current, 'armed'));
  if (isPositionDevice(device)) return { ...current, ...createPositionState(current.level > 0 ? 0 : 100) };
  const next = { ...current, on: !current.on };
  if (!next.on && (device.kind === 'tv' || device.kind === 'speaker') && current.settings?.playbackState === 'playing') next.settings = { ...current.settings, playbackState: 'paused' };
  if (device.kind === 'vacuum') next.settings = { ...current.settings, status: next.on ? 'cleaning' : 'docked' };
  if (device.kind === 'microwave' && next.on && Number(readDeviceSetting(device, current, 'timeRemainingSec')) === 0) next.settings = { ...current.settings, timeRemainingSec: 60 };
  return next;
}

/** Advance a local media preview without opening a stream, launching an app, or playing audio. */
function applyMediaOperation(device: DeviceDefinition, current: DeviceState, command: Extract<DeviceActionOperation, { type: 'media' }>['command']): DeviceState {
  const settings = { ...current.settings };
  const position = Number(readDeviceSetting(device, current, 'playbackPositionSec'));
  const track = Number(readDeviceSetting(device, current, 'trackIndex'));
  if (command === 'play-pause') settings.playbackState = current.on && readDeviceSetting(device, current, 'playbackState') === 'playing' ? 'paused' : 'playing';
  if (command === 'rewind' || command === 'forward') settings.playbackPositionSec = Math.max(0, Math.min(3600, position + (command === 'forward' ? 10 : -10)));
  if (command === 'previous' || command === 'next') {
    settings.trackIndex = Math.max(1, Math.min(99, track + (command === 'next' ? 1 : -1)));
    settings.playbackPositionSec = 0;
  }
  return { ...current, on: true, settings };
}

/** A bounded 3×3 sample menu makes directional input visible without claiming real TV navigation. */
function applyNavigationOperation(device: DeviceDefinition, current: DeviceState, direction: Extract<DeviceActionOperation, { type: 'navigate' }>['direction']): DeviceState {
  const currentFocus = Number(readDeviceSetting(device, current, 'remoteFocus')) - 1;
  let row = Math.floor(currentFocus / 3);
  let column = currentFocus % 3;
  if (direction === 'up') row = Math.max(0, row - 1);
  if (direction === 'down') row = Math.min(2, row + 1);
  if (direction === 'left') column = Math.max(0, column - 1);
  if (direction === 'right') column = Math.min(2, column + 1);
  const settings = { ...current.settings, remoteFocus: row * 3 + column + 1, remoteAction: direction };
  if (direction === 'select') Object.assign(settings, { remoteSelection: currentFocus + 1 });
  if (direction === 'home') Object.assign(settings, { source: 'Home', remoteFocus: 5, remoteSelection: 0 });
  return { ...current, on: true, settings };
}

/** Execute only allowlisted action IDs, including bounded relative and preview operations. */
export function runDeviceActionState(id: DeviceId, current: DeviceState, actionId: string): DeviceState {
  const device = getDevice(id);
  if (!device) return current;
  const action = getCapabilities(device.kind).find((item) => item.id === actionId);
  if (action?.type !== 'action') return current;
  let next = current;
  for (const [field, value] of Object.entries(action.patch)) {
    if (field === 'isOn') next = { ...next, on: Boolean(value) };
    else {
      const controlled = applyDeviceSetting(id, next, field, value);
      if (controlled !== next) next = controlled;
      else if (validateStoredSetting(device.kind, field, value) !== undefined) next = { ...next, settings: { ...next.settings, [field]: value } };
    }
  }
  const operation = action.operation;
  if (operation?.type === 'media') next = applyMediaOperation(device, next, operation.command);
  if (operation?.type === 'navigate') next = applyNavigationOperation(device, next, operation.direction);
  if (operation?.type === 'increment') {
    next = applyDeviceSetting(id, next, operation.field, Number(readDeviceSetting(device, next, operation.field)) + operation.delta);
    next = operation.field === 'channel' ? { ...next, on: true, settings: { ...next.settings, source: 'Live TV' } } : { ...next, on: Number(next.settings?.timeRemainingSec) > 0 };
  }
  return { ...next, settings: { ...next.settings, lastAction: actionId } };
}
