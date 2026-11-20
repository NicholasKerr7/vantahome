import { getDevice } from '../../../packages/home-scene/src/data';
import { isComfortKind, MAX_CONCIERGE_CONTEXT_AGE_MS, MAX_CONCIERGE_DEVICES } from '../../../shared/home-concierge/contract';
import { normalizeSingleVoiceCommand, normalizeVoiceText, spokenWholeNumber } from '../home-voice/voiceCommandLanguage';
import { parseHomeVoiceCommand, type HomeVoiceCommand } from '../home-voice/voiceCommandParser';
import type { AssistantContext, AssistantDevice } from './assistantContext';
import { localVoiceReply, resolveLocalAssistantVoice, type LocalAssistantResolution } from './localAssistantVoice';

type CommandResolution = Extract<LocalAssistantResolution, { kind: 'command' }>;
type PendingChoice = { id: string; deviceIds: string[] };
export type VoiceConversationMemory = {
  fingerprint: string;
  expiresAt: number;
  lastDeviceIds: string[];
  pendingClarification: { question: string; choices: PendingChoice[] } | null;
};
export type VoiceClarification = { question: string; choices: { id: string; label: string; reply: string }[] };
export type VoiceConversationResult = {
  resolution: LocalAssistantResolution;
  memory: VoiceConversationMemory | null;
  clarification?: VoiceClarification;
  followUpEligible: boolean;
};
type ClarificationOption = PendingChoice & { label: string; resolution: CommandResolution };
const MEMORY_DURATION_MS = 60_000;
const SPOKEN_CHOICE_COUNT = 3;
const CANCEL = /^(?:cancel|stop|never mind|nevermind|forget it|no thanks|that['’]s all)$/;

/** Reject unavailable, expired or old observations before reading conversational references. */
function contextIsFresh(context: AssistantContext, now: number): boolean {
  return context.available && Number.isSafeInteger(now) && now >= context.capturedAt
    && now - context.capturedAt <= MAX_CONCIERGE_CONTEXT_AGE_MS
    && (context.expiresAt === null || context.expiresAt > now);
}

/** Registry identities must still bind to a permitted comfort device inside the selected scope. */
function currentTargets(ids: string[], context: AssistantContext): AssistantDevice[] | null {
  if (!ids.length || new Set(ids).size !== ids.length) return null;
  const targets = ids.map((id) => context.devices.find((device) => device.id === id));
  if (targets.some((device) => !device || !device.controllable || !isComfortKind(device.kind)
    || getDevice(device.modelDeviceId)?.kind !== device.kind
    || !context.availableRooms.some((room) => room.id === device.roomId)
    || (context.roomId !== null && device.roomId !== context.roomId))) return null;
  return targets as AssistantDevice[];
}

/** Validate the entire command, never silently drop a deleted or newly restricted target. */
function commandIsCurrent(resolution: CommandResolution, context: AssistantContext): boolean {
  const targets = currentTargets(resolution.deviceIds, context);
  if (!targets || !sameIds(targets.map((device) => device.modelDeviceId), resolution.command.deviceIds)) return false;
  const command = resolution.command;
  if (command.type === 'power') return typeof command.on === 'boolean' && targets.every((device) => device.kind !== 'blinds');
  if (command.type === 'brightness-adjustment') return [-10, 10].includes(command.delta)
    && targets.every((device) => device.kind === 'light' && typeof device.values.brightness === 'number'
      && Number.isFinite(device.values.brightness) && device.values.brightness >= 0 && device.values.brightness <= 100);
  if (!Number.isSafeInteger(command.value)) return false;
  if (command.type === 'temperature') return command.value >= 18 && command.value <= 26 && targets.every((device) => device.kind === 'ac');
  return command.value >= 0 && command.value <= 100
    && targets.every((device) => device.kind === (command.type === 'position' ? 'blinds' : 'light'));
}

/** Compare complete identity sets without treating duplicates as additional targets. */
function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && new Set(right).size === right.length && left.every((id) => right.includes(id));
}

/** Keep unsuccessful requests and unresolved proposals out of target memory. Call only after completed execution. */
export function rememberVoiceCommand(context: AssistantContext, resolution: CommandResolution, now = Date.now()): VoiceConversationMemory | null {
  if (!contextIsFresh(context, now) || !commandIsCurrent(resolution, context)) return null;
  return { fingerprint: context.fingerprint, expiresAt: Math.min(now + MEMORY_DURATION_MS, context.expiresAt ?? Infinity),
    lastDeviceIds: [...resolution.deviceIds], pendingClarification: null };
}

/** Run the existing strict parser against smaller current scopes to identify, but never execute, choices. */
function clarificationOptions(question: string, context: AssistantContext): ClarificationOption[] {
  const options: ClarificationOption[] = [];
  for (const room of context.availableRooms) {
    const devices = context.devices.filter((device) => device.roomId === room.id);
    if (!devices.length || (context.roomId !== null && room.id !== context.roomId)) continue;
    const scoped = { ...context, roomId: room.id, devices };
    const roomResolution = resolveLocalAssistantVoice(question, scoped);
    if (roomResolution.kind === 'command' && commandIsCurrent(roomResolution, scoped)) {
      options.push({ id: `room:${room.id}`, label: room.name,
        deviceIds: roomResolution.deviceIds, resolution: roomResolution });
      continue;
    }
    for (const device of devices) {
      const deviceContext = { ...scoped, devices: [device] };
      const resolution = resolveLocalAssistantVoice(question, deviceContext);
      if (resolution.kind === 'command' && commandIsCurrent(resolution, deviceContext)) {
        options.push({ id: `device:${device.id}`, label: `${device.name} in ${room.name}`,
          deviceIds: resolution.deviceIds, resolution });
      }
    }
  }
  // Every candidate remains selectable; a display limit must never become an authorization boundary.
  return options.length <= MAX_CONCIERGE_DEVICES ? options : [];
}

/** Any changed choice invalidates the whole pending request, including its originally chosen target set. */
function validMemory(memory: VoiceConversationMemory | null, context: AssistantContext, now: number): VoiceConversationMemory | null {
  if (!memory || !contextIsFresh(context, now) || memory.fingerprint !== context.fingerprint
    || !Number.isFinite(memory.expiresAt) || memory.expiresAt <= now
    || memory.expiresAt > now + MEMORY_DURATION_MS) return null;
  if (memory.lastDeviceIds.length && !currentTargets(memory.lastDeviceIds, context)) return null;
  if (memory.pendingClarification) {
    const pending = memory.pendingClarification;
    const options = clarificationOptions(pending.question, context);
    if (memory.lastDeviceIds.length || !pending.choices.length || pending.choices.length > MAX_CONCIERGE_DEVICES
      || new Set(pending.choices.map((choice) => choice.id)).size !== pending.choices.length
      || options.length !== pending.choices.length
      || pending.choices.some((choice) => !options.some((option) => option.id === choice.id && sameIds(option.deviceIds, choice.deviceIds)))) return null;
  } else if (!memory.lastDeviceIds.length) return null;
  return memory;
}

/** Recreate display text from current names; no saved transcript or cached labels grant authority. */
export function currentVoiceClarification(memory: VoiceConversationMemory | null, context: AssistantContext, now = Date.now()): VoiceClarification | null {
  const valid = validMemory(memory, context, now);
  if (!valid?.pendingClarification) return null;
  const options = clarificationOptions(valid.pendingClarification.question, context);
  const names = options.slice(0, SPOKEN_CHOICE_COUNT).map((option) => option.label.slice(0, 240)).join(', ');
  const remaining = options.length > SPOKEN_CHOICE_COUNT ? ', or another permitted room or device' : '';
  return { question: `Which room or device do you mean: ${names}${remaining}? Say its name or choose on screen. Nothing changed.`,
    choices: options.map(({ id, label }) => ({ id, label, reply: id })) };
}

/** Resolve room vocabulary with the same ambiguity checks as commands, without relying on the original wording. */
function spokenRoom(question: string, options: ClarificationOption[], context: AssistantContext): string | null {
  const definitions = context.devices.flatMap((device) => {
    const definition = getDevice(device.modelDeviceId);
    return definition ? [{ ...definition, name: device.name }] : [];
  });
  const rooms = context.availableRooms.flatMap((room) => {
    const device = context.devices.find((item) => item.roomId === room.id);
    const modelRoomId = device && getDevice(device.modelDeviceId)?.roomId;
    return modelRoomId ? [{ id: modelRoomId, name: room.name }] : [];
  });
  const kinds = new Set(options.filter((option) => option.id.startsWith('room:'))
    .map((option) => context.devices.find((device) => device.id === option.deviceIds[0])?.kind));
  const matchingRooms = new Set<string>();
  for (const kind of kinds) {
    if (!kind) continue;
    const action = kind === 'blinds' ? 'open blinds' : `turn ${kind === 'light' ? 'lights' : kind === 'ac' ? 'air conditioning' : kind} on`;
    // This is a vocabulary probe only: the stored command is separately rebuilt and checked for current permission.
    const probe = parseHomeVoiceCommand(`${action} in ${question.replace(/^(?:in|for) /, '')}`, { devices: definitions, rooms });
    if ('error' in probe) continue;
    for (const id of probe.command.deviceIds) {
      const device = context.devices.find((item) => item.modelDeviceId === id);
      if (device) matchingRooms.add(device.roomId);
    }
  }
  return matchingRooms.size === 1 ? [...matchingRooms][0] : null;
}

/** Accept only an exact displayed identity/name or an unambiguous currently permitted room alias. */
function chosenOption(question: string, options: ClarificationOption[], context: AssistantContext): ClarificationOption | null {
  const identified = options.find((option) => question.trim() === option.id);
  if (identified) return identified;
  const text = normalizeSingleVoiceCommand(question);
  if (!text || /^(?:turn|switch|set|dim|open|close|make|run|start|stop|activate|deactivate)\b/.test(text)) return null;
  const roomId = spokenRoom(text, options, context);
  const matching = options.filter((option) => option.id === `room:${roomId}`
    || (option.id.startsWith('device:') && (text === normalizeVoiceText(option.label)
      || text === normalizeVoiceText(context.devices.find((device) => device.id === option.deviceIds[0])?.name ?? ''))));
  return matching.length === 1 ? matching[0] : null;
}

/** Identify only bounded pronoun grammar, leaving qualifiers and compound commands unresolved. */
function followUpCommand(question: string, targets: AssistantDevice[]): CommandResolution | null {
  const text = normalizeSingleVoiceCommand(question);
  if (!text || !targets.length) return null;
  const power = text.match(/^(?:turn|switch) (?:(it|them) (on|off)|(on|off) (it|them))$/);
  const setting = text.match(/^set (it|them) to (.+?) (percent|%|degrees(?: celsius)?|celsius)$/);
  const relative = text.match(/^make (it|them) (brighter|dimmer)$/);
  const pronoun = power?.[1] ?? power?.[4] ?? setting?.[1] ?? relative?.[1];
  if (!pronoun || (pronoun === 'it' && targets.length !== 1)) return null;
  const deviceIds = targets.map((device) => device.modelDeviceId);
  let command: HomeVoiceCommand;
  let description: string;
  if (power) {
    const on = (power[2] ?? power[3]) === 'on';
    command = { type: 'power', deviceIds, on };
    description = `${targets.length === 1 ? targets[0].name : `${targets.length} devices`} turned ${on ? 'on' : 'off'}`;
  } else if (relative) {
    command = { type: 'brightness-adjustment', deviceIds, delta: relative[2] === 'brighter' ? 10 : -10 };
    description = `Brightness adjusted ${relative[2] === 'brighter' ? 'up' : 'down'} by up to 10 percentage points`;
  } else if (setting) {
    const value = spokenWholeNumber(setting[2]);
    if (value === null) return null;
    const type = /^(?:degrees|celsius)/.test(setting[3]) ? 'temperature' : 'brightness';
    command = { type, deviceIds, value };
    description = `${targets.length === 1 ? targets[0].name : `${targets.length} devices`} set to ${value}${type === 'temperature' ? '°C' : '%'}`;
  } else return null;
  return { kind: 'command', command, description, deviceIds: targets.map((device) => device.id) };
}

/** Restrict a wake-free continuation window to recognized follow-ups and explicit clarification replies. */
export function isVoiceFollowUp(question: string, memory: VoiceConversationMemory | null, context: AssistantContext, now = Date.now()): boolean {
  const valid = validMemory(memory, context, now);
  if (!valid) return false;
  if (CANCEL.test(normalizeVoiceText(question))) return true;
  if (valid.pendingClarification) return chosenOption(question,
    clarificationOptions(valid.pendingClarification.question, context), context) !== null;
  const targets = currentTargets(valid.lastDeviceIds, context);
  const resolution = targets ? followUpCommand(question, targets) : null;
  return resolution !== null && commandIsCurrent(resolution, context);
}

/** Offer a continuation window only while a complete target or clarification remains currently valid. */
export function hasVoiceFollowUp(memory: VoiceConversationMemory | null, context: AssistantContext, now = Date.now()): boolean {
  return validMemory(memory, context, now) !== null;
}

/** Produce an ordinary local reply without retaining targets for an unrelated or unsuccessful request. */
function reply(answer: string): VoiceConversationResult {
  return { resolution: { kind: 'reply', response: localVoiceReply(answer) }, memory: null, followUpEligible: false };
}

/** Resolve one final utterance with short-lived references; execution and successful-target memory remain separate. */
export function resolveVoiceConversation(question: string, context: AssistantContext, memory: VoiceConversationMemory | null, now = Date.now()): VoiceConversationResult {
  if (!contextIsFresh(context, now)) return reply(context.reason || 'Your home access or saved readings changed. Please try again.');
  const text = normalizeVoiceText(question).replace(/^(?:can|could|would|will) you /, '');
  const valid = validMemory(memory, context, now);
  if (CANCEL.test(text)) return reply('Okay, nothing changed.');
  const resolution = resolveLocalAssistantVoice(question, context);
  if (valid?.pendingClarification) {
    const options = clarificationOptions(valid.pendingClarification.question, context);
    const selected = chosenOption(question, options, context);
    if (selected) return { resolution: selected.resolution, memory: null, followUpEligible: true };
    // A new request cancels the pending one; a vague answer never replays any part of it.
    if (resolution.kind === 'cloud' && !/^(?:turn|switch|set|dim|open|close|make|run|start|stop|activate|deactivate|draft|create|what|which|how|where|when|why|who|are|is|give|do|can|could|would|will|tell|explain|help|list|suggest|recommend|show|find|remind|check)\b/.test(text)) {
      const clarification = currentVoiceClarification(valid, context, now)!;
      return { resolution: { kind: 'reply', response: localVoiceReply(clarification.question) }, memory: valid, clarification, followUpEligible: true };
    }
  }
  const pronoun = /^(?:(?:turn|switch) (?:(?:it|them)\b|(?:on|off) (?:it|them)\b)|(?:set|make) (?:it|them)\b)/.test(text);
  if (pronoun) {
    let targets = valid && !valid.pendingClarification ? currentTargets(valid.lastDeviceIds, context) : null;
    // A selected-room temperature target is unambiguous only when exactly one AC is currently available.
    if (!targets && memory === null && context.roomId !== null && /^set it to .+ (?:degrees(?: celsius)?|celsius)$/.test(text)) {
      const climate = context.devices.filter((device) => device.kind === 'ac' && device.controllable);
      if (climate.length === 1) targets = climate;
    }
    const resolution = targets ? followUpCommand(question, targets) : null;
    return resolution && commandIsCurrent(resolution, context)
      ? { resolution, memory: null, followUpEligible: true }
      : reply('Please name the room and device again. Nothing changed.');
  }
  if (resolution.kind === 'command') return commandIsCurrent(resolution, context)
    ? { resolution, memory: null, followUpEligible: true }
    : reply('Those controls are no longer available. Nothing changed.');
  const options = resolution.kind === 'reply' ? clarificationOptions(question, context) : [];
  if (!options.length) return { resolution, memory: null, followUpEligible: false };
  const pending: VoiceConversationMemory = { fingerprint: context.fingerprint,
    expiresAt: Math.min(now + MEMORY_DURATION_MS, context.expiresAt ?? Infinity), lastDeviceIds: [],
    pendingClarification: { question, choices: options.map(({ id, deviceIds }) => ({ id, deviceIds })) } };
  const clarification = currentVoiceClarification(pending, context, now)!;
  return { resolution: { kind: 'reply', response: localVoiceReply(clarification.question) }, memory: pending, clarification, followUpEligible: true };
}
