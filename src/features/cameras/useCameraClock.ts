import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Age camera telemetry while visible, with no interval running in the background. */
export function useCameraClock(enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = (state = AppState.currentState) => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (state !== null && state !== 'active') return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 60_000);
    };
    refresh();
    const subscription = AppState.addEventListener('change', refresh);
    return () => { if (timer) clearInterval(timer); subscription?.remove(); };
  }, [enabled]);
  return Math.max(now, Date.now());
}
