import { getFireIncident } from '../../../packages/home-scene/src/fireSafetySimulation';
import { FIRE_PREVIEW_LIGHT_IDS } from '../../../packages/home-scene/src/safetySimulation';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { SimulationControlClient } from '../three-d-home/simulationControlClient';
import type { HomeVoiceCommand } from './voiceCommandParser';

export type VoiceCommandOutcome =
  | { status: 'reconnecting' }
  | { status: 'completed' }
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'scoped' }
  | { status: 'limited'; completedCount: number; requestedCount: number; fireHeldLightCount: number };

const firePreviewLightIds = new Set<string>(FIRE_PREVIEW_LIGHT_IDS);

/** Confirm the requested value after the shared reducer has enforced cross-device safety rules. */
function matchesCommand(state: DeviceState | undefined, command: HomeVoiceCommand): boolean {
  if (!state) return false;
  if (command.type === 'power') return state.on === command.on;
  if (command.type === 'temperature') return state.settings?.tempC === command.value;
  return state.level === command.value;
}

/** Gate closing takes foreground time; an accepted target is pending rather than completed or blocked. */
function isCommandPending(id: string, state: DeviceState | undefined, command: HomeVoiceCommand): boolean {
  return id === 'entry-gate' && command.type === 'position' && state?.settings?.gatePhase === 'closing'
    && state.settings.gateCloseTargetPercent === command.value;
}

/** Apply local intent and report its actual optimistic result without treating readiness as success. */
export function executeVoiceCommand(client: SimulationControlClient, command: HomeVoiceCommand): VoiceCommandOutcome {
  const snapshot = client.getSnapshot();
  if (!snapshot.ready) return { status: 'reconnecting' };
  const permittedIds = command.deviceIds.filter((id) => snapshot.access?.controllableDeviceIds.includes(id));
  if (!permittedIds.length) return { status: 'denied' };
  const limitedAccess = permittedIds.length !== command.deviceIds.length;
  command = { ...command, deviceIds: permittedIds };
  if (command.type === 'power') client.setPower(command.deviceIds, command.on);
  else for (const id of command.deviceIds) {
    if (command.type === 'position') client.setLevel(id, command.value);
    else client.setSetting(id, command.type === 'temperature' ? 'tempC' : 'brightness', command.value);
  }
  const { ready, state } = client.getSnapshot();
  if (!ready) return { status: 'reconnecting' };
  const unmatchedIds = command.deviceIds.filter((id) => !matchesCommand(state.deviceStates[id], command));
  if (!unmatchedIds.length) return { status: limitedAccess ? 'scoped' : 'completed' };
  if (unmatchedIds.every((id) => isCommandPending(id, state.deviceStates[id], command))) return { status: 'pending' };
  const fireHeldLightCount = getFireIncident(state.deviceStates).active
    ? unmatchedIds.filter((id) => firePreviewLightIds.has(id)).length : 0;
  return { status: 'limited', completedCount: command.deviceIds.length - unmatchedIds.length,
    requestedCount: command.deviceIds.length, fireHeldLightCount };
}
