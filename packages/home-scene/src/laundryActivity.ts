import type { DeviceState } from './simulationTypes';

export type LaundryKind = 'washer' | 'dryer';
export type LaundryActivity = 'running' | 'paused' | 'stopped' | 'idle';

/** Limit laundry-specific state rules to the two independent machine kinds. */
export function isLaundryKind(kind: string): kind is LaundryKind {
  return kind === 'washer' || kind === 'dryer';
}

/** Power wins over stale activity; older explicit pause commands retain their accepted meaning. */
export function readLaundryActivity(kind: LaundryKind, state: DeviceState): LaundryActivity {
  if (state.on) return 'running';
  const activity = state.settings?.laundryActivity;
  if (activity === 'paused' || activity === 'stopped') return activity;
  if (activity === undefined && state.settings?.lastAction === `${kind}-pause`) return 'paused';
  return 'idle';
}

/** Describe only accepted simulation activity, without inferring phase, completion or real operation. */
export function laundryActivityLabel(kind: LaundryKind, state: DeviceState): string {
  const activity = readLaundryActivity(kind, state);
  if (activity === 'running') return kind === 'washer' ? 'Washing preview' : 'Drying preview';
  if (activity === 'paused') return 'Paused';
  return activity === 'stopped' ? 'Stopped' : 'Ready';
}
