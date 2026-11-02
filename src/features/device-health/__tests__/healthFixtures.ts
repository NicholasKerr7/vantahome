import { DEVICES, ROOMS } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';

/** Build explicit authenticated model bindings rather than granting a layout-only property view. */
export function healthFixture(role: HouseholdMember['role'] = 'Owner'): HomeState {
  const kinds = ['light', 'vacuum', 'ac', 'camera', 'smoke', 'battery'] as const;
  return { ...useHomeStore.getState(), accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    activeMemberId: 'person', sessionEpoch: 10, membershipReady: true, authTaskBlockingHome: false,
    household: [{ id: 'person', name: 'Person', role, status: 'home' }], memberPermissionOverrides: [], roomMembers: [],
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    rooms: ROOMS.map((room) => ({ id: `room-${room.id}`, name: room.name, modelRoomId: room.id })),
    devices: kinds.map((kind) => { const model = DEVICES.find((device) => device.kind === kind)!;
      return { id: `registry-${kind}`, kind, name: `${kind} fixture`, roomId: `room-${model.roomId}`, isOn: false, modelDeviceId: model.id, simulationOnly: true }; }),
  };
}

/** Add explicit sample values without changing any real store or persistent state. */
export function healthSnapshot() {
  const snapshot = createDefaultSimulationSnapshot();
  for (const device of DEVICES) if (device.kind === 'vacuum') snapshot.deviceStates[device.id] = {
    ...snapshot.deviceStates[device.id], settings: { battery: 80, vacuumFilterLife: 90, vacuumBinFull: false, vacuumBrushDirty: false },
  };
  return snapshot;
}
