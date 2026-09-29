import type { Device, Room, Scene } from '../../store/useHomeStore';

export type SceneEditorScope = 'home' | 'room';

/** Existing scenes without an explicit scope remain attached to their original room. */
export function isWholeHomeScene(scene: Scene): boolean {
  return scene.scope === 'home';
}

/** Hide a scene as a whole when any referenced device falls outside the member's view. */
export function sceneIsVisible(scene: Scene, rooms: readonly Room[], devices: readonly Device[]): boolean {
  const visibleDevices = new Set(devices.map((device) => device.id));
  const scopeIsVisible = isWholeHomeScene(scene)
    ? rooms.length > 0
    : rooms.some((room) => room.id === scene.roomId);
  return scopeIsVisible && scene.actions.every((action) => visibleDevices.has(action.deviceId));
}

/** Describe saved scope independently of the room filter used while editing it. */
export function sceneScopeLabel(scene: Scene, rooms: readonly Room[]): string {
  return isWholeHomeScene(scene) ? 'Whole home' : rooms.find((room) => room.id === scene.roomId)?.name ?? 'Room';
}

/** Room filters only limit browsing; a whole-home selection spans all visible rooms. */
export function sceneSelectableDevices(devices: readonly Device[], scope: SceneEditorScope, roomId: string): Device[] {
  return scope === 'home' && !roomId ? [...devices] : devices.filter((device) => device.roomId === roomId);
}

/** Retain only permitted selections, pruning other rooms only for an explicitly room-scoped scene. */
export function sceneSelectionInScope(ids: readonly string[], devices: readonly Device[], scope: SceneEditorScope, roomId: string): string[] {
  const allowedIds = new Set(devices.filter((device) => scope === 'home' || device.roomId === roomId).map((device) => device.id));
  return ids.filter((id) => allowedIds.has(id));
}
