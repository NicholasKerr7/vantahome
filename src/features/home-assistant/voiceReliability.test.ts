import { isVoiceFollowUp, resolveVoiceConversation } from './voiceConversation';
import { completedMemory, reliabilityContext, reliabilityNow as now } from './voiceReliabilityFixtures';

// Freeze authorization time so slower test runners cannot expire a fixture's Guest grant.
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { jest.restoreAllMocks(); });

const primaryLights = ['master-light', 'master-bedside-left', 'master-bedside-right'];
const kitchenLights = ['kitchen-light', 'dining-light'];

const directRequests = [
  ['Please turn on the kitchen lights.', { type: 'power', on: true, deviceIds: kitchenLights }],
  ['Could you turn the lights off in the kitchen?', { type: 'power', on: false, deviceIds: kitchenLights }],
  ['Would you switch the living room lights on, please?', { type: 'power', on: true, deviceIds: ['living-light'] }],
  ['Turn the lounge lights off!', { type: 'power', on: false, deviceIds: ['living-light'] }],
  ['Set the master bedroom lights to thirty percent.', { type: 'brightness', value: 30, deviceIds: primaryLights }],
  ['Set primary suite lights to 0 percent.', { type: 'brightness', value: 0, deviceIds: primaryLights }],
  ['Set primary suite lights to one hundred percent.', { type: 'brightness', value: 100, deviceIds: primaryLights }],
  ['Could you set the primary suite temperature to twenty-two degrees Celsius?', { type: 'temperature', value: 22, deviceIds: ['master-ac'] }],
  ['Set northwest suite temperature to eighteen degrees.', { type: 'temperature', value: 18, deviceIds: ['bedroom-1-ac'] }],
  ['Set primary suite temperature to twenty six degrees.', { type: 'temperature', value: 26, deviceIds: ['master-ac'] }],
  ['Please open the primary suite blinds.', { type: 'position', value: 100, deviceIds: ['master-blinds'] }],
  ['Could you close primary suite blinds?', { type: 'position', value: 0, deviceIds: ['master-blinds'] }],
] as const;

test.each(directRequests)('realistic direct request preserves exact targets: %s', (phrase, expected) => {
  const result = resolveVoiceConversation(phrase, reliabilityContext(), null, now);
  expect(result.resolution).toMatchObject({ kind: 'command', command: expected });
  expect(result.memory).toBeNull();
});

test.each([
  'Do not turn the living room lights off.', 'Please don’t turn kitchen lights on.',
  'Turn kitchen lights off except the dining light.', 'Turn kitchen lights on if it is dark.',
  'Turn kitchen lights off tomorrow.', 'Turn kitchen lights on and open the entry gate.',
  'Turn kitchen lights on then turn primary suite lights off.',
  'Set primary suite lights to forty percent and unlock the front door.',
  'Set primary suite lights to minus ten percent.', 'Set primary suite lights to -10 percent.',
  'Set primary suite lights to 40.5 percent.', 'Set primary suite lights to forty point five percent.',
  'Set primary suite lights to one hundred and one percent.', 'Set primary suite lights to 101 percent.',
  'Set primary suite temperature to seventeen degrees.', 'Set primary suite temperature to 27 degrees.',
  'Turn library lights on.', 'Turn kitchen off.', 'Open the front door.', 'Close the entry gate.',
  'Turn the gas leak detector off.', 'Turn the smoke alarm off.', 'Turn entry camera off.',
  'Run the evening scene.', 'Start the bedtime routine.', 'Stop the evening scene.',
])('never executes or stages a partial interpretation: %s', (phrase) => {
  const result = resolveVoiceConversation(phrase, reliabilityContext(), null, now);
  expect(result.resolution.kind).not.toBe('command');
  expect(result.clarification).toBeUndefined();
  expect(result.memory).toBeNull();
});

