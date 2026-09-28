import type { SimulationControlClient } from '../three-d-home/simulationControlClient';
import type { HomeVoiceCommand } from './voiceCommandParser';

/** Send validated voice intent through the same local reducer client as touch controls. */
export function executeVoiceCommand(client: SimulationControlClient, command: HomeVoiceCommand): boolean {
  if (!client.getSnapshot().ready) return false;
  if (command.type === 'power') client.setPower(command.deviceIds, command.on);
  else for (const id of command.deviceIds) {
    if (command.type === 'position') client.setLevel(id, command.value);
    else client.setSetting(id, command.type === 'temperature' ? 'tempC' : 'brightness', command.value);
  }
  return true;
}
