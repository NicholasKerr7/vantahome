import { applyFireSetting } from '../../../packages/home-scene/src/fireSafetySimulation';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { Device } from '../../store/useHomeStore';

const FIRE_SAMPLE_FIELDS = ['smokeDetected', 'coDetected', 'smokeSilenced'] as const;
type FireSampleField = typeof FIRE_SAMPLE_FIELDS[number];

/** Treat absent sample flags as clear defaults, but reject malformed explicitly stored values. */
function sampleFlag(state: DeviceState, field: FireSampleField): boolean | undefined {
  const value = state.settings?.[field];
  return value === undefined ? false : typeof value === 'boolean' ? value : undefined;
}

/**
 * Apply only witnessed native demo edits; hydration has no previous record and cannot overwrite a saved alarm.
 * Callers must enforce the known device mapping and unauthenticated local-demo scope.
 */
export function overlayFireDemoDevice(device: Device, state: DeviceState, previousDevice?: Device): DeviceState {
  if (device.kind !== 'smoke' || previousDevice?.kind !== 'smoke' || previousDevice.id !== device.id) return state;
  let next = state;
  for (const field of FIRE_SAMPLE_FIELDS) {
    const value = device[field];
    if (typeof value !== 'boolean' || value === previousDevice[field] || value === sampleFlag(next, field)) continue;
    next = applyFireSetting(next, field, value);
  }
  return next;
}

/**
 * Project changed local flags without copying latch authority, telemetry, or metadata.
 * Omit previous only for explicit demo hydration, when the saved simulation is authoritative.
 */
export function projectFireSimulationToDemo(device: Device, state: DeviceState, previous?: DeviceState): Device {
  if (device.kind !== 'smoke') return device;
  let next = device;
  for (const field of FIRE_SAMPLE_FIELDS) {
    const value = sampleFlag(state, field);
    if (value === undefined || (previous && value === sampleFlag(previous, field)) || next[field] === value) continue;
    next = { ...next, [field]: value };
  }
  return next;
}
