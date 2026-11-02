import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { canPrepareLightingConnection, lightingPreparationIdentity } from './lightingPreparationAccess';
import { LightingConnectionRehearsal } from './lightingConnectionRehearsal';

/** Own a disposable local sample; no transport, home-state write or persistence is reachable here. */
export function useLightingConnectionRehearsal(identity: string) {
  const navigation = useContext(NavigationContext);
  const [connection] = useState(() => new LightingConnectionRehearsal());
  const snapshot = useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot);

  /** Recheck authority synchronously so a stale rendered callback cannot continue the old rehearsal. */
  function isCurrent(): boolean {
    const state = useHomeStore.getState();
    return canPrepareLightingConnection(state) && lightingPreparationIdentity(state) === identity;
  }

  useEffect(() => {
    const page = typeof document === 'undefined' ? undefined : document;
    let foreground = AppState.currentState === 'active';
    /** Background transitions invalidate in-flight results instead of completing them behind the user. */
    function updateActivity() {
      connection.setActive(isCurrent() && foreground && !page?.hidden && (navigation?.isFocused() ?? true));
    }
    const application = AppState.addEventListener('change', (state) => { foreground = state === 'active'; updateActivity(); });
    const unsubscribe = useHomeStore.subscribe(() => {
      if (!isCurrent()) connection.dispose();
    });
    page?.addEventListener('visibilitychange', updateActivity);
    const onFocus = navigation?.addListener('focus', updateActivity);
    const onBlur = navigation?.addListener('blur', updateActivity);
    updateActivity();
    return () => {
      application.remove(); unsubscribe(); page?.removeEventListener('visibilitychange', updateActivity);
      onFocus?.(); onBlur?.();
      // Also works through React's development effect replay: resuming never replays a command.
      connection.setActive(false);
    };
  }, [connection, identity, navigation]);

  /** Keep the same guard around settings, commands and stale navigation callbacks. */
  function run(action: (current: LightingConnectionRehearsal) => void): void {
    if (!isCurrent()) { connection.dispose(); return; }
    action(connection);
  }

  return { snapshot, run };
}
