import { Alert } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { resolveModelSceneAccess, selectModelLibraryDeviceIds } from './modelSceneAccess';
import type { SimulationControlClient } from './simulationControlClient';

/** The inspector needs device actions only, never ownership of the simulation connection. */
export type SimulationDeviceControls = Pick<SimulationControlClient, 'toggle' | 'setLevel' | 'setPower' | 'setSetting' | 'runAction'>;

/** Recheck current room scope and action grants at the instant of an isolated simulation write. */
export function canControlModelDevice(id: string): boolean {
  const state = useHomeStore.getState();
  return resolveModelSceneAccess(state).controllableDeviceIds.includes(id) && selectModelLibraryDeviceIds(state).includes(id);
}

/** Guard every inspector callback so a stale sheet cannot mutate a different household or account. */
export function guardModelDeviceControls(client: SimulationControlClient): SimulationDeviceControls {
  /** Only dispatch when all requested devices still belong to the allowed simulation scope. */
  function run(ids: readonly string[], action: () => void) {
    if (!ids.length || !ids.every(canControlModelDevice)) {
      Alert.alert('Controls unavailable', 'Your home access changed. Reopen the device to continue.');
      return;
    }
    action();
  }
  return {
    toggle: (id) => run([id], () => client.toggle(id)),
    setLevel: (id, level) => run([id], () => client.setLevel(id, level)),
    setSetting: (id, field, value) => run([id], () => client.setSetting(id, field, value)),
    runAction: (id, actionId) => run([id], () => client.runAction(id, actionId)),
    setPower: (ids, on) => run(ids, () => client.setPower(ids, on)),
  };
}
