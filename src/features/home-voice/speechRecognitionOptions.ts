export type SpeechRecognitionOptions = { contextualStrings?: readonly string[] };

/** Bound permitted property vocabulary before handing hints to the phone's speech service. */
export function speechRecognitionOptions(options: SpeechRecognitionOptions = {}) {
  const contextualStrings: string[] = [];
  const seen = new Set<string>();
  let totalLength = 0;
  for (const candidate of ['Vanta', 'VantaHome', 'Hey Vanta', 'Hey VantaHome', ...(options.contextualStrings ?? [])]) {
    if (typeof candidate !== 'string') continue;
    const phrase = candidate.trim().replace(/\s+/gu, ' ');
    const key = phrase.toLocaleLowerCase('en-US');
    if (!phrase || phrase.length > 80 || /[\u0000-\u001f\u007f]/u.test(candidate) || seen.has(key)) continue;
    if (contextualStrings.length >= 64 || totalLength + phrase.length > 2_048) break;
    seen.add(key);
    contextualStrings.push(phrase);
    totalLength += phrase.length;
  }
  return { contextualStrings };
}
