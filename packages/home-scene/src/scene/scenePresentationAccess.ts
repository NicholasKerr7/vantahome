import { DEVICES, type ViewId } from '../data';
import { canExploreInteriorLayout, canViewPropertyOverview, canViewSceneDevice, type SceneAccess } from '../sceneAccess';
import type { DeviceStates } from '../simulationTypes';

/** Layout and exterior presentation must never change assigned-room or device grants. */
export function requiresRoomIsolation(access: SceneAccess, view: ViewId): boolean {
  return !canExploreInteriorLayout(access) && !(view === 'exterior' && canViewPropertyOverview(access));
}

/** Strip hidden readings and settings before any light, movement, or effect consumes them. */
export function scopeSceneDeviceStates(states: DeviceStates, access: SceneAccess): DeviceStates {
  return Object.fromEntries(DEVICES.map((device) => [device.id,
    canViewSceneDevice(access, device.id) ? states[device.id] ?? { on: false, level: 0 } : { on: false, level: 0 },
  ]));
}
