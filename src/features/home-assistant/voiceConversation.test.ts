import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { buildAssistantContext, type AssistantContext } from './assistantContext';
import type { LocalAssistantResolution } from './localAssistantVoice';
import { currentVoiceClarification, hasVoiceFollowUp, isVoiceFollowUp, rememberVoiceCommand, resolveVoiceConversation,
  type VoiceConversationMemory } from './voiceConversation';

const now = 1_800_000_000_000;

/** Use separate registry/model identities and current simulation observations throughout conversation tests. */
function fixture(roomId: string | null = null): AssistantContext {
  const state = virtualSceneHome();
  const snapshot = { ready: true, status: 'saved' as const, state: createDefaultSimulationSnapshot(), access: resolveModelSceneAccess(state) };
  return buildAssistantContext(state, snapshot, now, { roomId });
}

/** Narrow an expected command without using unchecked assertions in test setup. */
function command(resolution: LocalAssistantResolution): Extract<LocalAssistantResolution, { kind: 'command' }> {
  if (resolution.kind !== 'command') throw new Error('Expected a local command');
  return resolution;
}

/** Simulate completed execution before a previous target becomes available to pronouns. */
function remembered(context: AssistantContext, question = 'turn living room lights on'): VoiceConversationMemory {
  const resolution = command(resolveVoiceConversation(question, context, null, now).resolution);
  const memory = rememberVoiceCommand(context, resolution, now);
  if (!memory) throw new Error('Expected completed-target memory');
  return memory;
}

test('does not remember proposed commands and records only validated registry identities on explicit completion', () => {
  const context = fixture();
  const result = resolveVoiceConversation('turn living room lights on', context, null, now);
  expect(result).toMatchObject({ resolution: { kind: 'command' }, memory: null, followUpEligible: true });
  const memory = rememberVoiceCommand(context, command(result.resolution), now);
  expect(memory).toEqual({ fingerprint: context.fingerprint, expiresAt: now + 60_000,
    lastDeviceIds: ['registry-device:living-light'], pendingClarification: null });
  expect(resolveVoiceConversation('turn them off', context, null, now).resolution.kind).toBe('reply');
});

test.each([
  ['turn them off', { type: 'power', on: false }],
  ['turn them on', { type: 'power', on: true }],
  ['Could you set them to thirty percent?', { type: 'brightness', value: 30 }],
  ['make them brighter', { type: 'brightness-adjustment', delta: 10 }],
  ['make them dimmer', { type: 'brightness-adjustment', delta: -10 }],
])('resolves bounded follow-up %s against the successfully controlled targets', (question, expected) => {
  const context = fixture();
  const memory = remembered(context, 'turn primary suite lights on');
  expect(resolveVoiceConversation(question, context, memory, now + 1)).toMatchObject({
    resolution: { kind: 'command', command: { ...expected, deviceIds: ['master-light', 'master-bedside-left', 'master-bedside-right'] } }, memory: null,
  });
});

test('relative brightness retains a delta for fresh per-device execution without inserting a power change', () => {
  const context = fixture('registry-room:master');
  const memory = remembered(context, 'turn lights on');
  const lights = context.devices.filter((device) => device.kind === 'light');
  lights.forEach((device, index) => { device.values = { isOn: index === 0, brightness: 30 + index * 20 }; });
  const result = command(resolveVoiceConversation('make them brighter', context, memory, now + 1).resolution);
  expect(result.command).toEqual({ type: 'brightness-adjustment', delta: 10, deviceIds: lights.map((device) => device.modelDeviceId) });
  expect(lights.map((device) => device.values)).toEqual([
    { isOn: true, brightness: 30 }, { isOn: false, brightness: 50 }, { isOn: false, brightness: 70 },
  ]);
  lights[0].values.brightness = undefined;
  expect(resolveVoiceConversation('make them brighter', context, memory, now + 2).resolution.kind).toBe('reply');
});

test.each(['turn it off', 'set them to 101 percent', 'set them to minus ten percent', 'make them brighter and open gate',
  'do not turn them off', 'turn them off except kitchen', 'turn them off tomorrow'])('never guesses or partially resolves %s', (question) => {
  const context = fixture();
  expect(resolveVoiceConversation(question, context, remembered(context, 'turn primary suite lights on'), now + 1).resolution.kind).not.toBe('command');
});

test('only the selected room can provide an unambiguous initial temperature reference', () => {
  expect(resolveVoiceConversation('set it to 22 degrees', fixture('registry-room:master'), null, now)).toMatchObject({
    resolution: { kind: 'command', command: { type: 'temperature', value: 22, deviceIds: ['master-ac'] } },
  });
  expect(resolveVoiceConversation('set it to 22 degrees', fixture(), null, now).resolution.kind).toBe('reply');
  expect(resolveVoiceConversation('set it to 27 degrees', fixture('registry-room:master'), null, now).resolution.kind).toBe('reply');
});

