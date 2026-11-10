import { selectActiveMember, type HomeState, useHomeStore } from '../../store/useHomeStore';
import { supabase } from '../../services/supabaseClient';
import { resolveModelSceneAccess, modelSimulationScope } from '../three-d-home/modelSceneAccess';
import type { SharedHomeScope } from './householdSyncTransport';

/** Capture only currently visible simulation bindings; private rooms never enter the sync transport. */
export function householdSyncScope(state: HomeState = useHomeStore.getState()): (SharedHomeScope & { storageScope: string; owner: boolean }) | null {
  if (!supabase || typeof supabase.rpc !== 'function' || !state.membershipReady || state.authTaskBlockingHome
    || !state.authenticatedUserId || state.authenticatedUserId !== state.accountUserId
    || !state.activeHomeId || state.activeHomeId !== state.accountHomeId
    || state.realtime.useMqtt || state.realtime.wsUrl.trim()) return null;
  const member = selectActiveMember(state);
  if (!member || (member.userId ?? member.id) !== state.authenticatedUserId) return null;
  const access = resolveModelSceneAccess(state);
  const bindings = state.devices.flatMap((device) => device.simulationOnly && device.modelDeviceId
    && access.deviceIds.includes(device.modelDeviceId) ? [{ deviceId: device.id, modelDeviceId: device.modelDeviceId }] : []);
  if (!bindings.length) return null;
  const key = JSON.stringify([state.authenticatedUserId, state.activeHomeId, state.sessionEpoch, member.role,
    member.accessExpiresAt, access.controllableDeviceIds, bindings, state.memberPermissionOverrides, state.roomMembers]);
  return { key, userId: state.authenticatedUserId, homeId: state.activeHomeId, bindings,
    storageScope: modelSimulationScope(state, false), owner: member.role === 'Owner' };
}

/** Stable selector avoids restarting the connection on ordinary telemetry or presence changes. */
export function householdSyncScopeKey(state: HomeState): string | null { return householdSyncScope(state)?.key ?? null; }
