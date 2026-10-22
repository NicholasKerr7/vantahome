import { act, renderHook } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import Voice from '@react-native-voice/voice';
import * as Speech from 'expo-speech';
import { useForegroundAssistantVoice } from './useForegroundAssistantVoice';
import { useVoiceRecognition } from './useVoiceRecognition';

jest.mock('@react-native-voice/voice', () => ({ __esModule: true, default: {
  isAvailable: jest.fn().mockResolvedValue(1), start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined), cancel: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined), removeAllListeners: jest.fn(),
} }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn().mockResolvedValue(undefined) }));

let appStateCallbacks: Set<(state: AppStateStatus) => void>;
const initialPlatform = Platform.OS;

/** Drain only promise work; recognition/retry deadlines remain controlled explicitly by each test. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 40; index += 1) await Promise.resolve(); });
}

/** Emit one final utterance using native event ordering, including the final-result grace period. */
async function say(text: string): Promise<void> {
  act(() => { Voice.onSpeechResults({ value: [text] }); Voice.onSpeechEnd({}); jest.advanceTimersByTime(400); });
  await settle();
}

/** Move all mounted speech owners through the same native lifecycle event. */
function changeAppState(next: AppStateStatus): void {
  AppState.currentState = next;
  for (const callback of appStateCallbacks) callback(next);
}

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  jest.clearAllMocks(); Platform.OS = 'ios'; AppState.currentState = 'active';
  jest.mocked(Voice.isAvailable).mockResolvedValue(1);
  jest.mocked(Voice.start).mockResolvedValue(undefined);
  jest.mocked(Voice.stop).mockResolvedValue(undefined);
  jest.mocked(Voice.cancel).mockResolvedValue(undefined);
  jest.mocked(Voice.destroy).mockResolvedValue(undefined);
  jest.mocked(Speech.stop).mockResolvedValue(undefined);
  appStateCallbacks = new Set();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => {
    appStateCallbacks.add(callback); return { remove: () => appStateCallbacks.delete(callback) };
  });
});
afterEach(() => { Platform.OS = initialPlatform; jest.restoreAllMocks(); jest.useRealTimers(); });

test('requires explicit opt-in, ignores ambient phrases, then sends one wake-prefixed question after microphone release', async () => {
  const onQuestion = jest.fn();
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  expect(Voice.start).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.start(); });
  const sessionToken = hook.result.current.readSessionToken();
  await say('I told Vanta to turn on lights');
  expect(onQuestion).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(500); }); await settle();
  await say('Hey VantaHome, make this room calm');
  expect(onQuestion).toHaveBeenCalledTimes(1);
  expect(onQuestion).toHaveBeenCalledWith('make this room calm', sessionToken);
  expect(jest.mocked(Voice.destroy).mock.invocationCallOrder.at(-1)).toBeLessThan(onQuestion.mock.invocationCallOrder[0]);
  expect(hook.result.current.phase).toBe('waiting');
  act(() => { Voice.onSpeechResults({ value: ['Vanta another question'] }); Voice.onSpeechEnd({}); jest.advanceTimersByTime(1000); });
  expect(onQuestion).toHaveBeenCalledTimes(1);
  hook.unmount(); await settle();
});

test('wake-only opens a bounded second utterance and does not require repeating the wake phrase', async () => {
  const onQuestion = jest.fn();
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  await act(async () => { await hook.result.current.start(); });
  await say('Vanta');
  expect(hook.result.current.phase).toBe('capturing');
  act(() => { jest.advanceTimersByTime(500); }); await settle();
  await say('which lights are on in this room');
  expect(onQuestion).toHaveBeenCalledWith('which lights are on in this room', hook.result.current.readSessionToken());
  hook.unmount(); await settle();
});

test.each(['inactive', 'background'] as const)('%s revokes consent and stale transcripts cannot send or restart on foreground', async (state) => {
  const onQuestion = jest.fn();
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  await act(async () => { await hook.result.current.start(); });
  const sessionToken = hook.result.current.readSessionToken();
  const lateResults = Voice.onSpeechResults; const lateEnd = Voice.onSpeechEnd;
  act(() => { changeAppState(state); lateResults({ value: ['Vanta send this'] }); lateEnd({}); jest.advanceTimersByTime(1000); changeAppState('active'); });
  await settle();
  expect(hook.result.current.enabled).toBe(false);
  expect(hook.result.current.isSessionCurrent(sessionToken)).toBe(false);
  expect(onQuestion).not.toHaveBeenCalled();
  expect(Voice.start).toHaveBeenCalledTimes(1);
  hook.unmount(); await settle();
});

