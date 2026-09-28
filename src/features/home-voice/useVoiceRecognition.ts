import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Voice from '@react-native-voice/voice';

let microphoneOperation: Promise<unknown> = Promise.resolve();

/** Serialize native startup and teardown so a closed panel cannot cancel a newly opened recording. */
function queueMicrophone(operation: () => Promise<unknown>): Promise<unknown> {
  const pending = microphoneOperation.then(operation);
  microphoneOperation = pending.catch(() => undefined);
  return pending;
}

/** Keep speech recognition opt-in and cancel late callbacks on close, background, or identity changes. */
export function useVoiceRecognition(onTranscript: (phrase: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const active = useRef(false);
  const generation = useRef(0);
  const transcript = useRef('');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completion = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  /** Clear both recognition deadlines before cancellation or a new recording begins. */
  const clearTimers = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    if (completion.current) clearTimeout(completion.current);
    timeout.current = null; completion.current = null;
  }, []);

  /** Invalidate callbacks before releasing the native microphone so late results cannot run a command. */
  const cancel = useCallback(() => {
    generation.current += 1;
    const wasActive = active.current;
    active.current = false;
    transcript.current = '';
    clearTimers();
    if (alive.current) setListening(false);
    if (Platform.OS !== 'web' && wasActive) void queueMicrophone(async () => {
      // The library retains event subscriptions after cancel. Destroy them before
      // the next tap so its new callbacks cannot remain bound to an old recording.
      try { await Voice.cancel(); } finally { await Voice.destroy(); }
    }).catch(() => { if (alive.current) setError('The microphone could not be released. Close voice control and try again.'); });
  }, [clearTimers]);

  /** Commit one final transcript per tap, independently of native result/end callback ordering. */
  const finish = useCallback(() => {
    if (!alive.current || !active.current) return;
    const phrase = transcript.current.trim();
    cancel();
    if (phrase) callback.current(phrase);
    else setError('No speech heard. Try again or type a command.');
  }, [cancel]);

  /** Allow final iOS results to arrive just after the speech-end callback. */
  const completeSoon = useCallback(() => {
    if (!alive.current || !active.current) return;
    if (completion.current) clearTimeout(completion.current);
    completion.current = setTimeout(finish, 400);
  }, [finish]);

  /** Start only after an explicit tap and after the previous native recognizer has finished closing. */
  const start = useCallback(async () => {
    if (active.current || Platform.OS === 'web') return;
    const token = ++generation.current;
    active.current = true; transcript.current = ''; setError(null); setListening(true);
    try {
      await queueMicrophone(async () => {
        if (!alive.current || !active.current || generation.current !== token) return;
        if (!await Voice.isAvailable()) throw new Error('Speech recognition unavailable');
        if (!alive.current || !active.current || generation.current !== token) return;
        /** Ignore callbacks from a recording that was cancelled or replaced. */
        const current = () => alive.current && active.current && generation.current === token;
        Voice.onSpeechResults = (event) => { if (current()) transcript.current = event.value?.[0] ?? ''; };
        Voice.onSpeechEnd = () => { if (current()) completeSoon(); };
        Voice.onSpeechError = () => {
          if (!current()) return;
          cancel();
          setError('Speech recognition stopped. Check microphone and speech permissions, or type a command.');
        };
        await Voice.start('en-US');
        if (!current()) { await Voice.cancel(); return; }
        timeout.current = setTimeout(() => {
          if (!current()) return;
          void queueMicrophone(() => Voice.stop()).then(completeSoon).catch(() => { if (current()) { cancel(); setError('Could not finish listening. Type a command or try again.'); } });
        }, 10000);
      });
    } catch {
      if (!alive.current || generation.current !== token) return;
      cancel();
      setError('Speech is unavailable. Check microphone and speech permissions, or type a command.');
    }
  }, [cancel, completeSoon]);

  /** End an explicit recording while retaining any final recognized words. */
  const stop = useCallback(() => {
    if (!active.current) return;
    const token = generation.current;
    void queueMicrophone(() => Voice.stop()).then(completeSoon).catch(() => { if (alive.current && generation.current === token) { cancel(); setError('Could not finish listening. Try typing your command.'); } });
  }, [cancel, completeSoon]);

  useEffect(() => {
    alive.current = true;
    // iOS permission sheets briefly mark the app inactive during Voice.start.
    // Preserve that request; leaving the app reaches background and cancels it.
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'background') cancel(); });
    return () => {
      alive.current = false;
      cancel(); subscription.remove();
      if (Platform.OS !== 'web') {
        void queueMicrophone(async () => { Voice.removeAllListeners(); await Voice.destroy(); }).catch(() => undefined);
      }
    };
  }, [cancel]);
  return { listening, error, start, stop, cancel };
}
