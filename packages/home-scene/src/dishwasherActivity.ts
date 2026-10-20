import type { DeviceState } from './simulationTypes';

export type DishwasherActivity = 'idle' | 'running' | 'paused' | 'stopped';

/** Power remains authoritative; older explicit pause commands retain their accepted meaning. */
export function readDishwasherActivity(state: DeviceState): DishwasherActivity {
  if (state.on) return 'running';
  const activity = state.settings?.dishwasherActivity;
  if (activity === 'paused' || activity === 'stopped') return activity;
  if (activity === undefined && state.settings?.lastAction === 'dishwasher-pause') return 'paused';
  return 'idle';
}

/** Describe accepted preview activity without inferring a phase, finish time or physical cycle. */
export function dishwasherActivityLabel(state: DeviceState): string {
  const activity = readDishwasherActivity(state);
  if (activity === 'running') return 'Washing preview';
  if (activity === 'paused') return 'Paused';
  return activity === 'stopped' ? 'Stopped' : 'Ready';
}
