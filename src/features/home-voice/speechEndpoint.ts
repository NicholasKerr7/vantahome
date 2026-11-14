export const SPEECH_QUIET_MS = 1_000;
export const SPEECH_FINAL_WAIT_MS = 2_500;

type Options = {
  platform: 'ios' | 'android';
  /** Only relevant text should shorten a wake-listening cycle; this is not execution permission. */
  mayFinish: (text: string) => boolean;
  stopNative: () => Promise<void>;
  onFinal: (text: string) => void;
  onIncomplete: (hadSpeech: boolean) => void;
};

/**
 * End audio after a stable phrase, then require the recognizer's final result.
 * The installed iOS bridge emits provisional text through onSpeechResults too;
 * only onSpeechRecognized.isFinal confirms it. Android results are final, while
 * its partial-results callback is provisional. Silence never authorizes a command.
 */
export function createSpeechEndpoint(options: Options) {
  let active = true;
  let text = '';
  let stopRequested = false;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let finalTimer: ReturnType<typeof setTimeout> | null = null;

  /** Release both timers before completing, failing or retiring the owning recognition cycle. */
  const dispose = () => {
    active = false;
    if (quietTimer) clearTimeout(quietTimer);
    if (finalTimer) clearTimeout(finalTimer);
    quietTimer = null;
    finalTimer = null;
  };

  /** Missing final confirmation must not promote the latest provisional text to an instruction. */
  const incomplete = () => {
    if (!active) return;
    dispose();
    options.onIncomplete(Boolean(text));
  };

  /** A native end event can precede the final result; leave a bounded window for that result. */
  const waitForFinal = () => {
    if (!active || finalTimer) return;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
    finalTimer = setTimeout(incomplete, SPEECH_FINAL_WAIT_MS);
  };

  /** Ask the speech service to finish once, retaining the final-result listeners during shutdown. */
  const requestStop = () => {
    if (!active || stopRequested) return;
    stopRequested = true;
    waitForFinal();
    void options.stopNative().catch(incomplete);
  };

  /** A changed hypothesis resets silence; duplicate events must not extend recognition indefinitely. */
  const hypothesis = (value: string) => {
    if (!active) return;
    const next = value.trim();
    if (next === text) return;
    text = next;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
    if (!stopRequested && !finalTimer && options.mayFinish(text)) {
      quietTimer = setTimeout(requestStop, SPEECH_QUIET_MS);
    }
  };

  /** Deliver one explicitly final result and ignore all subsequent native event duplicates. */
  const finish = () => {
    if (!active) return;
    const finalText = text;
    dispose();
    options.onFinal(finalText);
  };

  return {
    /** iOS calls this for partial and final hypotheses; Android calls it only for final results. */
    results(value: string) {
      hypothesis(value);
      if (options.platform === 'android') finish();
    },
    /** iOS partial events contain alternative transcriptions, not independent new utterances. */
    partial(value: string) {
      if (options.platform === 'android') hypothesis(value);
    },
    /** The iOS bridge sends this after the matching results event. */
    recognized(isFinal: boolean | undefined) {
      if (options.platform === 'ios' && isFinal === true) finish();
    },
    end: waitForFinal,
    requestStop,
    dispose,
  };
}

export type SpeechEndpoint = ReturnType<typeof createSpeechEndpoint>;
