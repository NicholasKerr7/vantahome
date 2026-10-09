import { getDevice } from '../../../packages/home-scene/src/data';
import { applyDeviceSetting, toggleDeviceState } from '../../../packages/home-scene/src/deviceControlActions';
import { getCapabilities, isMonitor, validateSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { diffSimulationSnapshots, mergeSimulationChanges, type DeviceState, type SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { HomeState, Scene, SceneAction } from '../../store/useHomeStore';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import { modelSimulationScope, resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { simulationPersistence, type SimulationPersistence } from '../three-d-home/simulationPersistence';
import { canManageScenes } from './sceneManagement';

/** Resolve an entire virtual scene, rejecting mixed transports and stale or restricted bindings. */
export function simulationSceneBindings(state: HomeState, scene: Scene): Map<string, string> | null {
  const devices = scene.actions.map((action) => state.devices.find((device) => device.id === action.deviceId));
  if (!devices.some((device) => device?.simulationOnly)) return null;
  if (!canManageScenes(state) || !scene.actions.length) throw new Error('Your current access does not allow this scene.');
  const allowed = new Set(resolveModelSceneAccess(state).controllableDeviceIds);
  const bindings = new Map<string, string>();
  for (const device of devices) {
    const definition = device?.modelDeviceId ? getDevice(device.modelDeviceId) : undefined;
    if (!device?.simulationOnly || !definition || definition.kind !== device.kind || !allowed.has(definition.id)) {
      throw new Error('A scene cannot mix physical devices with the 3D simulation, or use unavailable controls.');
    }
    bindings.set(device.id, definition.id);
  }
  return bindings;
}

/** Reduce saved native settings using the same validated controls as the model inspector. */
function applyAction(current: DeviceState, id: string, action: SceneAction): DeviceState {
  const definition = getDevice(id)!;
  if (action.type === 'toggle') {
    if (isMonitor(definition.kind) || action.on !== undefined && typeof action.on !== 'boolean') throw new Error('This scene contains an invalid power action.');
    return action.on === undefined || current.on !== action.on ? toggleDeviceState(id, current) : current;
  }
  if (action.type !== 'patch' || !action.patch || typeof action.patch !== 'object' || Array.isArray(action.patch)) throw new Error('This scene contains an invalid action.');
  let next = current;
  const { isOn, ...settings } = action.patch;
  if (isOn !== undefined) {
    if (typeof isOn !== 'boolean' || isMonitor(definition.kind)) throw new Error('A scene contains an invalid power setting.');
    if (next.on !== isOn) next = toggleDeviceState(id, next);
  }
  for (const [field, value] of Object.entries(settings)) {
    const capability = getCapabilities(definition.kind).find((entry) => 'field' in entry && entry.field === field);
    if (!capability || capability.type === 'stat' || validateSetting(capability, value) === undefined) {
      throw new Error('A saved scene setting is unavailable. Edit the scene before running it.');
    }
    next = applyDeviceSetting(id, next, field, value as string | number | boolean);
  }
  return next;
}

/** Apply one atomic simulation transaction, retaining real time, unrelated devices and safety holds. */
export function reduceSimulationScene(snapshot: SimulationSnapshot, scene: Scene, bindings: ReadonlyMap<string, string>): SimulationSnapshot {
  const deviceStates: Record<string, DeviceState> = {};
  for (const action of scene.actions) {
    const id = bindings.get(action.deviceId);
    if (!id || !snapshot.deviceStates[id]) throw new Error('A scene device is unavailable.');
    deviceStates[id] = applyAction(deviceStates[id] ?? snapshot.deviceStates[id], id, action);
  }
  return mergeSimulationChanges(snapshot, { deviceStates });
}

/** Never route virtual scene commands through hardware transports; recheck after disk hydration. */
export async function runSimulationScene(initial: HomeState, scene: Scene, getState: () => HomeState, signal?: AbortSignal,
  persistence: Pick<SimulationPersistence, 'update'> = simulationPersistence): Promise<boolean> {
  const bindings = simulationSceneBindings(initial, scene);
  if (!bindings) return false;
  const scope = modelSimulationScope(initial, false);
  const identity = homeEditorScope(initial);
  await persistence.update(scope, (snapshot) => {
    const current = getState();
    if (signal?.aborted || homeEditorScope(current) !== identity || current.scenes.find((item) => item.id === scene.id) !== scene) {
      throw new Error('Home access changed. Open the scene again before running it.');
    }
    const freshBindings = simulationSceneBindings(current, scene);
    if (!freshBindings || [...bindings].some(([id, target]) => freshBindings.get(id) !== target)) throw new Error('Scene devices changed. Review the scene before running it.');
    const next = reduceSimulationScene(snapshot, scene, freshBindings);
    const allowed = new Set(resolveModelSceneAccess(current).controllableDeviceIds);
    if (Object.keys(diffSimulationSnapshots(snapshot, next).deviceStates ?? {}).some((id) => !allowed.has(id))) throw new Error('This scene needs access to additional safety controls.');
    return next;
  });
  return true;
}
