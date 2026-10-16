import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSimulationDevicePlacement, type SimulationDevicePlacement } from '../../packages/home-scene/src/devicePlacement';
import { confirmProtectedAccess } from '../security/biometricConfirmation';
import { useHomeStore, type Device, type HomeState } from '../store/useHomeStore';
import { applyMembershipSnapshot, syncMembershipFromSupabase } from './membership';
import { withMembershipMutation } from './membershipRevision';
import { canManageSimulationDevices } from './simulationDeviceRegistration';
import { supabase } from './supabaseClient';

export type SimulationDeviceEdit = {
  requestId: string;
  deviceId: string;
  expectedRevision: number;
  name: string;
  roomId: string;
  placement: SimulationDevicePlacement;
};
export type SimulationDeviceEditResult = { deviceId: string; status: 'updated' | 'existing'; revision: number };

/** A confirmed conflict includes the refreshed record; the editor can deliberately start a new draft. */
export class SimulationDeviceEditConflictError extends Error {
  readonly code: 'conflict' | 'removed';
  readonly latestDevice: Device | null;

  /** Keep uncertain network errors distinct from a server-confirmed newer edit or removal. */
  constructor(latestDevice: Device | null) {
    super(latestDevice ? 'This device changed while you were editing. Load its latest details before continuing.'
      : 'This device has been removed. Your edit has not recreated it.');
    this.name = 'SimulationDeviceEditConflictError';
    this.code = latestDevice ? 'conflict' : 'removed';
    this.latestDevice = latestDevice;
  }
}

/** A rejected payload did not commit and may be corrected with a fresh request. */
export class SimulationDeviceEditValidationError extends Error {
  readonly code = 'invalid';

