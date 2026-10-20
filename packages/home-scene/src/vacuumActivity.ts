import type { DeviceState } from './simulationTypes';

export type VacuumActivity = 'cleaning' | 'paused' | 'docked' | 'idle';
const ACTIVITY_LABELS: Record<VacuumActivity, string> = { cleaning: 'Cleaning preview', paused: 'Paused', docked: 'Docked', idle: 'Idle' };

/** Canonical power wins over stale activity; sparse saved vacuums retain the catalog's docked default. */
export function readVacuumActivity(state: DeviceState): VacuumActivity {
  if (state.on) return 'cleaning';
  const status = state.settings?.status ?? 'docked';
  return status === 'paused' || status === 'docked' ? status : 'idle';
}

/** Share accepted activity wording across hotspots, library cards and both consoles. */
export function vacuumActivityLabel(state: DeviceState): string {
  return ACTIVITY_LABELS[readVacuumActivity(state)];
}
