import type { VoiceCommandOutcome } from './executeVoiceCommand';

/** Describe the actual reducer result, including safety holds, without promising physical delivery. */
export function voiceCommandFeedback(outcome: VoiceCommandOutcome, description: string): string {
  if (outcome.status === 'reconnecting') return 'Controls are reconnecting. Close and reopen voice control.';
  if (outcome.status === 'denied') return 'Those controls are not available with your current access.';
  if (outcome.status === 'scoped') return 'Updated your permitted devices. Other controls remain restricted.';
  if (outcome.status === 'completed') return `${description}. Simulation updated.`;
  if (outcome.status === 'pending') return 'Command started. Check device controls for movement progress.';
  const summary = `${outcome.completedCount} of ${outcome.requestedCount} devices match your command.`;
  if (!outcome.fireHeldLightCount) return `${summary} Review the device controls and try again.`;
  const lights = outcome.fireHeldLightCount === 1 ? '1 light remains' : `${outcome.fireHeldLightCount} lights remain`;
  return `${summary} ${lights} on at full brightness until the fire preview is cleared and reset.`;
}
