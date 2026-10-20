import { useCallback, useContext, useSyncExternalStore } from 'react';
import { NavigationContext } from '@react-navigation/native';

/** Observe focus when a controller lives on a retained route, with a safe standalone preview fallback. */
export function useControllerFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((notify: () => void) => {
    if (!navigation) return () => undefined;
    const offFocus = navigation.addListener('focus', notify);
    const offBlur = navigation.addListener('blur', notify);
    return () => { offFocus(); offBlur(); };
  }, [navigation]);
  const readFocus = useCallback(() => navigation?.isFocused() ?? true, [navigation]);
  return useSyncExternalStore(subscribe, readFocus, readFocus);
}
