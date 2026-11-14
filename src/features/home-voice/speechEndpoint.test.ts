import { createSpeechEndpoint, SPEECH_FINAL_WAIT_MS, SPEECH_QUIET_MS } from './speechEndpoint';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** Model a native recognizer without turning provisional hypotheses into device commands. */
function setup(platform: 'ios' | 'android' = 'ios') {
  const callbacks = { stopNative: jest.fn().mockResolvedValue(undefined), onFinal: jest.fn(), onIncomplete: jest.fn() };
  return { ...callbacks, endpoint: createSpeechEndpoint({ platform, mayFinish: (text) => text.startsWith('Vanta'), ...callbacks }) };
}

test('stable text requests finalization after one second, but only confirmed final text is delivered', () => {
  const s = setup();
  s.endpoint.results('Vanta turn kitchen lights on');
  jest.advanceTimersByTime(SPEECH_QUIET_MS);
  expect(s.stopNative).toHaveBeenCalledTimes(1); expect(s.onFinal).not.toHaveBeenCalled();
  s.endpoint.results('Vanta turn kitchen lights off');
  s.endpoint.recognized(true);
  expect(s.onFinal).toHaveBeenCalledWith('Vanta turn kitchen lights off');
  s.endpoint.end(); s.endpoint.recognized(true); jest.runOnlyPendingTimers();
  expect(s.onFinal).toHaveBeenCalledTimes(1); expect(s.onIncomplete).not.toHaveBeenCalled();
});

test('changed hypotheses reset the quiet deadline; duplicates do not postpone it', () => {
  const s = setup(); s.endpoint.results('Vanta turn on'); jest.advanceTimersByTime(800);
  s.endpoint.results('Vanta turn on kitchen lights'); jest.advanceTimersByTime(800);
  s.endpoint.results('Vanta turn on kitchen lights'); jest.advanceTimersByTime(200);
  expect(s.stopNative).toHaveBeenCalledTimes(1); expect(s.onFinal).not.toHaveBeenCalled(); s.endpoint.dispose();
});

test('missing final confirmation fails safely instead of executing a partial instruction', () => {
  const s = setup(); s.endpoint.results('Vanta turn on lights'); s.endpoint.end();
  jest.advanceTimersByTime(SPEECH_FINAL_WAIT_MS);
  expect(s.onIncomplete).toHaveBeenCalledWith(true); expect(s.onFinal).not.toHaveBeenCalled();
  s.endpoint.recognized(true); expect(s.onFinal).not.toHaveBeenCalled();
});

test('ambient text does not shorten a wake cycle and disposal cancels pending finalization', () => {
  const s = setup(); s.endpoint.results('Someone mentioned Vanta'); jest.advanceTimersByTime(1500);
  expect(s.stopNative).not.toHaveBeenCalled(); s.endpoint.results('Vanta lights off'); s.endpoint.dispose();
  jest.runOnlyPendingTimers(); s.endpoint.recognized(true);
  expect(s.onFinal).not.toHaveBeenCalled(); expect(s.onIncomplete).not.toHaveBeenCalled();
});

test('Android partial and end events wait for its final results callback', () => {
  const s = setup('android'); s.endpoint.partial('Vanta lights on'); s.endpoint.end();
  expect(s.onFinal).not.toHaveBeenCalled(); s.endpoint.results('Vanta turn lights off');
  expect(s.onFinal).toHaveBeenCalledWith('Vanta turn lights off');
});
