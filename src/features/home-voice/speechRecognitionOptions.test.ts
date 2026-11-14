import { speechRecognitionOptions } from './speechRecognitionOptions';

test('keeps wake names first, drops controls and duplicates, and bounds speech-service context', () => {
  const phrases = speechRecognitionOptions({ contextualStrings: ['VANTA', 'Kitchen', 'kitchen', 'bad\nname', 'x'.repeat(81), ...Array.from({ length: 200 }, (_, i) => `Permitted room fixture ${i}`)] }).contextualStrings;
  expect(phrases.slice(0, 5)).toEqual(['Vanta', 'VantaHome', 'Hey Vanta', 'Hey VantaHome', 'Kitchen']);
  expect(phrases).not.toContain('bad name'); expect(phrases.length).toBeLessThanOrEqual(64);
  expect(phrases.join('').length).toBeLessThanOrEqual(2048);
});
