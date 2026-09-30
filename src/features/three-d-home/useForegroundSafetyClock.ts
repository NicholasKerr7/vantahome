import { useEffect } from 'react';
import { AppState } from 'react-native';

interface SafetyClockClient {
  advanceSafety: (seconds: number) => void;
  pauseSafety: () => void;
}

/** Advance only observed foreground seconds; returning never replays time spent away. */
export function useForegroundSafetyClock(client: SafetyClockClient, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const page = typeof document === 'undefined' ? undefined : document;
    let appActive = AppState.currentState === 'active';
    let foreground: boolean | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    /** Stop the previous interval before changing visibility or releasing this owner. */
    function stopTimer() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    }

    /** Coalesce native and browser visibility events into one safe pause per transition. */
    function syncVisibility() {
      const next = appActive && !page?.hidden;
      if (foreground === next) return;
      foreground = next;
      stopTimer();
      if (!next) {
        client.pauseSafety();
        return;
      }
      timer = setInterval(() => {
        // Visibility may change before its event reaches this queued interval callback.
        if (!appActive || page?.hidden) syncVisibility();
        else client.advanceSafety(1);
      }, 1000);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      appActive = state === 'active';
      syncVisibility();
    });
    page?.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    return () => {
      stopTimer();
      subscription.remove();
      page?.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [client, enabled]);
}
