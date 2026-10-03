import { getDevice } from '../../../packages/home-scene/src/data';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { selectVisibleDevices, type HomeState } from '../../store/useHomeStore';
import { resolveModelSceneAccess } from './modelSceneAccess';
import { isModelHome } from './modelHomeScope';
import { canShareDemoDevices } from './simulationSession';

/** Map visible virtual registry IDs to authored controls without reclassifying physical devices. */
export function selectSimulationDeviceBindings(
  state: HomeState,
  mode: RuntimeMode = runtimePolicy.mode,
): Record<string, string> {
  const demo = isModelHome(state, mode) && canShareDemoDevices(state, mode);
  const permitted = new Set(resolveModelSceneAccess(state, mode).deviceIds);
  return Object.fromEntries(selectVisibleDevices(state).flatMap((device) => {
    const id = demo ? device.id : device.simulationOnly ? device.modelDeviceId : undefined;
    const definition = id ? getDevice(id) : undefined;
    return definition?.kind === device.kind && permitted.has(definition.id)
      ? [[device.id, definition.id]] : [];
  }));
}
