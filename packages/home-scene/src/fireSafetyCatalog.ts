import type { DeviceCapability } from './deviceCapabilities';
import { FIRE_DEFAULTS, FIRE_RESET_VERSION_MAX, type FireCommand } from './fireSafetySimulation';

/** Keep alarm controls explicit about simulation and separate from real detector commands. */
function action(command: FireCommand, label: string): DeviceCapability {
  return { id: `smoke-${command}`, type: 'action', label, group: 'controls', patch: {}, operation: { type: 'fire', command } };
}

/** Validate stored boolean incident fields without exposing editable latch switches. */
function booleanField(field: string): DeviceCapability {
  return { id: `smoke-${field}`, type: 'toggle', field, label: '' };
}

export const fireCapabilities: { smoke: DeviceCapability[] } = {
  smoke: [
    action('test-alarm', 'Simulate smoke alarm'), action('simulate-co', 'Simulate CO alarm'),
    action('silence', 'Silence preview'), action('acknowledge', 'Acknowledge incident'),
    action('clear-alarm', 'Clear simulated sources'), action('reset', 'Reset clear incident'),
    { id: 'smoke-fireIncidentActive', type: 'stat', field: 'fireIncidentActive', label: 'Incident latched', group: 'status' },
    { id: 'smoke-fireIncidentAcknowledged', type: 'stat', field: 'fireIncidentAcknowledged', label: 'Incident acknowledged', group: 'status' },
  ],
};

export const fireDefaults = { smoke: FIRE_DEFAULTS };
export const fireStoredFields: { smoke: DeviceCapability[] } = {
  smoke: [
    ...['smokeDetected', 'coDetected', 'smokeSilenced', 'fireIncidentActive', 'fireIncidentAcknowledged'].map(booleanField),
    { id: 'smoke-fireResetVersion', type: 'range', field: 'fireResetVersion', label: '', min: 0, max: FIRE_RESET_VERSION_MAX, step: 1 },
  ],
};