  /** Preserve the useful server validation explanation while exposing a reliable UI discriminator. */
  constructor(message: string) {
    super(message);
    this.name = 'SimulationDeviceEditValidationError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeEdits = new Set<string>();

/** A saved fixture is editable only when the registry supplied its current server revision. */
export function canEditSimulationDevice(state: HomeState, deviceId: string): boolean {
  const device = state.devices.find((candidate) => candidate.id === deviceId);
  return canManageSimulationDevices(state) && UUID.test(deviceId) && device?.simulationOnly === true
    && device.modelDeviceId === `placed-${deviceId}` && !!parseSimulationDevicePlacement(device.modelPlacement)
    && Number.isInteger(device.modelRevision) && device.modelRevision! >= 0;
}

/** Journal keys prevent an interrupted edit from crossing households, people or devices. */
function journalKey(scope: HomeState, deviceId: string): string {
  return `vantahome.simulation-device-edit.v1:${scope.authenticatedUserId}:${scope.activeHomeId}:${deviceId}`;
}

/** Revalidate identity and administration before and after every asynchronous boundary. */
function requireCurrentScope(scope: HomeState): HomeState {
  const current = useHomeStore.getState();
  if (!canManageSimulationDevices(current) || current.sessionEpoch !== scope.sessionEpoch
    || current.authenticatedUserId !== scope.authenticatedUserId || current.activeHomeId !== scope.activeHomeId) {
    throw new Error('Your home or access changed. Reopen your home before editing devices.');
  }
  return current;
}

/** Parse the immutable submitted payload separately from mutable room/device availability. */
function validateDraft(value: unknown): SimulationDeviceEdit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid device edit.');
  const draft = value as Record<string, unknown>;
  const placement = parseSimulationDevicePlacement(draft.placement);
  if (Object.keys(draft).length !== 6 || typeof draft.requestId !== 'string' || !UUID.test(draft.requestId)
    || typeof draft.deviceId !== 'string' || !UUID.test(draft.deviceId)
    || typeof draft.roomId !== 'string' || !UUID.test(draft.roomId)
    || typeof draft.expectedRevision !== 'number' || !Number.isInteger(draft.expectedRevision)
    || draft.expectedRevision < 0 || draft.expectedRevision > 2147483647
    || typeof draft.name !== 'string' || !draft.name.trim() || draft.name.trim().length > 80
    || /[\u0000-\u001f\u007f]/.test(draft.name) || !placement) {
    throw new Error('Choose a valid device name, room and position before saving.');
  }
  return { requestId: draft.requestId, deviceId: draft.deviceId, expectedRevision: draft.expectedRevision,
    name: draft.name.trim(), roomId: draft.roomId, placement };
}

/** Validate a new draft without preventing exact recovery after its room/device has changed. */
function validateNewDraft(scope: HomeState, draft: SimulationDeviceEdit): void {
  const current = requireCurrentScope(scope);
  const device = current.devices.find((candidate) => candidate.id === draft.deviceId);
  const room = current.rooms.find((candidate) => candidate.id === draft.roomId);
  if (!canEditSimulationDevice(current, draft.deviceId) || !room || room.modelRoomId !== draft.placement.modelRoomId
    || device?.modelPlacement?.templateId !== draft.placement.templateId) {
    throw new Error('Choose a saved simulated device and a compatible connected room.');
  }
}

/** Recover only structurally valid drafts in the active account; a stale draft can still query its receipt. */
async function readPending(scope: HomeState, deviceId: string): Promise<SimulationDeviceEdit | null> {
  const raw = await AsyncStorage.getItem(journalKey(scope, deviceId));
  requireCurrentScope(scope);
  if (raw === null) return null;
  try {
    const draft = validateDraft(JSON.parse(raw));
    if (draft.deviceId !== deviceId) throw new Error('Wrong device.');
    return draft;
  } catch {
    throw new Error('The unfinished device edit needs attention. Reconnect and reopen this home before editing again.');
  }
}

/** Restore the exact request after an interrupted save, including a device that has since been removed. */
export async function loadPendingSimulationDeviceEdit(deviceId: string): Promise<SimulationDeviceEdit | null> {
  const scope = useHomeStore.getState();
  requireCurrentScope(scope);
  if (!UUID.test(deviceId)) throw new Error('Choose a saved device.');
  return readPending(scope, deviceId);
}

/** Confirm the signed-in server identity before any protected mutation or deliberate conflict reload. */
async function verifyAdministrator(scope: HomeState): Promise<void> {
  requireCurrentScope(scope);
  if (!supabase) throw new Error('Reconnect before editing this device.');
  const { data, error } = await supabase.auth.getUser();
  requireCurrentScope(scope);
  if (error || data.user?.id !== scope.authenticatedUserId || !data.user.email_confirmed_at) {
    throw new Error('Verify your email and sign in again before editing devices.');
  }
}

/** Refresh the server-owned registry while membership merge retains same-identity simulation settings. */
async function refreshRegistry(scope: HomeState, deviceId: string): Promise<Device | null> {
  requireCurrentScope(scope);
  const result = await syncMembershipFromSupabase(scope.authenticatedUserId!, scope.activeHomeId!);
  requireCurrentScope(scope);
  if (!result || result.homeId !== scope.activeHomeId || !applyMembershipSnapshot(result, scope.sessionEpoch)) {
    throw new Error('The latest device details could not be confirmed. Reconnect and retry this edit.');
  }
  const current = requireCurrentScope(scope);
  return current.devices.find((candidate) => candidate.id === deviceId) ?? null;
}

/** Explicitly reload current details without abandoning an unresolved write receipt. */
export async function refreshSimulationDeviceForEdit(deviceId: string): Promise<Device | null> {
  const scope = useHomeStore.getState();
  if (!UUID.test(deviceId)) throw new Error('Choose a saved device.');
  await verifyAdministrator(scope);
  return refreshRegistry(scope, deviceId);
}

/** The server receipt is proof of a committed edit, not proof it remains the newest revision. */
function parseReceipt(value: unknown, scope: HomeState, draft: SimulationDeviceEdit): SimulationDeviceEditResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  return receipt.homeId === scope.activeHomeId && receipt.deviceId === draft.deviceId
    && (receipt.status === 'updated' || receipt.status === 'existing')
    && typeof receipt.revision === 'number' && Number.isInteger(receipt.revision)
    && receipt.revision >= draft.expectedRevision && receipt.revision <= draft.expectedRevision + 1
    ? { deviceId: draft.deviceId, status: receipt.status, revision: receipt.revision } : null;
}

