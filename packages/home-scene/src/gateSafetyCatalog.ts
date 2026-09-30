import type { DeviceCapability } from './deviceCapabilities';
import { GATE_EVENTS, GATE_PHASES, GATE_SAFETY_DEFAULTS } from './gateSafetySimulation';

/** Keep local scenario switches explicitly separate from sensor telemetry. */
function toggle(field: string, label: string): DeviceCapability {
  return { id: `gate-${field}`, type: 'toggle', field, label, group: 'modes' };
}

/** Reuse capability validation for bounded persisted simulation quantities. */
function range(field: string, label: string, min: number, max: number, step = 1): Extract<DeviceCapability, { type: 'range' }> {
  return { id: `gate-${field}`, type: 'range', field, label, min, max, step, group: 'controls' };
}

/** Store modeled phases/events as allowlisted primitives rather than arbitrary status text. */
function choice(field: string, values: readonly string[]): DeviceCapability {
  return { id: `gate-${field}`, type: 'enum', field, label: '', options: values.map((value) => ({ label: value, value })) };
}

export const gateSafetyCapabilities: DeviceCapability[] = [
  { id: 'gate-hold-open', type: 'action', label: 'Hold open', group: 'controls', patch: { gateHoldOpen: true } },
  { id: 'gate-release-hold', type: 'action', label: 'Release hold', group: 'controls', patch: { gateReleaseHold: true } },
  { id: 'gate-resume', type: 'action', label: 'Resume preview', group: 'controls', patch: { gateResume: true } },
  toggle('autoCloseEnabled', 'Preview auto-close'),
  { ...range('autoCloseDelaySec', 'Clear-zone delay', 5, 120), unit: 's' },
  toggle('gateVehiclePresent', 'Simulate vehicle present'),
  toggle('gateBeamBlocked', 'Simulate blocked safety beam'),
  toggle('gateSensorFault', 'Simulate safety-sensor fault'),
  { id: 'gate-gatePhase', type: 'stat', field: 'gatePhase', label: 'Preview phase', group: 'status' },
  { id: 'gate-gateCountdownSec', type: 'stat', field: 'gateCountdownSec', label: 'Clearance countdown', unit: 's', group: 'status' },
  { id: 'gate-gateHoldOpen', type: 'stat', field: 'gateHoldOpen', label: 'Manual hold', group: 'status' },
  { id: 'gate-gateEmergencyHold', type: 'stat', field: 'gateEmergencyHold', label: 'Emergency hold', group: 'status' },
];

export const gateSafetyStoredFields: DeviceCapability[] = [
  toggle('gateHoldOpen', ''), toggle('gateEmergencyActive', ''), toggle('gateEmergencyHold', ''),
  choice('gatePhase', GATE_PHASES), choice('gateLastEvent', GATE_EVENTS),
  range('gateCountdownSec', '', 0, 120, 0.001), range('gateCloseTargetPercent', '', 0, 100, 0.001),
];
export const gateSafetyDefaults = GATE_SAFETY_DEFAULTS;
