import { useEffect, useRef } from 'react';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { isAccountScopeCurrent } from './accountIdentity';
import { useAccountIdentity } from './useAccountIdentity';

type DisplayPreferences = Pick<HomeState['profile'], 'tempUnit' | 'timeFormat'>;

/** Update only personal fields using the same persisted store as the profile workspace. */
export function useAccountPreferences() {
  const profile = useHomeStore((state) => state.profile);
  const preferences = useHomeStore((state) => state.preferences);
  const { identity, scope } = useAccountIdentity();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Reject retained handlers after a sheet closes or its account/home scope changes. */
  function canUpdate() {
    return mounted.current && identity.mode !== 'unavailable'
      && isAccountScopeCurrent(scope, useHomeStore.getState());
  }

  /** Patch display settings without saving stale identity fields from a separate profile draft. */
  function setDisplayPreferences(patch: DisplayPreferences) {
    if (canUpdate()) useHomeStore.getState().setProfile(patch);
  }

  /** Share haptic and notification preferences with all existing consumers. */
  function setComfortPreferences(patch: Partial<HomeState['preferences']>) {
    if (canUpdate()) useHomeStore.getState().setPreferences(patch);
  }

  return {
    tempUnit: profile.tempUnit ?? 'C',
    timeFormat: profile.timeFormat ?? '12h',
    preferences,
    available: identity.mode !== 'unavailable',
    canUpdate,
    setDisplayPreferences,
    setComfortPreferences,
  };
}