test('never replaces a remembered light with the selected room climate device', () => {
  const context = fixture('registry-room:master');
  const memory = remembered(context, 'turn master-light on');
  expect(resolveVoiceConversation('set it to 22 degrees', context, memory, now).resolution.kind).toBe('reply');
});

test.each(['expired', 'fingerprint', 'deleted', 'restricted', 'cross-room', 'unavailable', 'stale'])(
  'invalidates conversational targets when context becomes %s', (change) => {
    let context = fixture();
    const memory = remembered(context);
    let currentTime = now + 1;
    if (change === 'expired') { currentTime = now + 60_000; context.capturedAt = currentTime; }
    if (change === 'fingerprint') context.fingerprint += ':new-account';
    if (change === 'deleted') context.devices = context.devices.filter((device) => !memory.lastDeviceIds.includes(device.id));
    if (change === 'restricted') context.devices.find((device) => memory.lastDeviceIds.includes(device.id))!.controllable = false;
    if (change === 'cross-room') context = fixture('registry-room:master');
    if (change === 'unavailable') context.available = false;
    if (change === 'stale') currentTime = now + 60_001;
    expect(resolveVoiceConversation('turn them off', context, memory, currentTime)).toMatchObject({ resolution: { kind: 'reply' }, memory: null, followUpEligible: false });
    expect(isVoiceFollowUp('turn them off', memory, context, currentTime)).toBe(false);
  });

test('guest expiry caps the memory deadline and cannot be prolonged by repeated questions', () => {
  const context = fixture();
  context.expiresAt = now + 1_000;
  const memory = remembered(context);
  expect(memory.expiresAt).toBe(now + 1_000);
  expect(resolveVoiceConversation('turn them off', context, memory, now + 1_000).resolution.kind).toBe('reply');
});

test('asks for a permitted room before a generic multi-room command and consumes the clarification once', () => {
  const context = fixture();
  const result = resolveVoiceConversation('turn lights off', context, null, now);
  expect(result).toMatchObject({ resolution: { kind: 'reply', response: { scene: null } }, followUpEligible: true });
  expect(result.clarification?.choices).toHaveLength(result.memory!.pendingClarification!.choices.length);
  expect(result.clarification?.choices.some((choice) => choice.label === 'Living room')).toBe(true);
  expect(result.memory?.lastDeviceIds).toEqual([]);
  const selected = resolveVoiceConversation('living room', context, result.memory, now + 1);
  expect(selected).toMatchObject({ resolution: { kind: 'command', command: { type: 'power', on: false, deviceIds: ['living-light'] } }, memory: null });
  expect(resolveVoiceConversation('living room', context, selected.memory, now + 2).resolution.kind).not.toBe('command');
});

test('keeps rooms beyond the first six selectable and limits only the spoken list', () => {
  const context = fixture();
  context.availableRooms.sort((left, right) => Number(left.id === 'registry-room:kitchen') - Number(right.id === 'registry-room:kitchen'));
  const pending = resolveVoiceConversation('turn lights off', context, null, now);
  const kitchen = pending.clarification!.choices.find((choice) => choice.id === 'room:registry-room:kitchen')!;
  expect(pending.clarification!.choices.indexOf(kitchen)).toBeGreaterThan(5);
  expect(pending.clarification!.question).toContain('or another permitted room or device');
  expect(pending.clarification!.question).toContain('Say its name or choose on screen');
  for (const answer of ['kitchen', kitchen.reply]) {
    expect(isVoiceFollowUp(answer, pending.memory, context, now + 1)).toBe(true);
    expect(resolveVoiceConversation(answer, context, pending.memory, now + 1)).toMatchObject({
      resolution: { kind: 'command', command: { deviceIds: ['kitchen-light', 'dining-light'] } },
    });
  }
  context.devices.find((device) => device.modelDeviceId === 'kitchen-light')!.controllable = false;
  expect(currentVoiceClarification(pending.memory, context, now + 2)).toBeNull();
  expect(hasVoiceFollowUp(pending.memory, context, now + 2)).toBe(false);
});

test.each(['set temperature here to 22 degrees', 'set temperature in this room to 22 degrees'])(
  'accepts a room answer when the pending command contains an internal location: %s', (question) => {
    const context = fixture();
    const pending = resolveVoiceConversation(question, context, null, now);
    expect(pending.clarification).toBeDefined();
    expect(resolveVoiceConversation('in the primary suite', context, pending.memory, now + 1)).toMatchObject({
      resolution: { kind: 'command', command: { type: 'temperature', value: 22, deviceIds: ['master-ac'] } },
    });
  });

