import {
  parseSimulationDevicePlacement,
  type SimulationDevicePlacement,
} from '../../packages/home-scene/src/devicePlacement';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHomeStore, type HomeState } from '../store/useHomeStore';
import { confirmProtectedAccess } from '../security/biometricConfirmation';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from './membership';
import { withMembershipMutation } from './membershipRevision';
import { supabase } from './supabaseClient';

export type SimulationDeviceRegistration = {
  /** Keep this UUID stable when retrying the same draft after an uncertain response. */
  requestId: string;
  name: string;
  roomId: string;
  placement: SimulationDevicePlacement;
};

export type SimulationDeviceRegistrationResult = {
  deviceId: string;
  status: 'created' | 'existing';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeRegistrations = new Set<string>();

/** Pending writes belong to one account and home, never a global device draft. */
function journalKey(scope: HomeState): string {
  return `vantahome.simulation-device-registration.v1:${scope.authenticatedUserId}:${scope.activeHomeId}`;
}

/** Resume an uncertain save after closing the wizard or restarting; malformed data never becomes a new request. */
async function readPendingDraft(scope: HomeState): Promise<SimulationDeviceRegistration | null> {
  const raw = await AsyncStorage.getItem(journalKey(scope));
  requireCurrentScope(scope);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid draft.');
    const draft = value as Record<string, unknown>;
    if (Object.keys(draft).length !== 4 || typeof draft.requestId !== 'string' || typeof draft.name !== 'string'
      || typeof draft.roomId !== 'string') throw new Error('Invalid draft.');
    // A deleted/rebound room must not strand the journal. Only the exact saved
    // draft may reach the server again, which can confirm its receipt or removal.
    return validateDraft(useHomeStore.getState(), draft as SimulationDeviceRegistration, false);
  } catch {
    throw new Error('The unfinished device setup needs attention. Reconnect and reopen this home before starting another device.');
  }
}

/** Let the wizard restore the exact submitted draft instead of creating a second device after an interrupted save. */
export async function loadPendingSimulationDeviceRegistration(): Promise<SimulationDeviceRegistration | null> {
  const scope = useHomeStore.getState();
  if (!canManageSimulationDevices(scope)) throw new Error('Sign in as the homeowner or administrator to resume device setup.');
  return readPendingDraft(scope);
}

/** Save recovery metadata before networking; a failed local write must never produce an unrecoverable remote duplicate. */
async function rememberDraft(scope: HomeState, draft: SimulationDeviceRegistration): Promise<void> {
  const pending = await readPendingDraft(scope);
  if (pending && (pending.requestId !== draft.requestId || pending.name !== draft.name || pending.roomId !== draft.roomId
    || JSON.stringify(pending.placement) !== JSON.stringify(draft.placement))) {
    throw new Error('Resume the unfinished device setup before starting a different draft.');
  }
  if (!pending) validateDraft(requireCurrentScope(scope), draft);
  await AsyncStorage.setItem(journalKey(scope), JSON.stringify(draft));
  requireCurrentScope(scope);
}

/** Only verified household administrators with physical transports off can edit this simulation. */
export function canManageSimulationDevices(state: HomeState): boolean {
  const actor = state.household.find((member) => member.id === state.activeMemberId);
  return state.membershipReady && !state.authTaskBlockingHome && Boolean(state.authenticatedUserId)
    && Boolean(state.activeHomeId) && state.accountUserId === state.authenticatedUserId
    && state.accountHomeId === state.activeHomeId && actor?.id === state.authenticatedUserId
    && ['Owner', 'Admin'].includes(actor.role) && !(state.realtime.enabled && state.realtime.wsUrl.trim())
    && !state.realtime.useMqtt;
}

/** Shared Add-device availability uses the same administration boundary as deletion. */
export const canRegisterSimulationDevice = canManageSimulationDevices;

/** Fail before networking when a draft has unknown geometry, mismatched rooms, or invalid identifiers. */
function validateDraft(state: HomeState, draft: SimulationDeviceRegistration, requireRoom = true): SimulationDeviceRegistration {
  if (!canManageSimulationDevices(state)) throw new Error('Sign in as the homeowner or administrator with live connections off to add a simulated device.');
  const placement = parseSimulationDevicePlacement(draft.placement);
  const name = draft.name.trim();
  if (!UUID.test(draft.requestId) || !name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Choose a device name between 1 and 80 characters. Reopen Add device if this draft is invalid.');
  }
  const room = state.rooms.find((candidate) => candidate.id === draft.roomId);
  if (!placement || (requireRoom && (!room || room.modelRoomId !== placement.modelRoomId))) {
    throw new Error('Choose a connected 3D room and a valid position for this device.');
  }
  return { ...draft, name, placement };
}

/** Recheck the original login and household around every asynchronous boundary. */
function requireCurrentScope(scope: HomeState): HomeState {
  const current = useHomeStore.getState();
  if (!canManageSimulationDevices(current) || current.sessionEpoch !== scope.sessionEpoch
    || current.authenticatedUserId !== scope.authenticatedUserId || current.activeHomeId !== scope.activeHomeId) {
    throw new Error('Your home or access changed. Reopen your home before managing devices.');
  }
  return current;
}

