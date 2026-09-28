import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import Voice from '@react-native-voice/voice';
import { useVoiceRecognition } from './useVoiceRecognition';

jest.mock('@react-native-voice/voice', () => ({
  __esModule: true, default: {
    isAvailable: jest.fn().mockResolvedValue(1), start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined), cancel: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined), removeAllListeners: jest.fn(),
  },
}));

/** Drain the serialized native recognition queue without using real microphone hardware. */
async function settle(): Promise<void> { await act(async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); }); }

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('accepts final results after speech ends and executes only once despite duplicate callbacks', async () => {
  const run = jest.fn();
  const hook = renderHook(() => useVoiceRecognition(run));
  await act(async () => { await hook.result.current.start(); });
  act(() => { Voice.onSpeechEnd({}); Voice.onSpeechResults({ value: ['turn on kitchen lights'] }); });
  act(() => { jest.advanceTimersByTime(400); });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith('turn on kitchen lights');
  act(() => { Voice.onSpeechEnd({}); Voice.onSpeechResults({ value: ['turn off all lights'] }); jest.advanceTimersByTime(1000); });
  expect(run).toHaveBeenCalledTimes(1);
  expect(hook.result.current.listening).toBe(false);
  hook.unmount(); await settle();
});

test('backgrounding cancels speech before late recognition results can run a command', async () => {
  let change!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, receive) => { change = receive; return { remove: jest.fn() }; });
  const run = jest.fn(); const hook = renderHook(() => useVoiceRecognition(run));
  await act(async () => { await hook.result.current.start(); });
  act(() => { Voice.onSpeechResults({ value: ['open entry gate'] }); change('background'); Voice.onSpeechEnd({}); jest.advanceTimersByTime(500); });
  await settle();
  expect(Voice.cancel).toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  expect(hook.result.current.listening).toBe(false);
  hook.unmount(); await settle();
});

test('closing during asynchronous startup cannot leave the microphone listening', async () => {
  let startComplete!: () => void;
  jest.mocked(Voice.start).mockImplementationOnce(() => new Promise((resolve) => { startComplete = () => resolve(undefined); }));
  const run = jest.fn(); const hook = renderHook(() => useVoiceRecognition(run));
  act(() => { void hook.result.current.start(); });
  await settle();
  hook.unmount();
  await act(async () => { startComplete(); });
  await settle();
  expect(Voice.cancel).toHaveBeenCalled();
  expect(Voice.destroy).toHaveBeenCalled();
  act(() => { Voice.onSpeechResults({ value: ['turn off all lights'] }); Voice.onSpeechEnd({}); jest.advanceTimersByTime(1000); });
  expect(run).not.toHaveBeenCalled();
});

test('reports unavailable recognition and keeps typed commands available', async () => {
  jest.mocked(Voice.isAvailable).mockResolvedValueOnce(0);
  const hook = renderHook(() => useVoiceRecognition(jest.fn()));
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.error).toContain('type a command');
  expect(hook.result.current.listening).toBe(false);
  hook.unmount(); await settle();
});

test('releases native event subscriptions between taps so a second recording receives fresh callbacks', async () => {
  type Handlers = { results: typeof Voice.onSpeechResults; end: typeof Voice.onSpeechEnd };
  let nativeHandlers: Handlers | null = null;
  // Match the library: start reuses its event subscriptions until destroy removes them.
  jest.mocked(Voice.start).mockImplementation(async () => {
    nativeHandlers ??= { results: Voice.onSpeechResults, end: Voice.onSpeechEnd };
  });
  jest.mocked(Voice.destroy).mockImplementation(async () => { nativeHandlers = null; });
  const run = jest.fn(); const hook = renderHook(() => useVoiceRecognition(run));
  for (const phrase of ['turn on kitchen lights', 'turn off kitchen lights']) {
    await act(async () => { await hook.result.current.start(); });
    act(() => {
      const handlers = nativeHandlers as Handlers | null;
      if (!handlers) throw new Error('Expected native subscriptions');
      handlers.results({ value: [phrase] }); handlers.end({}); jest.advanceTimersByTime(400);
    });
    await settle();
  }
  expect(run.mock.calls).toEqual([['turn on kitchen lights'], ['turn off kitchen lights']]);
  expect(Voice.destroy).toHaveBeenCalledTimes(2);
  hook.unmount(); await settle();
  jest.mocked(Voice.start).mockResolvedValue(undefined);
  jest.mocked(Voice.destroy).mockResolvedValue(undefined);
});

test('preserves first-use recognition while an iOS permission sheet transitions inactive to active', async () => {
  let change!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, receive) => { change = receive; return { remove: jest.fn() }; });
  jest.mocked(Voice.start).mockImplementationOnce(async () => {
    change('inactive');
    await Promise.resolve();
    change('active');
  });
  const run = jest.fn(); const hook = renderHook(() => useVoiceRecognition(run));
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.listening).toBe(true);
  expect(Voice.cancel).not.toHaveBeenCalled();
  act(() => { Voice.onSpeechResults({ value: ['turn on kitchen lights'] }); Voice.onSpeechEnd({}); jest.advanceTimersByTime(400); });
  expect(run).toHaveBeenCalledWith('turn on kitchen lights');
  hook.unmount(); await settle();
});