test.each([{ scopeKey: 'guest-home', allowed: true }, { scopeKey: 'owner-home', allowed: false }])('scope loss or revoked permission discards pending results: %p', async (next) => {
  const onQuestion = jest.fn();
  const hook = renderHook((props: { scopeKey: string; allowed: boolean }) => useForegroundAssistantVoice({ ...props, onQuestion }), { initialProps: { scopeKey: 'owner-home', allowed: true } });
  await act(async () => { await hook.result.current.start(); });
  const sessionToken = hook.result.current.readSessionToken();
  const lateResults = Voice.onSpeechResults; const lateEnd = Voice.onSpeechEnd;
  hook.rerender(next);
  act(() => { lateResults({ value: ['Vanta private question'] }); lateEnd({}); jest.advanceTimersByTime(1000); }); await settle();
  expect(onQuestion).not.toHaveBeenCalled(); expect(hook.result.current.enabled).toBe(false);
  expect(hook.result.current.isSessionCurrent(sessionToken)).toBe(false);
  hook.unmount(); await settle();
});

test('the original five-minute budget cannot be extended by retries or a wake question', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); });
  await say('Vanta tell me about my lights');
  act(() => { jest.advanceTimersByTime(5 * 60_000); }); await settle();
  expect(hook.result.current.enabled).toBe(false);
  expect(hook.result.current.error).toContain('five minutes');
  act(() => hook.result.current.resume()); await settle();
  expect(Voice.start).toHaveBeenCalledTimes(1);
  hook.unmount(); await settle();
});

test('native failures back off and stop after three consecutive errors', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); });
  for (let index = 0; index < 3; index += 1) {
    act(() => { Voice.onSpeechError({ error: { code: 'recognition_fail' } }); }); await settle();
    if (index < 2) { act(() => jest.advanceTimersByTime(1000 * 2 ** index)); await settle(); }
  }
  expect(Voice.start).toHaveBeenCalledTimes(3);
  expect(hook.result.current.enabled).toBe(false);
  expect(hook.result.current.error).toContain('Speech recognition stopped');
  hook.unmount(); await settle();
});

test('Android silence/no-match remains bounded normal listening rather than a permission retry', async () => {
  Platform.OS = 'android';
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); });
  for (let index = 0; index < 4; index += 1) {
    act(() => Voice.onSpeechError({ error: { code: '6' } })); await settle();
    act(() => jest.advanceTimersByTime(500)); await settle();
  }
  expect(hook.result.current.enabled).toBe(true);
  hook.unmount(); await settle();
});

test('TTS starts after native teardown and ignores its own words; completion resumes after a quiet gap', async () => {
  const onQuestion = jest.fn();
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  await act(async () => { await hook.result.current.start(); });
  const oldResults = Voice.onSpeechResults; const oldEnd = Voice.onSpeechEnd;
  await act(async () => { await hook.result.current.speak('Vanta can draft a scene. Nothing has run.'); });
  expect(hook.result.current.phase).toBe('speaking');
  expect(jest.mocked(Voice.destroy).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(Speech.speak).mock.invocationCallOrder[0]);
  act(() => { oldResults({ value: ['Vanta can draft a scene'] }); oldEnd({}); jest.advanceTimersByTime(1000); });
  expect(onQuestion).not.toHaveBeenCalled();
  const completion = jest.mocked(Speech.speak).mock.calls[0][1]?.onDone as (() => void) | undefined;
  act(() => { completion?.(); jest.advanceTimersByTime(799); }); await settle();
  expect(Voice.start).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1)); await settle();
  expect(Voice.start).toHaveBeenCalledTimes(2);
  hook.unmount(); await settle();
});

test('scope loss stops spoken private answers and a late speech completion cannot reopen the microphone', async () => {
  const hook = renderHook(({ scopeKey }: { scopeKey: string }) => useForegroundAssistantVoice({ scopeKey, allowed: true, onQuestion: jest.fn() }), { initialProps: { scopeKey: 'owner-home' } });
  await act(async () => { await hook.result.current.start(); await hook.result.current.speak('Only owner rooms.'); });
  const completion = jest.mocked(Speech.speak).mock.calls[0][1]?.onDone as (() => void) | undefined;
  hook.rerender({ scopeKey: 'guest-home' }); await settle();
  act(() => { completion?.(); jest.advanceTimersByTime(1000); }); await settle();
  expect(hook.result.current.enabled).toBe(false);
  expect(Speech.stop).toHaveBeenCalledTimes(2);
  expect(Voice.start).toHaveBeenCalledTimes(1);
  hook.unmount(); await settle();
});