/** Atomically edit metadata under optimistic concurrency; never delete/recreate a fixture or overwrite its settings. */
export async function updateSimulationDevice(input: SimulationDeviceEdit): Promise<SimulationDeviceEditResult> {
  const scope = useHomeStore.getState();
  requireCurrentScope(scope);
  const draft = validateDraft(input);
  const key = journalKey(scope, draft.deviceId);
  if (activeEdits.has(key)) throw new Error('This device is already saving. Wait for confirmation.');
  activeEdits.add(key);
  let safeToRevise = false;
  try {
    const pending = await readPending(scope, draft.deviceId);
    if (pending && JSON.stringify(pending) !== JSON.stringify(draft)) {
      throw new Error('Retry the unfinished edit before making different changes.');
    }
    safeToRevise = pending === null;
    if (!pending) validateNewDraft(scope, draft);
    await verifyAdministrator(scope);
    await confirmProtectedAccess('Confirm simulated device changes');
    requireCurrentScope(scope);
    if (!pending) validateNewDraft(scope, draft);
    // Once journal persistence starts, keep the exact request even if disk or network completion is uncertain.
    safeToRevise = false;
    await AsyncStorage.setItem(key, JSON.stringify(draft));
    requireCurrentScope(scope);
    const { data, error } = await withMembershipMutation(async () => supabase!.rpc('update_simulation_device', {
      target_home_id: scope.activeHomeId, target_device_id: draft.deviceId, target_room_id: draft.roomId,
      request_id: draft.requestId, expected_revision: draft.expectedRevision, device_name: draft.name, placement: draft.placement,
    }));
    requireCurrentScope(scope);
    if (error) {
      if (error.code === 'VH409' || error.code === 'VH404') {
        const latest = await refreshRegistry(scope, draft.deviceId);
        await AsyncStorage.removeItem(key);
        requireCurrentScope(scope);
        throw new SimulationDeviceEditConflictError(latest);
      }
      if (error.code === '22023') {
        // A definite validation rejection has no pending mutation to recover.
        await AsyncStorage.removeItem(key);
        requireCurrentScope(scope);
        throw new SimulationDeviceEditValidationError(error.message);
      }
      throw new Error(error.message);
    }
    const receipt = parseReceipt(data, scope, draft);
    if (!receipt) throw new Error('The edit could not be confirmed. Retry these same changes safely.');
    const latest = await refreshRegistry(scope, draft.deviceId);
    if (!latest || (latest.modelRevision !== undefined && latest.modelRevision > receipt.revision)) {
      await AsyncStorage.removeItem(key);
      requireCurrentScope(scope);
      throw new SimulationDeviceEditConflictError(latest);
    }
    if (!latest.simulationOnly || latest.modelRevision !== receipt.revision || latest.roomId !== draft.roomId
      || latest.name !== draft.name || JSON.stringify(latest.modelPlacement) !== JSON.stringify(draft.placement)) {
      throw new Error('The saved edit is awaiting confirmation. Retry these same changes to refresh its details.');
    }
    await AsyncStorage.removeItem(key);
    requireCurrentScope(scope);
    return receipt;
  } catch (error) {
    if (safeToRevise) {
      // Protected-confirmation cancellation and local validation happen before any recoverable write.
      throw new SimulationDeviceEditValidationError(error instanceof Error ? error.message : 'Device editing was cancelled.');
    }
    throw error;
  } finally {
    activeEdits.delete(key);
  }
}