/** A confirmed server identity and protected confirmation cannot carry across a sign-out or role change. */
async function verifyAdministrator(scope: HomeState, prompt: string): Promise<void> {
  if (!supabase || !canManageSimulationDevices(scope)) throw new Error('Sign in as the homeowner or administrator to manage simulated devices.');
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== scope.authenticatedUserId || !data.user.email_confirmed_at) {
    throw new Error('Verify your email and sign in again before managing devices.');
  }
  requireCurrentScope(scope);
  await confirmProtectedAccess(prompt);
  requireCurrentScope(scope);
}

/** Reject an invalid receipt rather than interpreting transport acceptance as a saved registry entry. */
function registrationReceipt(value: unknown, homeId: string): SimulationDeviceRegistrationResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  return receipt.homeId === homeId && typeof receipt.deviceId === 'string' && UUID.test(receipt.deviceId)
    && (receipt.status === 'created' || receipt.status === 'existing')
    ? { deviceId: receipt.deviceId, status: receipt.status } : null;
}

/** Refresh from the authorized server registry; never insert an optimistic device that later disappears. */
async function refreshRegistry(scope: HomeState, deviceId: string, removed = false): Promise<void> {
  try {
    requireCurrentScope(scope);
    const result = await syncMembershipFromSupabase(scope.authenticatedUserId!, scope.activeHomeId!);
    requireCurrentScope(scope);
    const device = result?.devices.find((candidate) => candidate.id === deviceId);
    if (!result || result.homeId !== scope.activeHomeId || (removed ? !!device : !device?.simulationOnly || !device.modelPlacement)
      || !applyMembershipSnapshot(result, scope.sessionEpoch)) throw new Error('Registry confirmation is incomplete.');
  } catch {
    throw new Error(removed
      ? 'The device was removed. Reopen your home or retry to refresh its device list.'
      : 'The device was saved. Reopen your home or retry this draft to refresh its device list; it will not create a duplicate.');
  }
}

/** Save registry identity and placement atomically, with one permanent receipt for every retryable draft. */
export async function registerSimulationDevice(input: SimulationDeviceRegistration): Promise<SimulationDeviceRegistrationResult> {
  const scope = useHomeStore.getState();
  const draft = validateDraft(scope, input, false);
  const key = journalKey(scope);
  if (activeRegistrations.has(key)) throw new Error('Device setup is already saving. Wait for its confirmation.');
  activeRegistrations.add(key);
  try {
    if (!await readPendingDraft(scope)) validateDraft(requireCurrentScope(scope), draft);
    await verifyAdministrator(scope, 'Confirm new simulated device');
    validateDraft(requireCurrentScope(scope), draft, false);
    await rememberDraft(scope, draft);
    const { data, error } = await withMembershipMutation(async () => supabase!.rpc('register_simulation_device', {
      target_home_id: scope.activeHomeId,
      target_room_id: draft.roomId,
      request_id: draft.requestId,
      device_name: draft.name,
      placement: draft.placement,
    }));
    if (error) {
      // A validation rejection proves this draft was not newly committed. Unknown
      // outcomes and authorization changes retain the recovery receipt instead.
      if (error.code === '22023') await AsyncStorage.removeItem(key);
      throw new Error(error.message);
    }
    requireCurrentScope(scope);
    const receipt = registrationReceipt(data, scope.activeHomeId!);
    if (!receipt) throw new Error('The save could not be confirmed. Retry this draft to check its status without creating a duplicate.');
    await refreshRegistry(scope, receipt.deviceId);
    // Clearing only after registry confirmation makes a crash at any earlier point retryable.
    await AsyncStorage.removeItem(key);
    requireCurrentScope(scope);
    return receipt;
  } finally {
    activeRegistrations.delete(key);
  }
}

/** Delete only a user-placed virtual registry entry; authored fixtures and physical devices are outside this operation. */
export async function removeSimulationDevice(deviceId: string): Promise<void> {
  const scope = useHomeStore.getState();
  const device = scope.devices.find((candidate) => candidate.id === deviceId);
  if (!UUID.test(deviceId) || !device?.simulationOnly || !parseSimulationDevicePlacement(device.modelPlacement)) {
    throw new Error('Choose a user-placed simulated device to remove.');
  }
  await verifyAdministrator(scope, 'Confirm removal of simulated device');
  const current = requireCurrentScope(scope).devices.find((candidate) => candidate.id === deviceId);
  if (!current?.simulationOnly || !parseSimulationDevicePlacement(current.modelPlacement)) {
    throw new Error('This device changed. Reopen its controls before removing it.');
  }
  const { data, error } = await withMembershipMutation(async () => supabase!.rpc('remove_simulation_device', {
    target_home_id: scope.activeHomeId, target_device_id: deviceId,
  }));
  if (error) throw new Error(error.message);
  requireCurrentScope(scope);
  if (data !== deviceId) throw new Error('Removal could not be confirmed. Retry to check its status.');
  await refreshRegistry(scope, deviceId, true);
}
