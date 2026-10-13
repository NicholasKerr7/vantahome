import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import type { SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore } from '../../store/useHomeStore';
import { sendLocalNotification } from '../../services/notifications';
import { modelSimulationIdentity } from '../three-d-home/modelSceneAccess';
import { selectCurrentReports } from './currentReports';
import { ConditionTransitions } from './conditionNotifications';

let failure: { scope: string; message: string } | null = null;
const listeners = new Set<() => void>();
/** Publish a bounded, account-scoped explanation when the OS delivery call fails. */
function setFailure(next: typeof failure) { failure = next; listeners.forEach(listener => listener()); }
/** Subscribe the inbox to delivery errors without disclosing another home's information. */
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Keep in-app reports useful when local OS delivery is unavailable. */
export function useConditionNotificationError() {
  const scope = useHomeStore(modelSimulationIdentity);
  return useSyncExternalStore(subscribe, () => failure?.scope === scope ? failure.message : null, () => null);
}

/** Observe current authorized reports without extra simulation clients, polling, or background claims. */
export function useConditionNotifications(simulation: SimulationSnapshot | null, ready = true): void {
  const latest = useRef(simulation);
  latest.current = simulation;
  const scan = useRef<() => void>(() => {});
  const scope = useHomeStore(modelSimulationIdentity);
  useEffect(() => {
    const transitions = new ConditionTransitions();
    const page = typeof document === 'undefined' ? undefined : document;
    let appActive = AppState.currentState === 'active';
    let disposed = false;
    const episodes = new Map<string, object>();
    const foreground = () => !disposed && appActive && !page?.hidden;
    /** Recheck grants and condition after asynchronous OS permission work, including revocations. */
    const reports = () => selectCurrentReports(useHomeStore.getState(), latest.current);
    const check = () => {
      if (!foreground() || !ready || modelSimulationIdentity(useHomeStore.getState()) !== scope) {
        transitions.pause(); episodes.clear(); return;
      }
      const currentReports = reports();
      const currentIds = new Set(currentReports.filter(report => report.notify).map(report => report.id));
      if (!useHomeStore.getState().preferences.notifications) episodes.clear();
      for (const id of episodes.keys()) if (!currentIds.has(id)) episodes.delete(id);
      const changes = transitions.update(currentReports);
      if (Platform.OS === 'web' || !useHomeStore.getState().preferences.notifications) return; // Browser reports remain in-app; Expo OS delivery is native only.
      for (const report of changes) {
        const episode = {};
        episodes.set(report.id, episode);
        void sendLocalNotification(report.title, `${report.deviceName}. ${report.detail}`,
          { kind: 'condition', simulated: report.simulated }, {
            shouldSend: () => foreground() && episodes.get(report.id) === episode
              && modelSimulationIdentity(useHomeStore.getState()) === scope
              && reports().some(current => current.id === report.id && current.notify
                && (current.age === 'recent' || current.age === 'simulation')),
          }).catch(() => {
            if (foreground() && modelSimulationIdentity(useHomeStore.getState()) === scope) {
              setFailure({ scope, message: 'A local phone notice could not be delivered. Current reports remain available here.' });
            }
          });
      }
    };
    scan.current = check;
    const unsubscribe = useHomeStore.subscribe(check);
    const subscription = AppState.addEventListener('change', state => { appActive = state === 'active'; check(); });
    page?.addEventListener('visibilitychange', check);
    check();
    return () => { disposed = true; scan.current = () => {}; unsubscribe(); subscription.remove(); page?.removeEventListener('visibilitychange', check); };
  }, [scope, ready]);
  useEffect(() => { scan.current(); }, [simulation]);
}