test.each(['No, the family room.', 'No, family room!', 'I meant the family room.', 'I meant family room, please.'])(
  'a strict correction answers only the current room question: %s', (phrase) => {
    const context = reliabilityContext();
    const pending = resolveVoiceConversation('Turn the lights off.', context, null, now);
    expect(pending.clarification).toBeDefined();
    expect(isVoiceFollowUp(phrase, pending.memory, context, now + 1)).toBe(true);
    const result = resolveVoiceConversation(phrase, context, pending.memory, now + 1);
    expect(result.resolution).toMatchObject({ kind: 'command', command: { type: 'power', on: false, deviceIds: ['family-light'] } });
    expect(result.memory).toBeNull();
  });

test.each([
  ['Actually, make it 40%', 'turn living room lights on', { type: 'brightness', value: 40, deviceIds: ['living-light'] }],
  ['Actually, make it 40 percent.', 'turn living room lights on', { type: 'brightness', value: 40, deviceIds: ['living-light'] }],
  ['Actually, set it to forty percent.', 'turn living room lights on', { type: 'brightness', value: 40, deviceIds: ['living-light'] }],
  ['Actually, make them forty percent, please.', 'turn primary suite lights on', { type: 'brightness', value: 40, deviceIds: primaryLights }],
  ['Actually, set them to 40 percent.', 'turn primary suite lights on', { type: 'brightness', value: 40, deviceIds: primaryLights }],
  ['Actually, set it to twenty-two degrees Celsius.', 'set primary suite temperature to 24 degrees', { type: 'temperature', value: 22, deviceIds: ['master-ac'] }],
  ['set it to 22°C', 'set primary suite temperature to 24 degrees', { type: 'temperature', value: 22, deviceIds: ['master-ac'] }],
  ['Actually, make it 22 degrees.', 'set primary suite temperature to 24 degrees', { type: 'temperature', value: 22, deviceIds: ['master-ac'] }],
])('a numeric correction retains the exact completed targets: %s', (phrase, previous, expected) => {
  const context = reliabilityContext();
  const memory = completedMemory(context, previous);
  expect(isVoiceFollowUp(phrase, memory, context, now + 1)).toBe(true);
  expect(resolveVoiceConversation(phrase, context, memory, now + 1).resolution).toMatchObject({ kind: 'command', command: expected });
});

test.each(['No, the family room.', 'I meant family room.', 'Actually, the family room.'])(
  'a completed-room correction cannot silently retarget or claim an undo: %s', (phrase) => {
    const context = reliabilityContext();
    const result = resolveVoiceConversation(phrase, context, completedMemory(context, 'turn living room lights on'), now + 1);
    expect(result).toMatchObject({ resolution: { kind: 'reply', response: { scene: null } }, memory: null });
    if (result.resolution.kind === 'reply') expect(result.resolution.response.answer).toMatch(/already|earlier|previous|original/i);
  });

test.each([
  'Actually, make it -40%.', 'Actually, make it 40.5%.', 'Actually, make it minus forty percent.',
  'Actually, make it 40 percent and open the gate.', 'Actually, make it -40 percent.',
  'Actually, make it 101 percent.', 'Actually, make it forty point five percent.',
  'Actually, make it 40 percent tomorrow.', 'Actually, make it 40 percent except kitchen.',
  'Actually, do not make it 40 percent.', 'Actually, turn kitchen lights off.',
])('a correction prefix cannot admit unsafe or unrelated wake-free speech: %s', (phrase) => {
  const context = reliabilityContext();
  const memory = completedMemory(context, 'turn living room lights on');
  expect(isVoiceFollowUp(phrase, memory, context, now + 1)).toBe(false);
  expect(resolveVoiceConversation(phrase, context, memory, now + 1).resolution.kind).not.toBe('command');
});

test.each(['No.', 'Cancel.', 'Never mind!', 'Stop.', 'No thanks.', 'That’s all.'])(
  'cancellation clears a pending request without executing it: %s', (phrase) => {
    const context = reliabilityContext();
    const pending = resolveVoiceConversation('turn lights off', context, null, now);
    expect(isVoiceFollowUp(phrase, pending.memory, context, now + 1)).toBe(true);
    expect(resolveVoiceConversation(phrase, context, pending.memory, now + 1)).toMatchObject({
      resolution: { kind: 'reply', response: { scene: null } }, memory: null, followUpEligible: false,
    });
  });

