import { simulationLoadFailureMessage, type SimulationSaveStatus } from './simulationPersistence';

/** Shared controls remain read-only until their current household state has been verified. */
export function isSharedSimulationPaused(status: SimulationSaveStatus): boolean {
  return status === 'connecting' || status === 'offline' || status === 'conflict';
}

/** Describe server confirmation separately from the phone's local save and physical device readings. */
export function simulationControlsStatus(status: SimulationSaveStatus, ready: boolean): string {
  const loadFailure = simulationLoadFailureMessage(status);
  if (loadFailure) return loadFailure;
  switch (status) {
    case 'connecting': return 'Verifying shared simulation…';
    case 'syncing': return 'Syncing simulated changes…';
    case 'shared': return 'Simulation · Synced with household';
    case 'offline': return 'Shared simulation offline · Controls paused';
    case 'conflict': return 'Shared settings changed · Reconnect before trying again';
    case 'disconnected': return 'Session changed. Close and reopen controls.';
    case 'error': return 'Could not save locally. Your changes are still in this session.';
    case 'saving': return 'Saving simulation…';
    default: return ready ? 'Simulation · Saved on this device' : 'Loading saved controls…';
  }
}

/** Provide one calm in-context notice; a healthy shared connection needs no permanent dashboard banner. */
export function sharedSimulationNotice(status: SimulationSaveStatus): string | null {
  switch (status) {
    case 'connecting': return 'Verifying the shared simulation. Controls will resume when connected.';
    case 'offline': return 'Shared simulation is offline. Last synced settings are shown; controls are paused.';
    case 'conflict': return 'Shared settings changed on another device. Reconnect to review the latest state before trying again.';
    default: return null;
  }
}
