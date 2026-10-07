import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Bound graphics residency while checking access or briefly visiting another native page. */
export const SCENE_RETENTION_MS = 45_000;

/** Pause hidden graphics; release them after a short absence or background memory pressure. */
export function useRetainedScene(focused: boolean): { active: boolean; retained: boolean; suspended: boolean } {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const [retained, setRetained] = useState(focused && AppState.currentState !== 'background');
  const absentSince = useRef<number | null>(null);
  const focusedRef = useRef(focused);
  const appStateRef = useRef(appState);
  focusedRef.current = focused;
  const active = appState !== 'background';
  const visible = focused && active;

  useEffect(() => {
    if (visible) {
      absentSince.current = null;
      setRetained(true);
      return;
    }
    absentSince.current ??= Date.now();
    const remaining = Math.max(0, SCENE_RETENTION_MS - (Date.now() - absentSince.current));
    const timeout = setTimeout(() => setRetained(false), remaining);
    return () => clearTimeout(timeout);
  }, [visible]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      // iOS may freeze timers while backgrounded, so check the wall clock on return too.
      if (next === 'active' && absentSince.current !== null && Date.now() - absentSince.current >= SCENE_RETENTION_MS) {
        setRetained(false);
      }
      appStateRef.current = next;
      setAppState(next);
    });
    const memory = AppState.addEventListener('memoryWarning', () => {
      if (!focusedRef.current || appStateRef.current === 'background') setRetained(false);
    });
    return () => { subscription.remove(); memory.remove(); };
  }, []);

  return { active, retained, suspended: !focused || appState !== 'active' };
}
