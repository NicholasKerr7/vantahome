import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useHomeStore, selectVisibleDevices } from '../../store/useHomeStore';
import { modelSimulationIdentity } from '../three-d-home/modelSceneAccess';
import { selectSimulationDeviceBindings } from '../three-d-home/simulationDeviceBindings';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { selectCurrentReports } from './currentReports';

/** Read the canonical scoped model without sending commands; age physical reports only in the foreground. */
export function useCurrentReports(enabled: boolean) {
  useHomeStore(useShallow(selectVisibleDevices));
  useHomeStore(modelSimulationIdentity);
  const hasModel = useHomeStore((state) => Object.keys(selectSimulationDeviceBindings(state)).length > 0);
  const simulation = useSimulationControls(enabled && hasModel);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    /** Stop background work and refresh age immediately when the app resumes. */
    const refresh = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (AppState.currentState !== null && AppState.currentState !== 'active') return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 60_000);
    };
    refresh();
    const subscription = AppState.addEventListener('change', refresh);
    return () => { if (timer) clearInterval(timer); subscription?.remove(); };
  }, [enabled]);
  return {
    reports: selectCurrentReports(useHomeStore.getState(), simulation.ready ? simulation.state : null, undefined, Math.max(now, Date.now())),
    loading: hasModel && !simulation.ready,
  };
}
