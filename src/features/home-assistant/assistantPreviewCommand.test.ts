import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { SCENE_PREVIEW_CHANNEL } from '../../../packages/home-scene/src/scenePreviewProtocol';
import type { ConciergeResponse } from '../../../shared/home-concierge/contract';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import type { ControlSnapshot } from '../three-d-home/simulationControlClient';
import { assistantSceneDraft, buildAssistantContext } from './assistantContext';
import { assistantPreviewCommand } from './assistantPreviewCommand';
import type { AssistantPreview } from './useHomeConcierge';

const now = Date.now();
const originalState = useHomeStore.getState();

/** Use real registry bindings and separately captured values without invoking an AI service. */
function previewFixture(): AssistantPreview {
  const home = virtualSceneHome();
  useHomeStore.setState(home, true);
  const state = createDefaultSimulationSnapshot();
  state.deviceStates['living-light'] = { on: true, level: 31, settings: { colorTempK: 2800 } };
  const snapshot: ControlSnapshot = { ready: true, status: 'saved', access: resolveModelSceneAccess(home), state };
  const capturedContext = buildAssistantContext(home, snapshot, now, { roomId: 'registry-room:living' });
  const context = buildAssistantContext(home, snapshot, now + 1, { roomId: 'registry-room:living' });
  const response: ConciergeResponse = {
    title: 'Evening calm', answer: 'Review this lighting scene.', deviceIds: ['registry-device:living-light'],
    scene: { name: 'Evening calm', explanation: 'Lower the pendant brightness.',
      actions: [{ deviceId: 'registry-device:living-light', values: { brightness: 25 } }] },
  };
  const draft = assistantSceneDraft(response, capturedContext, home, snapshot, now + 1);
  if (!draft) throw new Error('Expected a permitted simulation-only scene fixture.');
  return { draft, context, capturedContext, snapshot, response, expiresAt: now + 60_000 };
}

afterEach(() => { useHomeStore.setState(originalState, true); });

test('maps registered identities to renderer identities and carries only the exact proposed baseline fields', () => {
  const preview = previewFixture();
  const command = assistantPreviewCommand(preview, 3, now + 2);
  expect(command).toEqual({
    channel: SCENE_PREVIEW_CHANNEL, version: 1, id: 3, type: 'set',
    preview: { title: 'Evening calm', expiresAt: now + 60_000,
      actions: [{ deviceId: 'living-light', values: { brightness: 25 }, baseline: { brightness: 31 } }] },
  });
  expect(JSON.stringify(command)).not.toContain('registry-device:');
  expect(JSON.stringify(command)).not.toContain('scene-owner');
  expect(JSON.stringify(command)).not.toContain('colorTempK');
});

test('creates an isolated DTO without mutating simulation, preferences, scenes or the original proposal', () => {
  const preview = previewFixture();
  const beforePreview = JSON.stringify(preview);
  const beforeState = useHomeStore.getState();
  const writes = jest.fn();
  const unsubscribe = useHomeStore.subscribe(writes);
  const command = assistantPreviewCommand(preview, 1, now + 2);
  if (command?.type !== 'set') throw new Error('Expected a display command.');
  command.preview.actions[0].values.brightness = 99;
  command.preview.actions[0].baseline.brightness = 1;
  expect(JSON.stringify(preview)).toBe(beforePreview);
  expect(useHomeStore.getState()).toBe(beforeState);
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(writes).not.toHaveBeenCalled();
  unsubscribe();
});

test('allows unrelated reading changes without adding them to the proposal', () => {
  const preview = previewFixture();
  const device = preview.context.devices.find((candidate) => candidate.modelDeviceId === 'living-light')!;
  device.values.isOn = false;
  device.values.colorTempK = 3200;
  expect(assistantPreviewCommand(preview, 2, now + 2)).toMatchObject({
    preview: { actions: [{ values: { brightness: 25 }, baseline: { brightness: 31 } }] },
  });
});

test.each(['explicit expiry', 'captured age', 'clock rollback'] as const)('rejects %s without renewing the captured proposal', (reason) => {
  const preview = previewFixture();
  if (reason === 'captured age') preview.expiresAt = now + 120_000;
  const checkedAt = reason === 'clock rollback' ? now - 1 : reason === 'captured age' ? now + 60_001 : preview.expiresAt;
  expect(assistantPreviewCommand(preview, 2, checkedAt)).toBeNull();
});

test.each(['session', 'membership', 'grant', 'account', 'physical transport'] as const)('rejects a proposal immediately after %s changes', (reason) => {
  const preview = previewFixture();
  const home = useHomeStore.getState();
  const change: Partial<HomeState> = reason === 'session' ? { sessionEpoch: home.sessionEpoch + 1 }
    : reason === 'membership' ? { membershipReady: false }
      : reason === 'grant' ? { memberPermissionOverrides: [{ memberId: home.activeMemberId, permission: 'light.control', allowed: false }] }
        : reason === 'account' ? { authenticatedUserId: 'another-member' }
          : { realtime: { ...home.realtime, enabled: true, wsUrl: 'wss://hub.example.invalid' } };
  useHomeStore.setState(change);
  expect(assistantPreviewCommand(preview, 2, now + 2)).toBeNull();
});

test.each(['missing current', 'missing captured', 'different binding', 'read only', 'missing baseline', 'changed target', 'unsupported setting'] as const)(
  'refuses %s rather than inventing a baseline or widening the selected room', (reason) => {
    const preview = previewFixture();
    const device = preview.context.devices.find((candidate) => candidate.modelDeviceId === 'living-light')!;
    const captured = preview.capturedContext.devices.find((candidate) => candidate.modelDeviceId === 'living-light')!;
    if (reason === 'missing current') preview.context.devices = [];
    if (reason === 'missing captured') preview.capturedContext.devices = [];
    if (reason === 'different binding') device.modelDeviceId = 'master-light';
    if (reason === 'read only') device.controllable = false;
    if (reason === 'missing baseline') delete captured.values.brightness;
    if (reason === 'changed target') device.values.brightness = 72;
    if (reason === 'unsupported setting') {
      device.values.tempC = 22;
      captured.values.tempC = 22;
      preview.response.scene!.actions[0].values = { tempC: 24 };
    }
    expect(assistantPreviewCommand(preview, 2, now + 2)).toBeNull();
  },
);

test('does not preview an answer without a scene or a device outside the captured room', () => {
  const preview = previewFixture();
  preview.response.scene!.actions[0].deviceId = 'registry-device:master-light';
  expect(assistantPreviewCommand(preview, 2, now + 2)).toBeNull();
  preview.response.scene = null;
  expect(assistantPreviewCommand(preview, 3, now + 2)).toBeNull();
});

test.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid correlation ID %s at the typed protocol boundary', (id) => {
  expect(assistantPreviewCommand(previewFixture(), id, now + 2)).toBeNull();
});
