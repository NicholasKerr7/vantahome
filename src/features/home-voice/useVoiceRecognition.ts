import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Voice from '@react-native-voice/voice';
import { claimVoiceSession, ownsVoiceSession, queueVoiceOperation, releaseVoiceSession } from './voiceSession';
import { createSpeechEndpoint, type SpeechEndpoint } from './speechEndpoint';
import { speechRecognitionOptions, type SpeechRecognitionOptions } from './speechRecognitionOptions';

/** Keep speech recognition opt-in and cancel late callbacks on close, background, or identity changes. */
export function useVoiceRecognition(onTranscript: (phrase: string) => void, options: SpeechRecognitionOptions = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const active = useRef(false);
  const lease = useRef<symbol | null>(null);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endpoint = useRef<SpeechEndpoint | null>(null);
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  /** Clear both recognition deadlines before cancellation or a new recording begins. */
  const clearTimers = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    endpoint.current?.dispose();
    endpoint.current = null;
    timeout.current = null;
  }, []);

  /** Invalidate callbacks before releasing the native microphone so late results cannot run a command. */
  const cancel = useCallback(() => {
    generation.current += 1;
    const wasActive = active.current;
    const owned = releaseVoiceSession(lease.current);
    lease.current = null;
    active.current = false;
    clearTimers();
    if (alive.current) setListening(false);
    if (Platform.OS !== 'web' && wasActive && owned) void queueVoiceOperation(async () => {
      // The library retains event subscriptions after cancel. Destroy them before
      // the next tap so its new callbacks cannot remain bound to an old recording.
      try { await Voice.cancel(); } finally { await Voice.destroy(); }
    }).catch(() => { if (alive.current) setError('The microphone could not be released. Close voice control and try again.'); });
  }, [clearTimers]);

  /** Commit one final transcript per tap, independently of native result/end callback ordering. */
  const finish = useCallback((text: string) => {
    if (!alive.current || !active.current) return;
    const phrase = text.trim();
    cancel();
    if (phrase) callback.current(phrase);
    else setError('No speech heard. Try again or type a command.');
  }, [cancel]);

  /** Start only after an explicit tap and after the previous native recognizer has finished closing. */
  const start = useCallback(async () => {
    if (!alive.current || active.current || Platform.OS === 'web') return;
    const token = ++generation.current;
    lease.current = claimVoiceSession(cancel);
    active.current = true; setError(null); setListening(true);
    try {
      await queueVoiceOperation(async () => {
        if (!alive.current || !active.current || generation.current !== token || !ownsVoiceSession(lease.current)) return;
        if (!await Voice.isAvailable()) throw new Error('Speech recognition unavailable');
        if (!alive.current || !active.current || generation.current !== token || !ownsVoiceSession(lease.current)) return;
        /** Ignore callbacks from a recording that was cancelled or replaced. */
        const current = () => alive.current && active.current && generation.current === token && ownsVoiceSession(lease.current);
        const recognition = createSpeechEndpoint({
          platform: Platform.OS === 'android' ? 'android' : 'ios',
          mayFinish: Boolean,
          stopNative: () => queueVoiceOperation(async () => { if (current()) await Voice.stop(); }),
          onFinal: (text) => { if (current()) finish(text); },
          onIncomplete: (hadSpeech) => {
            if (!current()) return;
            cancel();
            setError(hadSpeech ? 'Speech could not be finalized. Try again or type your command.' : 'No speech heard. Try again or type a command.');
          },
        });
        endpoint.current = recognition;
        Voice.onSpeechResults = (event) => { if (current()) recognition.results(event.value?.[0] ?? ''); };
        Voice.onSpeechPartialResults = (event) => { if (current()) recognition.partial(event.value?.[0] ?? ''); };
        Voice.onSpeechRecognized = (event) => { if (current()) recognition.recognized(event.isFinal); };
        Voice.onSpeechEnd = () => { if (current()) recognition.end(); };
        Voice.onSpeechError = () => {
          if (!current()) return;
          cancel();
          setError('Speech recognition stopped. Check microphone and speech permissions, or type a command.');
        };
        await Voice.start('en-US', speechRecognitionOptions(latestOptions.current));
        if (!current()) { await Voice.cancel(); return; }
        timeout.current = setTimeout(() => {
          if (!current()) return;
          recognition.requestStop();
        }, 10000);
      });
    } catch {
      if (!alive.current || generation.current !== token) return;
      cancel();
      setError('Speech is unavailable. Check microphone and speech permissions, or type a command.');
    }
  }, [cancel, finish]);

  /** End an explicit recording while retaining any final recognized words. */
  const stop = useCallback(() => {
    if (!active.current) return;
    endpoint.current?.requestStop();
  }, []);

  useEffect(() => {
    alive.current = true;
    // iOS permission sheets briefly mark the app inactive during Voice.start.
    // Preserve that request; leaving the app reaches background and cancels it.
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') cancel(); });
    return () => {
      alive.current = false;
      cancel(); subscription.remove();
    };
  }, [cancel]);
  return { listening, error, start, stop, cancel };
}
