/** Normalize speech punctuation without turning a negative numeric request into a positive one. */
export function normalizeVoiceText(input: string): string {
  return input.toLowerCase().replace(/&/g, ' and ').replace(/_/g, ' ').replace(/(?<=\w)-(?=\w)/g, ' ')
    .replace(/[!?]/g, '').replace(/[.,](?=\s|$)/g, '').replace(/\b(?:please|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Match whole phrases; neither partial room names nor near-matching sensitive devices are accepted. */
export function hasVoicePhrase(input: string, phrase: string): boolean {
  return (` ${input} `).includes(` ${phrase} `);
}

const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Read a single complete numeric value; homophones, fractions and mixed instructions remain unresolved. */
export function spokenWholeNumber(value: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }
  if (value === 'one hundred' || value === 'a hundred' || value === 'hundred') return 100;
  const small = SMALL_NUMBERS.indexOf(value);
  if (small >= 0) return small;
  const [tens, units, ...extra] = value.split(' ');
  const tensIndex = TENS.indexOf(tens);
  const unitIndex = SMALL_NUMBERS.indexOf(units ?? 'zero');
  return tensIndex >= 0 && unitIndex >= 0 && unitIndex <= 9 && extra.length === 0
    ? (tensIndex + 2) * 10 + unitIndex : null;
}

/** Allow courteous command prefixes while refusing qualifiers that could reverse or delay an action. */
export function normalizeSingleVoiceCommand(input: string): string | null {
  if (!input.trim() || input.length > 240 || /[\u0000-\u001f\u007f]/u.test(input)) return null;
  const phrase = normalizeVoiceText(input).replace(/^(?:can|could|would|will) you /, '');
  if (/\b(?:not|never|except|unless|if|without|after|before|later|tomorrow|instead|but)\b/.test(phrase)
    || /\b(?:don['’]t|do not)\b/.test(phrase)
    || /\b(?:and|then|also)\s+(?:turn|switch|open|close|set|dim|run|activate|unlock|lock)\b/.test(phrase)) return null;
  return phrase;
}
