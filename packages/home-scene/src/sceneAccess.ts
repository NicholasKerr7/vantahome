import { DEVICES, ROOMS, getDevice } from './data';

/** A host-issued view and control scope; it never contains account identifiers. */
export interface SceneAccess {
  fullHome: boolean;
  propertyOverview?: boolean;
  interiorLayout?: boolean;
  roomIds: string[];
  deviceIds: string[];
  controllableDeviceIds: string[];
}

export const EMPTY_SCENE_ACCESS: SceneAccess = { fullHome: false, propertyOverview: false, interiorLayout: false, roomIds: [], deviceIds: [], controllableDeviceIds: [] };
export const FULL_SCENE_ACCESS: SceneAccess = {
  fullHome: true, propertyOverview: true, interiorLayout: true, roomIds: ROOMS.map(({ id }) => id), deviceIds: DEVICES.map(({ id }) => id),
  controllableDeviceIds: DEVICES.map(({ id }) => id),
};

/** Validate every grant, including device-to-room membership and control-to-view containment. */
export function parseSceneAccess(value: unknown): SceneAccess | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const fields = ['fullHome', 'propertyOverview', 'interiorLayout', 'roomIds', 'deviceIds', 'controllableDeviceIds'];
  if (Object.keys(candidate).some((key) => !fields.includes(key)) || typeof candidate.fullHome !== 'boolean') return null;
  if (['propertyOverview', 'interiorLayout'].some((key) => key in candidate && typeof candidate[key] !== 'boolean')) return null;
  /** Grants are unique strings; duplicates are rejected rather than silently normalized. */
  const list = (input: unknown): input is string[] => Array.isArray(input) && input.every((id) => typeof id === 'string') && new Set(input).size === input.length;
  if (!list(candidate.roomIds) || !list(candidate.deviceIds) || !list(candidate.controllableDeviceIds)) return null;
  const rooms = new Set(candidate.roomIds);
  if (candidate.roomIds.some((id) => !ROOMS.some((room) => room.id === id))) return null;
  if (candidate.fullHome && ROOMS.some((room) => !rooms.has(room.id))) return null;
  if (candidate.deviceIds.some((id) => { const device = getDevice(id); return !device || !rooms.has(device.roomId); })) return null;
  if (candidate.controllableDeviceIds.some((id) => !(candidate.deviceIds as string[]).includes(id))) return null;
  return { fullHome: candidate.fullHome,
    ...(typeof candidate.propertyOverview === 'boolean' ? { propertyOverview: candidate.propertyOverview } : {}),
    ...(typeof candidate.interiorLayout === 'boolean' ? { interiorLayout: candidate.interiorLayout } : {}),
    roomIds: [...candidate.roomIds], deviceIds: [...candidate.deviceIds], controllableDeviceIds: [...candidate.controllableDeviceIds] };
}

/** Exterior presentation never grants a room, a device reading, or an action. */
export function canViewPropertyOverview(access: SceneAccess): boolean { return access.fullHome || access.propertyOverview === true; }

/** Interior sharing permits furnished layout exploration without expanding device authority. */
export function canExploreInteriorLayout(access: SceneAccess): boolean { return access.fullHome || access.interiorLayout === true; }

/** Keep layout navigation independent from explicitly assigned room access. */
export function canNavigateSceneRoom(access: SceneAccess, roomId: string): boolean {
  const room = ROOMS.find((candidate) => candidate.id === roomId);
  return Boolean(room && (canViewSceneRoom(access, roomId)
    || (room.outdoor ? canViewPropertyOverview(access) : canExploreInteriorLayout(access))));
}

/** Explicit room grants apply even when the host permits whole-property navigation. */
export function canViewSceneRoom(access: SceneAccess, roomId: string): boolean { return access.roomIds.includes(roomId); }

/** A device needs both a visible room and an explicit view grant. */
export function canViewSceneDevice(access: SceneAccess, deviceId: string): boolean {
  const device = getDevice(deviceId);
  return Boolean(device && canViewSceneRoom(access, device.roomId) && access.deviceIds.includes(deviceId));
}

/** Device action grants are independent of whether its state may be displayed. */
export function canControlSceneDevice(access: SceneAccess, deviceId: string): boolean {
  return canViewSceneDevice(access, deviceId) && access.controllableDeviceIds.includes(deviceId);
}
