import { DEVICES } from '../../../packages/home-scene/src/data';
import { parseHomeVoiceCommand } from './voiceCommandParser';

test('targets the room lights, including fixtures absent from the original demo dashboard', () => {
  expect(parseHomeVoiceCommand('Please turn on the kitchen lights.')).toMatchObject({ command: { type: 'power', on: true, deviceIds: ['kitchen-light', 'dining-light'] } });
  expect(parseHomeVoiceCommand('Switch southeast suite lights off')).toMatchObject({ command: { type: 'power', on: false, deviceIds: ['bedroom-4-light', 'bedroom-4-bedside-left', 'bedroom-4-bedside-right'] } });
  expect(parseHomeVoiceCommand('turn off all lights')).toMatchObject({ command: { deviceIds: DEVICES.filter((device) => device.kind === 'light').map((device) => device.id) } });
});

test('uses exact device names or ids without silently selecting another room', () => {
  expect(parseHomeVoiceCommand('Turn on the primary suite left bedside lamp')).toMatchObject({ command: { deviceIds: ['master-bedside-left'] } });
  expect(parseHomeVoiceCommand('Turn off bedroom-3-bedside-right')).toMatchObject({ command: { deviceIds: ['bedroom-3-bedside-right'] } });
  expect(parseHomeVoiceCommand('Turn off ceiling light')).toHaveProperty('error');
  expect(parseHomeVoiceCommand('Turn off lights')).toHaveProperty('error');
  expect(parseHomeVoiceCommand('Turn off kitchen')).toHaveProperty('error');
});

test('supports bounded brightness, Celsius temperatures, and meaningful open/close actions', () => {
  expect(parseHomeVoiceCommand('Set primary suite lights to 40 percent')).toMatchObject({ command: { type: 'brightness', value: 40 } });
  expect(parseHomeVoiceCommand('Set northwest suite temperature to 22 degrees Celsius')).toMatchObject({ command: { type: 'temperature', value: 22, deviceIds: ['bedroom-1-ac'] } });
  expect(parseHomeVoiceCommand('Set primary suite air conditioning temperature to 21')).toMatchObject({ command: { type: 'temperature', value: 21 } });
  expect(parseHomeVoiceCommand('Open primary suite blinds')).toMatchObject({ command: { type: 'position', value: 100, deviceIds: ['master-blinds'] } });
  expect(parseHomeVoiceCommand('Close entry gate')).toMatchObject({ command: { type: 'position', value: 0, deviceIds: ['entry-gate'] } });
});

test.each([
  'set kitchen lights to 2.2 percent', 'set primary suite ac to 2.2 degrees', 'set kitchen lights to 150 percent', 'set primary suite ac to 30 degrees', 'set primary suite ac to 22 percent',
  'set family tv to 50 percent', 'open kitchen lights', 'turn off gas leak detector',
  'turn off smart gas meter', 'turn off entry camera', 'turn off primary suite blinds',
  'turn on kitchen lights and open entry gate', 'delete all devices', 'x'.repeat(241),
])('rejects unsupported or unsafe-to-guess commands: %s', (phrase) => {
  expect(parseHomeVoiceCommand(phrase)).toHaveProperty('error');
});
