export const CINEMATIC_IDLE_MS = 90_000;

type IdleCinematicOptions = {
  allowed: () => boolean;
  start: () => void;
  stop: () => void;
  delay?: number;
};

/** Keep one deadline timer, even during frequent pointer movement; eligibility is checked again at delivery. */
export function createIdleCinematicController({ allowed, start, stop, delay = CINEMATIC_IDLE_MS }: IdleCinematicOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastActivity = Date.now();
  let disposed = false;

  /** Fire only after a complete quiet interval, never after returning from a blocked or hidden state. */
  function checkDeadline() {
    timer = null;
    if (disposed || !allowed()) return;
    const remaining = delay - (Date.now() - lastActivity);
    if (remaining > 0) timer = setTimeout(checkDeadline, remaining);
    else start();
  }

  /** Every real interaction exits playback and begins a fresh eligible idle interval. */
  function activity() {
    if (disposed) return;
    lastActivity = Date.now();
    stop();
    if (!allowed()) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    } else if (timer === null) timer = setTimeout(checkDeadline, delay);
  }

  /** Detach the timer and playback when its viewport is no longer mounted. */
  function dispose() {
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    stop();
  }

  return { activity, dispose };
}