test('tap dictation takes ownership and unmounting the old wake hook cannot destroy the new recognizer', async () => {
  const onQuestion = jest.fn(); const onDictation = jest.fn();
  const wake = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  const dictation = renderHook(() => useVoiceRecognition(onDictation));
  await act(async () => { await wake.result.current.start(); });
  const oldResults = Voice.onSpeechResults; const oldEnd = Voice.onSpeechEnd;
  await act(async () => { await dictation.result.current.start(); });
  expect(wake.result.current.enabled).toBe(false);
  wake.unmount(); await settle();
  expect(Voice.destroy).toHaveBeenCalledTimes(1);
  act(() => { oldResults({ value: ['Vanta stale question'] }); oldEnd({}); });
  await say('ordinary dictated question');
  expect(onQuestion).not.toHaveBeenCalled();
  expect(onDictation).toHaveBeenCalledWith('ordinary dictated question');
  dictation.unmount(); await settle();
});

test('unmount during pending startup releases microphone and never sends late words', async () => {
  let completeStart!: () => void;
  jest.mocked(Voice.start).mockImplementationOnce(() => new Promise((resolve) => { completeStart = () => resolve(undefined); }));
  const onQuestion = jest.fn();
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  act(() => { void hook.result.current.start(); }); await settle();
  hook.unmount();
  await act(async () => completeStart()); await settle();
  expect(Voice.cancel).toHaveBeenCalled(); expect(Voice.destroy).toHaveBeenCalled();
  act(() => { Voice.onSpeechResults({ value: ['Vanta stale'] }); Voice.onSpeechEnd({}); jest.advanceTimersByTime(1000); });
  expect(onQuestion).not.toHaveBeenCalled();
});

test('web and denied contexts never access recognition or TTS', async () => {
  Platform.OS = 'web';
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); await hook.result.current.speak('hello'); });
  expect(hook.result.current.supported).toBe(false);
  expect(Voice.start).not.toHaveBeenCalled(); expect(Speech.speak).not.toHaveBeenCalled();
  hook.unmount(); await settle();
});

test('an explicitly played reply works without enabling wake listening and does not turn the microphone on afterward', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.speak('Your permitted lights are off.'); });
  expect(hook.result.current.enabled).toBe(false);
  expect(hook.result.current.phase).toBe('speaking');
  expect(hook.result.current.readSessionToken()).toBeNull();
  expect(hook.result.current.isSessionCurrent(null)).toBe(false);
  const completion = jest.mocked(Speech.speak).mock.calls[0][1]?.onDone as (() => void) | undefined;
  act(() => { completion?.(); jest.advanceTimersByTime(1000); }); await settle();
  expect(Voice.start).not.toHaveBeenCalled();
  expect(hook.result.current.phase).toBe('off');
  hook.unmount(); await settle();
});

test('replacing a spoken reply invalidates its old completion before the next reply starts', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); await hook.result.current.speak('First answer.'); });
  const oldCompletion = jest.mocked(Speech.speak).mock.calls[0][1]?.onStopped as (() => void) | undefined;
  jest.mocked(Speech.stop).mockImplementationOnce(async () => { oldCompletion?.(); });
  await act(async () => { await hook.result.current.speak('Replacement answer.'); });
  act(() => jest.advanceTimersByTime(1000)); await settle();
  expect(Voice.start).toHaveBeenCalledTimes(1);
  expect(hook.result.current.phase).toBe('speaking');
  hook.unmount(); await settle();
});

test('revocation during native teardown prevents the captured question from entering Ask', async () => {
  let finishCancel!: () => void;
  const onQuestion = jest.fn();
  const hook = renderHook(({ allowed }: { allowed: boolean }) => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed, onQuestion }), { initialProps: { allowed: true } });
  await act(async () => { await hook.result.current.start(); });
  jest.mocked(Voice.cancel).mockImplementationOnce(() => new Promise((resolve) => { finishCancel = () => resolve(undefined); }));
  await say('Vanta send private information');
  expect(onQuestion).not.toHaveBeenCalled();
  hook.rerender({ allowed: false });
  await act(async () => finishCancel()); await settle();
  expect(onQuestion).not.toHaveBeenCalled();
  expect(hook.result.current.enabled).toBe(false);
  hook.unmount(); await settle();
});

test('silent second-stage capture expires without creating a request', async () => {
  const onQuestion = jest.fn();
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion }));
  await act(async () => { await hook.result.current.start(); });
  await say('Vanta');
  act(() => jest.advanceTimersByTime(500)); await settle();
  act(() => jest.advanceTimersByTime(10_000)); await settle();
  act(() => jest.advanceTimersByTime(400)); await settle();
  expect(Voice.stop).toHaveBeenCalledTimes(1);
  expect(onQuestion).not.toHaveBeenCalled();
  expect(hook.result.current.phase).toBe('listening');
  hook.unmount(); await settle();
});

