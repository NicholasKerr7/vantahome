import { DEVICES, ROOMS, getDevice } from '../../../packages/home-scene/src/data';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS, type SceneAccess } from '../../../packages/home-scene/src/sceneAccess';
import type { SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';
import { permissionForCommand, roleHasPermission } from '../../security/permissions';
import { selectVisibleDevices, selectVisibleRooms, type HomeState } from '../../store/useHomeStore';
import { LEGACY_MODEL_ROOM_ALIASES } from './modelHomeCatalog';
import { resolveDemoDeviceMapping } from './demoDeviceMapping';

const roomIds = new Set(ROOMS.map((room) => room.id));

/** Restart presentation clients whenever identity or transport changes invalidate their bridge. */
export function modelSimulationIdentity(state: HomeState): string {
  return JSON.stringify([
    state.accountUserId, state.authenticatedUserId, state.accountHomeId, state.activeHomeId,
    state.sessionEpoch, state.realtime.enabled, state.realtime.useMqtt, state.activeMemberId,
    state.household.find((member) => member.id === state.activeMemberId)?.role,
  ]);
}

/** Resolve authorized model identities only; names and renderer input can never grant room access. */
export function resolveModelSceneAccess(state: HomeState, mode: RuntimeMode = runtimePolicy.mode): SceneAccess {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  const offline = mode === 'demo' && !state.accountUserId && !state.authenticatedUserId
    && !state.accountHomeId && !state.activeHomeId && !state.realtime.enabled && !state.realtime.useMqtt;
  if (!member || !hasCurrentMembershipAccess(member)) return EMPTY_SCENE_ACCESS;
  if (!offline && (!state.membershipReady || !state.authenticatedUserId
    || state.accountUserId !== state.authenticatedUserId
    || member.id !== state.authenticatedUserId || !state.activeHomeId
    || state.activeHomeId !== state.accountHomeId)) return EMPTY_SCENE_ACCESS;
  // Preserve the complete authored demonstration without creating a binding to account observations.
  if (offline && member.role === 'Owner') return FULL_SCENE_ACCESS;
  const modeledRooms = new Map(selectVisibleRooms(state).flatMap((room) => {
    const id = offline ? (roomIds.has(room.id) ? room.id : LEGACY_MODEL_ROOM_ALIASES[room.id]) : room.modelRoomId;
    return id && roomIds.has(id) ? [[room.id, id] as const] : [];
  }));
  const overrides = state.memberPermissionOverrides.filter((entry) => entry.memberId === member.id);
  const visible = new Set<string>();
  const controllable = new Set<string>();
  for (const device of selectVisibleDevices(state)) {
    const id = offline ? resolveDemoDeviceMapping(device)?.sceneId : device.modelDeviceId;
    const definition = id ? getDevice(id) : undefined;
    if (!definition || definition.kind !== device.kind || modeledRooms.get(device.roomId) !== definition.roomId) continue;
    visible.add(definition.id);
    // A whole inspector is enabled only when its most sensitive action is allowed.
    const permission = device.kind === 'gas-meter' || device.kind === 'gas-leak' ? 'safety.control'
      : permissionForCommand({ op: 'toggle', deviceId: device.id }, device);
    const openingDevice = ['door', 'gate', 'garage'].includes(device.kind);
    if (roleHasPermission(member.role, permission, overrides)
      && (!openingDevice || roleHasPermission(member.role, 'device.control', overrides))) controllable.add(definition.id);
  }
  const assigned = new Set(modeledRooms.values());
  return {
    fullHome: member.role !== 'Guest' && member.role !== 'Tenant' && ROOMS.every((room) => assigned.has(room.id)),
    roomIds: ROOMS.filter((room) => assigned.has(room.id)).map((room) => room.id),
    deviceIds: DEVICES.filter((device) => visible.has(device.id)).map((device) => device.id),
    controllableDeviceIds: DEVICES.filter((device) => controllable.has(device.id)).map((device) => device.id),
  };
}

/** Replace hidden simulation readings with inert placeholders before crossing the rendering boundary. */
export function scopeSimulationSnapshot(snapshot: SimulationSnapshot, access: SceneAccess): SimulationSnapshot {
  const allowed = new Set(access.deviceIds);
  return { ...snapshot, deviceStates: Object.fromEntries(DEVICES.map((device) => [device.id,
    allowed.has(device.id) ? snapshot.deviceStates[device.id]
      : { on: device.kind === 'gas-meter' || device.kind === 'gas-leak', level: 0 },
  ])) };
}

/** Keep isolated simulations apart across accounts, households and offline member previews. */
export function modelSimulationScope(state: HomeState, sharedDemo: boolean): string {
  if (sharedDemo) return 'demo';
  return `preview:${JSON.stringify([state.accountUserId ?? state.authenticatedUserId ?? 'local',
    state.accountHomeId ?? state.activeHomeId, state.activeMemberId])}`;
}

/** Native libraries include only explicitly linked registry devices, even in an owner demonstration. */
export function selectModelLibraryDeviceIds(state: HomeState): string[] {
  const access = resolveModelSceneAccess(state);
  const account = Boolean(state.accountUserId || state.authenticatedUserId || state.activeHomeId || state.accountHomeId);
  const linked = new Set(selectVisibleDevices(state).map((device) => account ? device.modelDeviceId : getDevice(device.id)?.id));
  return access.deviceIds.filter((id) => linked.has(id));
}