test.each(['No, kitchen.', 'I meant the primary suite.', 'Open the front door.', 'Turn all kitchen lights off.'])(
  'Guest speech cannot create a target beyond the actual Living room grant: %s', (phrase) => {
    const context = reliabilityContext(true);
    expect(context.devices.every((device) => device.roomId === 'registry-room:living')).toBe(true);
    const memory = completedMemory(context, 'turn living room lights on');
    expect(isVoiceFollowUp(phrase, memory, context, now + 1)).toBe(false);
    expect(resolveVoiceConversation(phrase, context, memory, now + 1).resolution.kind).not.toBe('command');
  });

test('Guest numeric corrections stay in grant; fresh access expiry defeats the same words', () => {
  const context = reliabilityContext(true);
  const memory = completedMemory(context, 'turn living room lights on');
  const phrase = 'Actually, make it 40 percent.';
  expect(resolveVoiceConversation(phrase, context, memory, now + 1).resolution).toMatchObject({
    kind: 'command', command: { type: 'brightness', value: 40, deviceIds: ['living-light'] },
  });
  context.capturedAt = now + 30_000;
  expect(isVoiceFollowUp(phrase, memory, context, now + 30_000)).toBe(false);
  expect(resolveVoiceConversation(phrase, context, memory, now + 30_000)).toMatchObject({ resolution: { kind: 'reply' }, memory: null });
});

test('pending correction cannot borrow another account, scope or target generation', () => {
  const context = reliabilityContext();
  const pending = resolveVoiceConversation('turn lights off', context, null, now);
  context.fingerprint += ':other-session';
  expect(isVoiceFollowUp('No, the family room.', pending.memory, context, now + 1)).toBe(false);
  expect(resolveVoiceConversation('No, the family room.', context, pending.memory, now + 1).resolution.kind).not.toBe('command');
});

test.each(['Draft a calm evening scene.', 'Create a scene for the living room.', 'Set a mood for reading.'])(
  'scene proposals retain their separate cloud review/create/run route: %s', (phrase) => {
    const context = reliabilityContext();
    const result = resolveVoiceConversation(phrase, context, completedMemory(context, 'turn living room lights on'), now + 1);
    expect(result).toEqual({ resolution: { kind: 'cloud' }, memory: null, followUpEligible: false });
  });

test.each(['Actually, never mind.', 'Actually, I am not sure.', 'No, kitchen and family room.', 'I meant somewhere else.'])(
  'an unrecognized correction retires the pending action instead of keeping a replayable choice: %s', (phrase) => {
    const context = reliabilityContext();
    const pending = resolveVoiceConversation('turn lights off', context, null, now);
    expect(isVoiceFollowUp(phrase, pending.memory, context, now + 1)).toBe(false);
    const result = resolveVoiceConversation(phrase, context, pending.memory, now + 1);
    expect(result.resolution.kind).not.toBe('command');
    expect(result.memory).toBeNull();
  });

test.each([
  ['Actually, make it 40 percent.', 40], ['Actually, set it to 0%.', 0],
])('a same-target blinds correction changes only position: %s', (phrase, position) => {
  const context = reliabilityContext();
  const memory = completedMemory(context, 'open primary suite blinds');
  expect(isVoiceFollowUp(phrase, memory, context, now + 1)).toBe(true);
  expect(resolveVoiceConversation(phrase, context, memory, now + 1).resolution).toMatchObject({
    kind: 'command', command: { type: 'position', value: position, deviceIds: ['master-blinds'] },
  });
});

test.each(['Actually, make it -1%.', 'Actually, make it 101%.'])(
  'a blinds correction cannot admit an out-of-range position: %s', (phrase) => {
    const context = reliabilityContext();
    const memory = completedMemory(context, 'open primary suite blinds');
    expect(isVoiceFollowUp(phrase, memory, context, now + 1)).toBe(false);
    expect(resolveVoiceConversation(phrase, context, memory, now + 1).resolution.kind).not.toBe('command');
  });
