import { buildAssistantContext } from './assistantContext';
import { resolveLocalAssistantVoice } from './localAssistantVoice';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { voicePropertyContext, permittedVoiceVocabulary } from '../home-voice/voicePropertyContext';
import { parseHomeVoiceCommand } from '../home-voice/voiceCommandParser';

/** Build current authorized state with deliberately separate registry/model identities. */
function fixture(roomId: string | null = null) {
  const state = virtualSceneHome();
  const snapshot = { ready: true, status: 'saved' as const, state: createDefaultSimulationSnapshot(), access: resolveModelSceneAccess(state) };
  return { state, snapshot, context: buildAssistantContext(state, snapshot, Date.now(), { roomId }) };
}

test('recognizes selected room and canonical aliases without crossing scope', () => {
  const { context } = fixture('registry-room:master');
  expect(resolveLocalAssistantVoice('Could you turn the lights off here?', context)).toMatchObject({ kind: 'command', command: { type: 'power', on: false, deviceIds: ['master-light', 'master-bedside-left', 'master-bedside-right'] } });
  expect(resolveLocalAssistantVoice('set master bedroom temperature to twenty two degrees', context)).toMatchObject({ kind: 'command', command: { type: 'temperature', value: 22 } });
  expect(resolveLocalAssistantVoice('turn kitchen lights on', context)).toMatchObject({ kind: 'reply' });
});

test('uses a renamed fixture and rejects stale names and view-only targets', () => {
  const f = fixture('registry-room:living');
  f.context.devices[0].name = 'Reading pendant';
  expect(resolveLocalAssistantVoice('turn reading pendant off', f.context)).toMatchObject({ kind: 'command' });
  expect(resolveLocalAssistantVoice('turn pendant light off', f.context)).toMatchObject({ kind: 'reply' });
  f.context.devices[0].controllable = false;
  expect(resolveLocalAssistantVoice('turn reading pendant off', f.context)).toMatchObject({ kind: 'reply', response: { answer: expect.stringContaining('current access') } });
});

test.each(['open front door', 'close entry gate', 'turn lights off except kitchen', 'turn kitchen lights on and open gate', 'do not turn kitchen lights off', 'run evening scene'])('never routes an unsupported command into cloud execution: %s', (question) => {
  expect(resolveLocalAssistantVoice(question, fixture().context)).toMatchObject({ kind: 'reply', response: { scene: null } });
});

test('answers scoped facts locally and identifies simulation targets correctly', () => {
  const { context } = fixture('registry-room:master');
  expect(resolveLocalAssistantVoice('which lights are on here', context)).toMatchObject({ kind: 'reply', response: { scene: null, answer: expect.stringMatching(/simulation/i) } });
  expect(resolveLocalAssistantVoice('what is temperature set to here', context)).toMatchObject({ kind: 'reply', response: { answer: expect.stringContaining('not measured room temperatures') } });
  expect(resolveLocalAssistantVoice("What's the temperature here?", context)).toMatchObject({ kind: 'reply', response: { answer: expect.stringContaining('not measured room temperatures') } });
  expect(resolveLocalAssistantVoice('Draft a scene for a quiet evening', context)).toEqual({ kind: 'cloud' });
});

test('direct controls and vocabulary use only the current registry/snapshot intersection', () => {
  const { state, snapshot } = fixture();
  state.devices = state.devices.map((device) => device.modelDeviceId === 'living-light' ? { ...device, name: 'Sculpture pendant' } : device);
  snapshot.access.deviceIds = ['living-light']; snapshot.access.controllableDeviceIds = ['living-light'];
  const directory = voicePropertyContext(state, snapshot);
  expect(directory.devices?.map((device) => device.id)).toEqual(['living-light']);
  expect(parseHomeVoiceCommand('turn sculpture pendant on', directory)).toMatchObject({ command: { deviceIds: ['living-light'] } });
  expect(parseHomeVoiceCommand('turn kitchen lights on', directory)).toHaveProperty('error');
  const hints = permittedVoiceVocabulary(state, 'registry-room:living');
  expect(hints).toContain('Sculpture pendant'); expect(hints).not.toContain('Primary suite');
});
