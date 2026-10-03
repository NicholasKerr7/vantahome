import { getDevice, ROOMS } from '../../packages/home-scene/src/data';
import { useHomeStore, type HomeState } from '../store/useHomeStore';
import { confirmProtectedAccess } from '../security/biometricConfirmation';
import { supabase } from './supabaseClient';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from './membership';

export type ModelDeviceBinding = { deviceId: string; modelDeviceId: string };

/** Validate both authority and current registry links before and after protected confirmation. */
function validateModelRoomBinding(scope: HomeState, roomId: string, modelRoomId: string | null, bindings: ModelDeviceBinding[]): void {
  const actor = scope.household.find((member) => member.id === scope.activeMemberId);
  if (!scope.membershipReady || !scope.authenticatedUserId || !scope.activeHomeId
    || scope.accountUserId !== scope.authenticatedUserId || scope.accountHomeId !== scope.activeHomeId
    || actor?.id !== scope.authenticatedUserId || !['Owner', 'Admin'].includes(actor.role)) {
    throw new Error('Sign in as a homeowner or administrator to connect the 3D model.');
  }
  if (!scope.rooms.some((room) => room.id === roomId)
    || (modelRoomId !== null && !ROOMS.some((room) => room.id === modelRoomId))
    || (modelRoomId === null && bindings.length > 0)) throw new Error('Choose a valid room connection.');
  if (new Set(bindings.map((binding) => binding.deviceId)).size !== bindings.length
    || new Set(bindings.map((binding) => binding.modelDeviceId)).size !== bindings.length
    || bindings.some((binding) => {
      const actual = scope.devices.find((device) => device.id === binding.deviceId && device.roomId === roomId);
      const model = getDevice(binding.modelDeviceId);
      return !actual || !model || model.kind !== actual.kind || model.roomId !== modelRoomId;
    })) throw new Error('Each device must match one device in the selected 3D room.');
}

/** Save explicit model links atomically, retaining server room/action permissions and simulation isolation. */
export async function saveModelRoomBinding(roomId: string, modelRoomId: string | null, bindings: ModelDeviceBinding[]): Promise<void> {
  const scope = useHomeStore.getState();
  if (!supabase || !scope.authenticatedUserId || !scope.activeHomeId) throw new Error('Sign in to connect the 3D model.');
  validateModelRoomBinding(scope, roomId, modelRoomId, bindings);
  await confirmProtectedAccess('Confirm 3D room connections');
  const current = useHomeStore.getState();
  if (current.sessionEpoch !== scope.sessionEpoch || current.activeHomeId !== scope.activeHomeId
    || current.authenticatedUserId !== scope.authenticatedUserId) throw new Error('Your home changed. Reopen room connections.');
  validateModelRoomBinding(current, roomId, modelRoomId, bindings);
  const { error } = await supabase.rpc('set_model_room_binding', {
    target_room_id: roomId, target_model_room_id: modelRoomId, device_bindings: bindings,
  });
  if (error) throw new Error(error.message);
  const result = await syncMembershipFromSupabase(scope.authenticatedUserId, scope.activeHomeId);
  if (!result || !applyMembershipSnapshot(result, scope.sessionEpoch)) {
    throw new Error('Connections were saved. Reopen your home to refresh its model access.');
  }
}
