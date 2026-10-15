import { getSimulationDeviceTemplate, parseRuntimePlacedDevices, replaceRuntimeDevices, type RuntimePlacedDevice } from '../../../packages/home-scene/src/devicePlacement';
import { selectVisibleDevices, type HomeState } from '../../store/useHomeStore';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';

/** Derive geometry only from freshly admitted, explicitly simulated registry rows in the current home. */
export function runtimeDevicesForHome(state: HomeState): RuntimePlacedDevice[] {
  const member = state.household.find((item) => item.id === state.activeMemberId);
  if (!state.membershipReady || state.authTaskBlockingHome || !state.authenticatedUserId || !state.activeHomeId
    || state.accountUserId !== state.authenticatedUserId || state.accountHomeId !== state.activeHomeId
    || member?.id !== state.authenticatedUserId || !hasCurrentMembershipAccess(member)) return [];
  const candidates = selectVisibleDevices(state).flatMap((device) => {
    const placement = device.modelPlacement;
    const room = state.rooms.find((candidate) => candidate.id === device.roomId);
    if (!device.simulationOnly || !placement || device.modelDeviceId !== `placed-${device.id}`
      || room?.modelRoomId !== placement.modelRoomId || getSimulationDeviceTemplate(placement.templateId)?.kind !== device.kind) return [];
    return [{ id: device.modelDeviceId, name: device.name, placement }];
  });
  return parseRuntimePlacedDevices(candidates) ?? [];
}

/** Run before presentation subscribers so every native control resolves the same current-scope catalog. */
export function synchronizeRuntimeDeviceCatalog(state: HomeState): void {
  replaceRuntimeDevices(runtimeDevicesForHome(state));
}
