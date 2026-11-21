import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { buildAssistantContext, type AssistantContext } from './assistantContext';
import { rememberVoiceCommand, resolveVoiceConversation, type VoiceConversationMemory } from './voiceConversation';

export const reliabilityNow = Date.now();
const now = reliabilityNow;

/** Evaluate text interpretation using the actual registry/access mapping, not microphone accuracy. */
export function reliabilityContext(guest = false): AssistantContext {
  const home = virtualSceneHome();
  if (guest) {
    home.household = [{ ...home.household[0], role: 'Guest', accessExpiresAt: new Date(now + 30_000).toISOString() }];
    home.roomMembers = [{ memberId: home.activeMemberId, roomIds: ['registry-room:living'] }];
  }
  return buildAssistantContext(home, { ready: true, status: 'saved',
    state: createDefaultSimulationSnapshot(), access: resolveModelSceneAccess(home) }, now);
}

/** Only a validated completed command supplies target memory to a correction test. */
export function completedMemory(context: AssistantContext, phrase: string): VoiceConversationMemory {
  const { resolution } = resolveVoiceConversation(phrase, context, null, now);
  if (resolution.kind !== 'command') throw new Error(`Fixture command was not understood: ${phrase}`);
  const memory = rememberVoiceCommand(context, resolution, now);
  if (!memory) throw new Error('Fixture command did not produce valid completed memory');
  return memory;
}