test.each(['Lounge', 'Living room'])('a renamed room matching another room name or alias stays ambiguous: %s', (name) => {
  const context = fixture();
  const room = context.availableRooms.find((item) => item.id === 'registry-room:master')!;
  room.name = name;
  context.devices.filter((device) => device.roomId === room.id).forEach((device) => { device.roomName = name; });
  const pending = resolveVoiceConversation('turn lights off', context, null, now);
  expect(isVoiceFollowUp(name, pending.memory, context, now + 1)).toBe(false);
  expect(resolveVoiceConversation(name, context, pending.memory, now + 1).resolution.kind).toBe('reply');
  const choice = pending.clarification!.choices.find((item) => item.id === `room:${room.id}`)!;
  expect(resolveVoiceConversation(choice.reply, context, pending.memory, now + 1)).toMatchObject({
    resolution: { kind: 'command', command: { deviceIds: ['master-light', 'master-bedside-left', 'master-bedside-right'] } },
  });
});

test('bounds spoken clarification for maximum permitted names without omitting selectable devices', () => {
  const context = fixture('registry-room:master');
  const name = 'A'.repeat(120);
  context.availableRooms.find((room) => room.id === context.roomId)!.name = 'B'.repeat(120);
  context.devices.filter((device) => device.kind === 'light').forEach((device) => { device.name = name; });
  const pending = resolveVoiceConversation(`turn ${name} off`, context, null, now);
  expect(pending.clarification!.choices).toHaveLength(3);
  expect(pending.clarification!.question.length).toBeLessThanOrEqual(1_200);
  expect(pending.clarification!.choices.every((choice) => choice.label.includes(name))).toBe(true);
});

test('understands a permitted room alias and the exact selected choice identifier', () => {
  const context = fixture();
  const pending = resolveVoiceConversation('turn lights off', context, null, now);
  expect(resolveVoiceConversation('lounge', context, pending.memory, now + 1)).toMatchObject({
    resolution: { kind: 'command', command: { deviceIds: ['living-light'] } },
  });
  const choice = pending.clarification!.choices[0];
  expect(resolveVoiceConversation(choice.reply, context, pending.memory, now + 1).resolution.kind).toBe('command');
});

test('asks about here without a selected room and keeps only the current permitted scope in choices', () => {
  const context = fixture();
  context.devices = context.devices.filter((device) => device.roomId === 'registry-room:kitchen');
  const pending = resolveVoiceConversation('turn lights off here', context, null, now);
  expect(pending.clarification?.choices).toHaveLength(1);
  expect(pending.clarification?.choices[0].id).toBe('room:registry-room:kitchen');
  expect(resolveVoiceConversation('living room', context, pending.memory, now + 1).resolution.kind).toBe('reply');
  expect(resolveVoiceConversation('kitchen', context, pending.memory, now + 1)).toMatchObject({
    resolution: { kind: 'command', command: { deviceIds: ['kitchen-light', 'dining-light'] } },
  });
});

test('offers separate device choices for duplicate names in a selected room, with no guessed default', () => {
  const context = fixture('registry-room:master');
  context.devices.filter((device) => device.kind === 'light').forEach((device) => { device.name = 'Reading lamp'; });
  const pending = resolveVoiceConversation('turn reading lamp off', context, null, now);
  expect(pending.clarification?.choices).toHaveLength(3);
  expect(resolveVoiceConversation('reading lamp', context, pending.memory, now + 1).resolution.kind).toBe('reply');
  const choice = pending.clarification!.choices[1];
  expect(resolveVoiceConversation(choice.reply, context, pending.memory, now + 1)).toMatchObject({
    resolution: { kind: 'command', command: { deviceIds: ['master-bedside-left'] } },
  });
});

test.each(['deleted', 'restricted', 'expired', 'fingerprint', 'expanded-target'])(
  'invalidates a pending choice after %s instead of executing a surviving subset', (change) => {
    const context = fixture();
    const addedTarget = context.devices.find((device) => device.modelDeviceId === 'master-bedside-right')!;
    if (change === 'expanded-target') context.devices = context.devices.filter((device) => device.id !== addedTarget.id);
    const pending = resolveVoiceConversation('turn lights off', context, null, now);
    let currentTime = now + 1;
    const id = pending.memory!.pendingClarification!.choices[0].deviceIds[0];
    if (change === 'deleted') context.devices = context.devices.filter((device) => device.id !== id);
    if (change === 'restricted') context.devices.find((device) => device.id === id)!.controllable = false;
    if (change === 'expired') { currentTime = now + 60_000; context.capturedAt = currentTime; }
    if (change === 'fingerprint') context.fingerprint += ':new-grants';
    if (change === 'expanded-target') context.devices.push(addedTarget);
    expect(currentVoiceClarification(pending.memory, context, currentTime)).toBeNull();
    expect(resolveVoiceConversation(pending.clarification!.choices[0].reply, context, pending.memory, currentTime).resolution.kind).not.toBe('command');
  });

