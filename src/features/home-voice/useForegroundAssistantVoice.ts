import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Voice from '@react-native-voice/voice';
import * as Speech from 'expo-speech';
import { assistantSpokenQuestion, parseAssistantWakePhrase } from './assistantWakePhrase';
import { claimVoiceSession, ownsVoiceSession, queueVoiceOperation, releaseVoiceSession } from './voiceSession';

export type AssistantVoicePhase = 'off' | 'listening' | 'capturing' | 'waiting' | 'speaking';
/** Ephemeral opt-in identity, not an authorization credential; callers must revalidate before use. */
export type AssistantVoiceSessionToken = number;
type Options = {
  /** Current account/home/grant identity plus any route or room scope that must invalidate speech. */
  scopeKey: string;
  allowed: boolean;
  /** This callback enters Ask only; it must never dispatch a direct device command. */
  onQuestion: (question: string, sessionToken: AssistantVoiceSessionToken) => void | Promise<void>;
};
const LISTENING_WINDOW_MS = 5 * 60_000;
const WAKE_CYCLE_MS = 20_000;
const QUESTION_CYCLE_MS = 10_000;
const MAX_ERRORS = 3;
// Separate hook instances must never recognize a queued question from an earlier mount as their own.
let nextSessionToken = 0;

/**
 * Opted-in foreground speech recognition, not a local/background wake-word engine.
 * Ambient transcripts stay ephemeral; only a wake-prefixed final question enters Ask.
 * Listening is suspended throughout generation and TTS, with no automatic new consent window.
 */
