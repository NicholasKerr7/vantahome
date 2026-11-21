import { normalizeSingleVoiceCommand, normalizeVoiceText } from '../home-voice/voiceCommandLanguage';

/** Recognize a deliberate correction without removing negations from an ordinary command. */
export function hasVoiceCorrectionPrefix(input: string): boolean {
  return /^(?:no|i meant|i mean|actually)\b/.test(normalizeVoiceText(input));
}

/** Remove at most one correction prefix from a strictly bounded room/device answer. */
export function normalizeVoiceChoice(input: string): string | null {
  const text = normalizeSingleVoiceCommand(input);
  return text === null ? null : text.replace(/^(?:no|i meant|i mean|actually) /, '');
}

/** Allow an explicit change of setting while retaining all strict single-command checks. */
export function normalizeVoiceFollowUp(input: string): string | null {
  const text = normalizeSingleVoiceCommand(input);
  return text === null ? null : text.replace(/^actually /, '');
}