test('a vague pending reply preserves its original deadline; cancellation and new intent discard it', () => {
  const context = fixture();
  const pending = resolveVoiceConversation('turn lights off', context, null, now);
  const vague = resolveVoiceConversation('yes', context, pending.memory, now + 10_000);
  expect(vague.memory?.expiresAt).toBe(pending.memory?.expiresAt);
  expect(vague.resolution.kind).toBe('reply');
  expect(resolveVoiceConversation('never mind', context, pending.memory, now + 1)).toMatchObject({ memory: null, followUpEligible: false });
  expect(resolveVoiceConversation('what is on', context, pending.memory, now + 1)).toMatchObject({ memory: null, followUpEligible: false });
  expect(resolveVoiceConversation('turn primary suite lights on', context, pending.memory, now + 1)).toMatchObject({
    resolution: { kind: 'command', command: { deviceIds: ['master-light', 'master-bedside-left', 'master-bedside-right'] } }, memory: null,
  });
});

test('continuation eligibility requires unexpired complete memory and never changes it', () => {
  const context = fixture();
  const memory = remembered(context);
  const before = JSON.stringify(memory);
  expect(hasVoiceFollowUp(memory, context, now + 1)).toBe(true);
  expect(JSON.stringify(memory)).toBe(before);
  expect(hasVoiceFollowUp(null, context, now + 1)).toBe(false);
  expect(hasVoiceFollowUp(memory, context, now + 60_000)).toBe(false);
  const pending = resolveVoiceConversation('turn lights off', context, null, now);
  expect(hasVoiceFollowUp(pending.memory, context, now + 1)).toBe(true);
  const fabricated = { ...pending.memory!, pendingClarification: { ...pending.memory!.pendingClarification!,
    choices: pending.memory!.pendingClarification!.choices.map(() => pending.memory!.pendingClarification!.choices[0]) } };
  expect(hasVoiceFollowUp(fabricated, context, now + 1)).toBe(false);
  expect(hasVoiceFollowUp({ ...pending.memory!, lastDeviceIds: memory.lastDeviceIds }, context, now + 1)).toBe(false);
});

test('wake-free matching accepts only current strict follow-ups and explicit pending replies', () => {
  const context = fixture();
  const memory = remembered(context);
  expect(isVoiceFollowUp('make them dimmer', memory, context, now + 1)).toBe(true);
  expect(isVoiceFollowUp('turn kitchen lights off', memory, context, now + 1)).toBe(false);
  expect(isVoiceFollowUp('turn them off tomorrow', memory, context, now + 1)).toBe(false);
  const pending = resolveVoiceConversation('turn lights off', context, memory, now + 1);
  expect(isVoiceFollowUp('lounge', pending.memory, context, now + 2)).toBe(true);
  expect(isVoiceFollowUp('yes', pending.memory, context, now + 2)).toBe(false);
  expect(isVoiceFollowUp('turn them off', pending.memory, context, now + 2)).toBe(false);
  expect(isVoiceFollowUp('cancel', pending.memory, context, now + 2)).toBe(true);
});

test.each(['open entry gate', 'open front door', 'close windows', 'run evening scene', 'turn lights off and open gate'])(
  'never clarifies or executes security, unsupported openings, scenes or compound request: %s', (question) => {
    const context = fixture();
    expect(resolveVoiceConversation(question, context, remembered(context), now + 1)).toMatchObject({
      resolution: { kind: 'reply', response: { scene: null } }, memory: null, followUpEligible: false,
    });
  });

test('preserves cloud scene drafts and explicit all-lights commands without clarification', () => {
  const context = fixture();
  expect(resolveVoiceConversation('Draft a scene for a quiet evening', context, remembered(context), now)).toEqual({ resolution: { kind: 'cloud' }, memory: null, followUpEligible: false });
  expect(resolveVoiceConversation('turn all lights off', context, null, now)).toMatchObject({ resolution: { kind: 'command' }, memory: null });
  expect(resolveVoiceConversation('open primary suite blinds', context, null, now).resolution.kind).toBe('command');
});

test('refuses fabricated remembered bindings, duplicate targets and mismatched command identifiers', () => {
  const context = fixture();
  const resolution = command(resolveVoiceConversation('turn living room lights on', context, null, now).resolution);
  expect(rememberVoiceCommand(context, { ...resolution, deviceIds: ['registry-device:entry-gate'] }, now)).toBeNull();
  expect(rememberVoiceCommand(context, { ...resolution, deviceIds: [...resolution.deviceIds, ...resolution.deviceIds] }, now)).toBeNull();
  expect(rememberVoiceCommand(context, { ...resolution, command: { type: 'power', on: true, deviceIds: ['master-light'] } }, now)).toBeNull();
});