export function useForegroundAssistantVoice(options: Options) {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<AssistantVoicePhase>('off');
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const alive = useRef(true);
  const lease = useRef<symbol | null>(null);
  const generation = useRef(0);
  const consentSession = useRef<AssistantVoiceSessionToken | null>(null);
  const capturedScope = useRef(options.scopeKey);
  const enabledRef = useRef(false);
  const phaseRef = useRef<AssistantVoicePhase>('off');
  const deadline = useRef(0);
  const cycle = useRef(0);
  const nativeActive = useRef(false);
  const outputActive = useRef(false);
  const outputGeneration = useRef(0);
  const consecutiveErrors = useRef(0);
  const windowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const beginRef = useRef<(capturing?: boolean) => Promise<void>>(async () => undefined);

  /** Keep event callbacks synchronous with rendered state, including before React commits a new frame. */
  const updatePhase = useCallback((next: AssistantVoicePhase) => {
    phaseRef.current = next;
    if (alive.current) setPhase(next);
  }, []);

  /** Retire every delayed completion/retry before changing microphone owners or recognition stages. */
  const clearCycleTimers = useCallback(() => {
    for (const timer of cycleTimers.current) clearTimeout(timer);
    cycleTimers.current.clear();
  }, []);

  /** Track bounded recognition and retry timers in one cancellation group. */
  const later = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => { cycleTimers.current.delete(timer); callback(); }, delay);
    cycleTimers.current.add(timer);
  }, []);

  /** Queue physical teardown before the next recognizer or spoken answer can start. */
  const cancelRecognition = useCallback((): Promise<void> => {
    cycle.current += 1;
    clearCycleTimers();
    if (!nativeActive.current) return Promise.resolve();
    nativeActive.current = false;
    return queueVoiceOperation(async () => {
      try { await Voice.cancel(); } finally { await Voice.destroy(); }
    });
  }, [clearCycleTimers]);

  /** Revoke this session before native shutdown, so late transcripts and TTS events cannot revive it. */
  const stop = useCallback(() => {
    generation.current += 1;
    consentSession.current = null;
    outputGeneration.current += 1;
    enabledRef.current = false;
    deadline.current = 0;
    if (windowTimer.current) clearTimeout(windowTimer.current);
    windowTimer.current = null;
    const owned = releaseVoiceSession(lease.current);
    lease.current = null;
    const shutdown = cancelRecognition();
    const wasSpeaking = outputActive.current;
    outputActive.current = false;
    if (owned && wasSpeaking) void queueVoiceOperation(() => Speech.stop()).catch(() => {
      if (alive.current) setError('Spoken audio could not be stopped. Close the assistant.');
    });
    void shutdown.catch(() => { if (alive.current) setError('The microphone could not be released. Close the assistant.'); });
    if (alive.current) setEnabled(false);
    updatePhase('off');
  }, [cancelRecognition, updatePhase]);

  /** Recheck authority at every asynchronous boundary; the caller supplies the existing permission fingerprint. */
  const current = useCallback((token: number) => alive.current && token === generation.current
    && latest.current.allowed && latest.current.scopeKey === capturedScope.current
    && AppState.currentState === 'active' && ownsVoiceSession(lease.current), []);

  /** The five-minute budget never restarts because a phrase, retry, answer or foreground event arrived. */
  const listeningAllowed = useCallback((token: number) => current(token) && enabledRef.current
    && Date.now() < deadline.current, [current]);

  /** Bind queued work to this exact opt-in window; paused listening retains its original consent and deadline. */
  const readSessionToken = useCallback((): AssistantVoiceSessionToken | null => (
    listeningAllowed(generation.current) ? consentSession.current : null
  ), [listeningAllowed]);

  /** Recheck immediately before queued Ask or automatic speech; manual Hear has no opt-in session token. */
  const isSessionCurrent = useCallback((token: AssistantVoiceSessionToken | null): boolean => (
    token !== null && token === readSessionToken()
  ), [readSessionToken]);

  /** Pause for an Ask request or a caller-owned UI transition without creating a new listening window. */
  const pause = useCallback(() => {
    outputGeneration.current += 1;
    const wasSpeaking = outputActive.current;
    outputActive.current = false;
    void cancelRecognition().catch(() => { stop(); if (alive.current) setError('The microphone could not pause. Try again.'); });
    if (wasSpeaking && ownsVoiceSession(lease.current)) {
      void queueVoiceOperation(() => Speech.stop()).catch(() => { stop(); if (alive.current) setError('Spoken audio could not be stopped. Close the assistant.'); });
    }
    if (enabledRef.current) updatePhase('waiting');
    else stop();
  }, [cancelRecognition, stop, updatePhase]);

  /** Recover only while consent and authority remain current; errors use bounded exponential backoff. */
  const retry = useCallback((token: number, failed: boolean) => {
    if (!listeningAllowed(token)) return;
    if (failed) consecutiveErrors.current += 1;
    else consecutiveErrors.current = 0;
    if (consecutiveErrors.current >= MAX_ERRORS) {
      stop(); setError('Speech recognition stopped. Check microphone and speech permissions, then try again.'); return;
    }
    updatePhase('listening');
    later(() => { if (listeningAllowed(token)) void beginRef.current(); }, failed ? 1000 * 2 ** (consecutiveErrors.current - 1) : 500);
  }, [later, listeningAllowed, stop, updatePhase]);

  /** Start one bounded utterance; native final results are allowed to follow the speech-end callback. */
  const begin = useCallback(async (capturing = false): Promise<void> => {
    const token = generation.current;
    if (!listeningAllowed(token) || nativeActive.current || outputActive.current) return;
    const cycleToken = ++cycle.current;
    nativeActive.current = true;
    let transcript = '';
    let completionQueued = false;
    const cycleCurrent = () => listeningAllowed(token) && cycle.current === cycleToken && nativeActive.current;
    updatePhase(capturing ? 'capturing' : 'listening');

    /** Consume final text exactly once, only after microphone cleanup completes. */
    const complete = async (failed = false): Promise<void> => {
      if (!cycleCurrent()) return;
      const finalText = transcript;
      transcript = '';
      try { await cancelRecognition(); }
      catch { if (current(token)) { stop(); setError('The microphone could not be released. Try again.'); } return; }
      if (!listeningAllowed(token)) return;
      if (failed) { retry(token, true); return; }
      const wake = capturing ? { question: parseAssistantWakePhrase(finalText)?.question ?? finalText } : parseAssistantWakePhrase(finalText);
      if (!wake) { retry(token, false); return; }
      consecutiveErrors.current = 0;
      if (!wake.question.trim()) {
        if (capturing) { retry(token, false); return; }
        later(() => { if (listeningAllowed(token)) void beginRef.current(true); }, 500);
        updatePhase('capturing'); return;
      }
      const question = assistantSpokenQuestion(wake.question);
      if (!question) { stop(); setError('Use one question of up to 600 characters.'); return; }
      const sessionToken = readSessionToken();
      if (sessionToken === null) return;
      updatePhase('waiting');
      try { await latest.current.onQuestion(question, sessionToken); }
      catch { if (current(token)) { stop(); setError('That question could not be sent. Open Ask and try again.'); } }
    };

    try {
      await queueVoiceOperation(async () => {
        if (!cycleCurrent()) return;
        if (!await Voice.isAvailable()) throw new Error('Speech unavailable');
        if (!cycleCurrent()) return;
        Voice.onSpeechResults = (event) => { if (cycleCurrent()) transcript = event.value?.[0] ?? ''; };
        Voice.onSpeechPartialResults = () => undefined;
        Voice.onSpeechEnd = () => {
          if (!cycleCurrent() || completionQueued) return;
          completionQueued = true;
          later(() => { void complete(); }, 400);
        };
        Voice.onSpeechError = (event) => {
          // Android reports an ordinary silent/no-match utterance as an error. Never
          // retry permission/network failures as if they were successful listening.
          const silent = Platform.OS === 'android' && ['6', '7'].includes(event.error?.code ?? '');
          if (silent) transcript = '';
          void complete(!silent);
        };
        await Voice.start('en-US');
        if (!cycleCurrent()) { await Voice.cancel(); return; }
        later(() => {
          if (!cycleCurrent()) return;
          void queueVoiceOperation(() => Voice.stop()).then(() => {
            if (!cycleCurrent() || completionQueued) return;
            completionQueued = true; later(() => { void complete(); }, 400);
          }).catch(() => { void complete(true); });
        }, capturing ? QUESTION_CYCLE_MS : WAKE_CYCLE_MS);
      });
    } catch { if (cycleCurrent()) await complete(true); }
  }, [cancelRecognition, current, later, listeningAllowed, readSessionToken, retry, stop, updatePhase]);
  beginRef.current = begin;

  /** An explicit tap is the only way to create a new consent window; web keeps its typed Ask fallback. */
  const start = useCallback(async () => {
    if (!alive.current) return;
    stop();
    if (Platform.OS === 'web' || !latest.current.allowed || AppState.currentState !== 'active') return;
    capturedScope.current = latest.current.scopeKey;
    lease.current = claimVoiceSession(stop);
    consentSession.current = ++nextSessionToken;
    enabledRef.current = true;
    deadline.current = Date.now() + LISTENING_WINDOW_MS;
    consecutiveErrors.current = 0;
    setError(null); setEnabled(true);
    windowTimer.current = setTimeout(() => { stop(); if (alive.current) setError('Hands-free listening ended after five minutes. Tap to start again.'); }, LISTENING_WINDOW_MS);
    await begin();
  }, [begin, stop]);

  /** Resume only after the caller has finished showing an answer; never resume after backgrounding or expiry. */
  const resume = useCallback(() => {
    if (phaseRef.current !== 'waiting' || !listeningAllowed(generation.current)) return;
    void begin();
  }, [begin, listeningAllowed]);

  /** Speak only caller-approved text, without a microphone or command pathway active at the same time. */
  const speak = useCallback(async (text: string): Promise<void> => {
    if (!alive.current || Platform.OS === 'web' || !latest.current.allowed || AppState.currentState !== 'active') return;
    const answer = text.trim();
    if (!answer || answer.length > 1600) {
      pause(); setError('This reply cannot be read aloud. Read the answer on screen; listening is paused.'); return;
    }
    if (!ownsVoiceSession(lease.current)) {
      capturedScope.current = latest.current.scopeKey;
      lease.current = claimVoiceSession(stop);
    }
    const token = generation.current;
    const outputToken = ++outputGeneration.current;
    const outputCurrent = () => current(token) && outputToken === outputGeneration.current;
    try {
      await cancelRecognition();
      await queueVoiceOperation(() => Speech.stop());
      if (!outputCurrent()) return;
      outputActive.current = true;
      updatePhase('speaking');
      let finished = false;
      /** Retire output once; late completion cannot restart recognition after scope loss. */
      const finish = (failed = false) => {
        if (finished || !outputCurrent()) return;
        finished = true; outputActive.current = false;
        clearCycleTimers();
        if (failed) { stop(); setError('Spoken reply is unavailable. The answer is still on screen.'); return; }
        if (listeningAllowed(token)) {
          updatePhase('waiting');
          // Allow the speaker's trailing audio to decay before reopening the microphone.
          later(() => { if (listeningAllowed(token)) void beginRef.current(); }, 800);
        } else stop();
      };
      Speech.speak(answer, { language: 'en-US', rate: 0.96, useApplicationAudioSession: false,
        onDone: () => finish(), onStopped: () => finish(), onError: () => finish(true) });
      later(() => { if (outputCurrent() && outputActive.current) { stop(); setError('Spoken reply timed out. The answer is still on screen.'); } }, 60_000);
    } catch { if (outputCurrent()) { stop(); setError('Spoken reply is unavailable. The answer is still on screen.'); } }
  }, [cancelRecognition, clearCycleTimers, current, later, listeningAllowed, pause, stop, updatePhase]);

  useEffect(() => {
    if (!options.allowed || options.scopeKey !== capturedScope.current) stop();
  }, [options.allowed, options.scopeKey, stop]);

  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', (next) => { if (next !== 'active') stop(); });
    return () => { alive.current = false; stop(); subscription.remove(); };
  }, [stop]);

  return { supported: Platform.OS !== 'web', enabled, phase, error, start, stop, pause, resume, speak,
    readSessionToken, isSessionCurrent };
}
