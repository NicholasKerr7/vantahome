import { Alert } from 'react-native';
import { getDevice } from '../../../packages/home-scene/src/data';
import { runtimePolicy } from '../../config/runtimeMode';
import { selectVisibleDevices, useHomeStore } from '../../store/useHomeStore';
import { isModelHome } from './modelHomeScope';
import { canShareDemoDevices } from './simulationSession';
import type { SimulationControlClient } from './simulationControlClient';

/** The inspector needs device actions only, never ownership of the simulation connection. */
export type SimulationDeviceControls = Pick<SimulationControlClient, 'toggle' | 'setLevel' | 'setPower' | 'setSetting' | 'runAction'>;

/** Recheck the owner-only local model binding and current device visibility at the instant of a write. */
export function canControlModelDevice(id: string): boolean {
  const state = useHomeStore.getState();
  const definition = getDevice(id);
  return Boolean(definition && isModelHome(state) && canShareDemoDevices(state, runtimePolicy.mode)
    && selectVisibleDevices(state).some((device) => device.id === id && device.kind === definition.kind));
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
