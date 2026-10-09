import { DEVICES, ROOMS } from '../../../packages/home-scene/src/data';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';

/** Public virtual registry fixture uses the authenticated binding path without an account or network request. */
export function virtualSceneHome(overrides: Partial<HomeState> = {}): HomeState {
  return {
    ...useHomeStore.getInitialState(),
    accountUserId: 'scene-owner', authenticatedUserId: 'scene-owner', accountHomeId: 'scene-home', activeHomeId: 'scene-home',
    activeMemberId: 'scene-owner', membershipReady: true, sessionEpoch: 52,
    household: [{ id: 'scene-owner', userId: 'scene-owner', name: 'Owner', role: 'Owner', status: 'home' }],
    memberPermissionOverrides: [], roomMembers: [], scenes: [], flows: [], rules: [], activeSceneId: null, lastSceneRun: null,
    rooms: ROOMS.map((room) => ({ id: `registry-room:${room.id}`, name: room.name, modelRoomId: room.id })),
    devices: DEVICES.map((device) => ({ id: `registry-device:${device.id}`, name: device.name, kind: device.kind,
      roomId: `registry-room:${device.roomId}`, modelDeviceId: device.id, simulationOnly: true, isOn: false })),
    ...overrides,
  };
}
