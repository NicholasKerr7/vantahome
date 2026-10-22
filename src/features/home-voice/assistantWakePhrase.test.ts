import { assistantSpokenQuestion, parseAssistantWakePhrase } from './assistantWakePhrase';

test.each(['Hey VantaHome, give me a brief', 'hey vanta home give me a brief', 'Hey Vanta: give me a brief', 'Vanta give me a brief'])('accepts a complete leading wake phrase: %s', (text) => {
  expect(parseAssistantWakePhrase(text)).toEqual({ question: 'give me a brief' });
});

test.each(['Avanta give me a brief', 'I told Vanta give me a brief', 'Vantastic lights', 'hey Vantahomes lights', 'turn on all lights'])('ignores ambient or near-match speech: %s', (text) => {
  expect(parseAssistantWakePhrase(text)).toBeNull();
});

test('wake-only permits a separate question, while malformed questions are not truncated', () => {
  expect(parseAssistantWakePhrase('Vanta!')).toEqual({ question: '' });
  expect(assistantSpokenQuestion('  show this room  ')).toBe('show this room');
  expect(assistantSpokenQuestion('x'.repeat(601))).toBeNull();
  expect(assistantSpokenQuestion('hello\u0000there')).toBeNull();
  expect(assistantSpokenQuestion(' ')).toBeNull();
});