test('pausing a spoken reply stops output and invalidates completion without resuming listening', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); await hook.result.current.speak('A private answer.'); });
  const completion = jest.mocked(Speech.speak).mock.calls[0][1]?.onDone as (() => void) | undefined;
  act(() => hook.result.current.pause()); await settle();
  act(() => { completion?.(); jest.advanceTimersByTime(1000); }); await settle();
  expect(Speech.stop).toHaveBeenCalledTimes(2);
  expect(hook.result.current.enabled).toBe(true);
  expect(hook.result.current.phase).toBe('waiting');
  expect(Voice.start).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.resume()); await settle();
  expect(Voice.start).toHaveBeenCalledTimes(2);
  hook.unmount(); await settle();
});

test('oversized spoken output reports a visible fallback and keeps listening paused', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); await hook.result.current.speak('x'.repeat(1601)); });
  expect(Speech.speak).not.toHaveBeenCalled();
  expect(hook.result.current.phase).toBe('waiting');
  expect(hook.result.current.error).toContain('Read the answer on screen');
  hook.unmount(); await settle();
});

test('callbacks retained from an unmounted voice surface cannot preempt a new microphone owner', async () => {
  const old = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'old-home', allowed: true, onQuestion: jest.fn() }));
  const oldStart = old.result.current.start; const oldSpeak = old.result.current.speak;
  old.unmount(); await settle();
  const onDictation = jest.fn(); const active = renderHook(() => useVoiceRecognition(onDictation));
  await act(async () => { await active.result.current.start(); await oldStart(); await oldSpeak('Stale private reply.'); });
  await say('the new session');
  expect(onDictation).toHaveBeenCalledWith('the new session');
  expect(Speech.speak).not.toHaveBeenCalled();
  active.unmount(); await settle();
});

test('a session token survives pause and TTS but Stop and a fresh opt-in revoke queued work', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  expect(hook.result.current.readSessionToken()).toBeNull();
  expect(hook.result.current.isSessionCurrent(null)).toBe(false);
  await act(async () => { await hook.result.current.start(); });
  const first = hook.result.current.readSessionToken();
  expect(first).not.toBeNull();
  expect(hook.result.current.isSessionCurrent(first)).toBe(true);
  act(() => hook.result.current.pause()); await settle();
  expect(hook.result.current.readSessionToken()).toBe(first);
  act(() => hook.result.current.resume()); await settle();
  await act(async () => { await hook.result.current.speak('The scene is ready for review.'); });
  expect(hook.result.current.isSessionCurrent(first)).toBe(true);
  act(() => hook.result.current.stop());
  expect(hook.result.current.readSessionToken()).toBeNull();
  expect(hook.result.current.isSessionCurrent(first)).toBe(false);
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.readSessionToken()).not.toBe(first);
  expect(hook.result.current.isSessionCurrent(first)).toBe(false);
  hook.unmount(); await settle();
});

test('session checks reject expired work even before the five-minute timer callback executes', async () => {
  const hook = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await hook.result.current.start(); });
  const sessionToken = hook.result.current.readSessionToken();
  jest.setSystemTime(Date.now() + 5 * 60_000);
  expect(hook.result.current.readSessionToken()).toBeNull();
  expect(hook.result.current.isSessionCurrent(sessionToken)).toBe(false);
  hook.unmount(); await settle();
});

test('session identities cannot be reused after unmount or microphone ownership transfer', async () => {
  const old = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await old.result.current.start(); });
  const oldSession = old.result.current.readSessionToken();
  const oldCheck = old.result.current.isSessionCurrent;
  old.unmount(); await settle();
  expect(oldCheck(oldSession)).toBe(false);
  const active = renderHook(() => useForegroundAssistantVoice({ scopeKey: 'owner-home', allowed: true, onQuestion: jest.fn() }));
  await act(async () => { await active.result.current.start(); });
  const newSession = active.result.current.readSessionToken();
  expect(newSession).not.toBe(oldSession);
  expect(active.result.current.isSessionCurrent(oldSession)).toBe(false);
  const dictation = renderHook(() => useVoiceRecognition(jest.fn()));
  await act(async () => { await dictation.result.current.start(); });
  expect(active.result.current.isSessionCurrent(newSession)).toBe(false);
  active.unmount(); dictation.unmount(); await settle();
});
