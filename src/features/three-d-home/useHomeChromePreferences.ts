import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { cinematicPreferencePersistence, type CinematicPreferencePersistence } from './cinematicPreferencePersistence';

/** Keep the host's device-local tour choice hydrated and stable across retained-scene remounts. */
export function useHomeChromePreferences(persistence: CinematicPreferencePersistence = cinematicPreferencePersistence) {
  const preference = useSyncExternalStore(persistence.subscribe, persistence.getSnapshot, persistence.getSnapshot);
  useEffect(() => { void persistence.load(); }, [persistence]);
  const save = useCallback((enabled: boolean) => persistence.save(enabled), [persistence]);
  return { ...preference, save };
}
