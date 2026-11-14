import { DEVICES, ROOMS, getDevice } from '../../../packages/home-scene/src/data';
import { selectVisibleDevices, selectVisibleRooms, type HomeState } from '../../store/useHomeStore';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import type { ControlSnapshot } from '../three-d-home/simulationControlClient';
import type { HomeVoiceContext } from './voiceCommandParser';

/** Use current registered names and intersect grants; a voice directory never expands device access. */
export function voicePropertyContext(state: HomeState, snapshot: ControlSnapshot, roomId: string | null = null): HomeVoiceContext {
  const empty = { devices: [], rooms: [], selectedRoomId: roomId };
  if (!snapshot.ready || !snapshot.access || state.authTaskBlockingHome) return empty;
  const access = resolveModelSceneAccess(state);
  const visible = new Set(access.deviceIds.filter((id) => snapshot.access?.deviceIds.includes(id)));
  if (!state.authenticatedUserId && !state.accountUserId) {
    return { devices: DEVICES.filter((device) => visible.has(device.id)), rooms: ROOMS.filter((room) => access.roomIds.includes(room.id)), selectedRoomId: roomId };
  }
  const rooms = selectVisibleRooms(state).filter((room) => room.modelRoomId && access.roomIds.includes(room.modelRoomId)
    && snapshot.access?.roomIds.includes(room.modelRoomId) && (roomId === null || room.id === roomId));
  const roomIds = new Set(rooms.map((room) => room.id));
  const devices = selectVisibleDevices(state).flatMap((device) => {
    const definition = device.modelDeviceId ? getDevice(device.modelDeviceId) : undefined;
    const room = rooms.find((candidate) => candidate.id === device.roomId);
    return definition && device.simulationOnly && definition.kind === device.kind && roomIds.has(device.roomId)
      && room?.modelRoomId === definition.roomId && visible.has(definition.id)
      ? [{ ...definition, name: device.name }] : [];
  });
  return { devices, rooms: rooms.map((room) => ({ id: room.modelRoomId!, name: room.name })), selectedRoomId: rooms.find((room) => room.id === roomId)?.modelRoomId ?? null };
}

/** Supply speech hints from permitted registry names only; never upload a whole property or account record. */
export function permittedVoiceVocabulary(state: HomeState, roomId: string | null): string[] {
  if (!state.membershipReady || !state.authenticatedUserId || state.authTaskBlockingHome) return [];
  const access = resolveModelSceneAccess(state);
  const rooms = selectVisibleRooms(state).filter((room) => room.modelRoomId && access.roomIds.includes(room.modelRoomId)
    && (roomId === null || room.id === roomId));
  const ids = new Set(rooms.map((room) => room.id));
  return [...rooms.map((room) => room.name), ...selectVisibleDevices(state)
    .filter((device) => device.simulationOnly && device.modelDeviceId && ids.has(device.roomId) && access.deviceIds.includes(device.modelDeviceId))
    .map((device) => device.name)];
}
