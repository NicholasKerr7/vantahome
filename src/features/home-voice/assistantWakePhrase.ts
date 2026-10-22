export type AssistantWakePhrase = { question: string };

/** Match only a leading, complete wake phrase; incidental mentions and near-matches never submit audio. */
export function parseAssistantWakePhrase(transcript: string): AssistantWakePhrase | null {
  const text = transcript.trim();
  const match = /^(?:hey\s+vanta\s*home|hey\s+vanta|vanta)(?=$|[\s,.!?:;])([\s\S]*)$/iu.exec(text);
  if (!match) return null;
  return { question: match[1].replace(/^[\s,.!?:;]+/u, '').trim() };
}

/** Accept one bounded utterance without truncating a request into an unintended instruction. */
export function assistantSpokenQuestion(value: string): string | null {
  const text = value.trim();
  return text.length > 0 && text.length <= 600 && !/[\u0000-\u001f\u007f]/u.test(text) ? text : null;
}
