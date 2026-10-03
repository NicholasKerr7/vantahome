import { DEVICES, ROOMS, getDevice } from './data';

/** A host-issued view and control scope; it never contains account identifiers. */
export interface SceneAccess {
  fullHome: boolean;
  roomIds: string[];
  deviceIds: string[];
  controllableDeviceIds: string[];
}

export const EMPTY_SCENE_ACCESS: SceneAccess = { fullHome: false, roomIds: [], deviceIds: [], controllableDeviceIds: [] };
export const FULL_SCENE_ACCESS: SceneAccess = {
  fullHome: true, roomIds: ROOMS.map(({ id }) => id), deviceIds: DEVICES.map(({ id }) => id),
  controllableDeviceIds: DEVICES.map(({ id }) => id),
};

/** Validate every grant, including device-to-room membership and control-to-view containment. */
export function parseSceneAccess(value: unknown): SceneAccess | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const fields = ['fullHome', 'roomIds', 'deviceIds', 'controllableDeviceIds'];
  if (Object.keys(candidate).some((key) => !fields.includes(key)) || typeof candidate.fullHome !== 'boolean') return null;
  /** Grants are unique strings; duplicates are rejected rather than silently normalized. */
  const list = (input: unknown): input is string[] => Array.isArray(input) && input.every((id) => typeof id === 'string') && new Set(input).size === input.length;
  if (!list(candidate.roomIds) || !list(candidate.deviceIds) || !list(candidate.controllableDeviceIds)) return null;
  const rooms = new Set(candidate.roomIds);
  if (candidate.roomIds.some((id) => !ROOMS.some((room) => room.id === id))) return null;
  if (candidate.fullHome && ROOMS.some((room) => !rooms.has(room.id))) return null;
  if (candidate.deviceIds.some((id) => { const device = getDevice(id); return !device || !rooms.has(device.roomId); })) return null;
  if (candidate.controllableDeviceIds.some((id) => !(candidate.deviceIds as string[]).includes(id))) return null;
  return { fullHome: candidate.fullHome, roomIds: [...candidate.roomIds], deviceIds: [...candidate.deviceIds], controllableDeviceIds: [...candidate.controllableDeviceIds] };
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
