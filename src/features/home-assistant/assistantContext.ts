import {
  conciergeValueFields, isComfortKind, MAX_CONCIERGE_CONTEXT_AGE_MS, MAX_CONCIERGE_DEVICES,
  parseConciergeResponse, parseConciergeValues,
  type ConciergeContext, type ConciergeDevice, type ConciergeResponse, type ConciergeValues,
} from '../../../shared/home-concierge/contract';
import { getDevice } from '../../../packages/home-scene/src/data';
import { getCapabilities, readDeviceSetting, validateSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { selectVisibleDevices, selectVisibleRooms, type HomeState, type Scene } from '../../store/useHomeStore';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import { canManageScenes } from '../scenes/sceneManagement';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import type { ControlSnapshot } from '../three-d-home/simulationControlClient';

export type AssistantDevice = ConciergeDevice & {
  modelDeviceId: string;
  name: string;
  roomName: string;
  roomId: string;
  values: ConciergeValues;
};
export type AssistantRoom = { id: string; name: string };
export type AssistantScopeOptions = { roomId?: string | null };
export type AssistantBrief = {
  roomCount: number;
  deviceCount: number;
  onCount: number;
  lightsOnCount: number;
  climateOnCount: number;
};
export type AssistantContext = {
  scope: string;
  roomId: string | null;
  scopeLabel: string;
  availableRooms: AssistantRoom[];
  fingerprint: string;
  capturedAt: number;
  expiresAt: number | null;
  available: boolean;
  reason: string | null;
  devices: AssistantDevice[];
  brief: AssistantBrief;
  canDraft: boolean;
  requestContext: ConciergeContext | null;
};

/** Resolve the current member's absolute Guest deadline without borrowing another member's grant. */
function guestDeadline(state: HomeState): number | null {
  const member = state.household.find((item) => item.id === state.activeMemberId);
  if (member?.role !== 'Guest' || member.accessExpiresAt == null) return null;
  const deadline = Date.parse(member.accessExpiresAt);
  return Number.isFinite(deadline) ? deadline : 0;
}

/** Require the same verified household session used by the model bridge, with no physical transport. */
function currentSimulationAccess(state: HomeState, now: number): boolean {
  const member = state.household.find((item) => item.id === state.activeMemberId);
  const deadline = guestDeadline(state);
  return Boolean(member && !state.authTaskBlockingHome && state.membershipReady
    && state.accountUserId && state.activeHomeId && state.accountUserId === state.authenticatedUserId
    && state.accountHomeId === state.activeHomeId && (member.userId ?? member.id) === state.authenticatedUserId
    && (deadline === null || deadline > now)
    // Signed-in accounts enable the transport setting before a hub is configured.
    // An empty endpoint still uses the saved simulation, as the device editor does.
    && !(state.realtime.enabled && state.realtime.wsUrl.trim()) && !state.realtime.useMqtt);
}

/** Bound untrusted display names without retaining hidden controls in prompts or local review copy. */
function displayName(value: string, fallback: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 120) || fallback;
}

/**
 * Capture authority and catalog identity independently of frequently changing simulated readings.
 * This string remains local; it contains account identity and must never be sent to the provider.
 */
export function assistantAuthorizationFingerprint(state: HomeState, roomId: string | null = null): string {
  const member = state.household.find((item) => item.id === state.activeMemberId);
  const rooms = selectVisibleRooms(state).map((room) => [room.id, room.modelRoomId, room.name]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const devices = selectVisibleDevices(state).filter((device) => isComfortKind(device.kind))
    .map((device) => [device.id, device.kind, device.roomId, device.modelDeviceId, device.simulationOnly, device.name])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const overrides = state.memberPermissionOverrides.filter((entry) => entry.memberId === state.activeMemberId)
    .map((entry) => [entry.permission, entry.allowed]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const access = resolveModelSceneAccess(state);
  return JSON.stringify([homeEditorScope(state), state.authTaskBlockingHome, member?.role, member?.accessExpiresAt,
    state.realtime.enabled, state.realtime.wsUrl.trim(), state.realtime.useMqtt, rooms, devices, overrides,
    [...access.deviceIds].sort(), [...access.controllableDeviceIds].sort(), roomId]);
}

/** Produce an empty, honest result while access or saved simulation observations are unavailable. */
function emptyContext(state: HomeState, now: number, reason: string, roomId: string | null,
  availableRooms: AssistantRoom[] = []): AssistantContext {
  return {
    scope: homeEditorScope(state), roomId, availableRooms,
    scopeLabel: roomId === null ? 'All permitted rooms' : availableRooms.find((room) => room.id === roomId)?.name ?? 'Room unavailable',
    fingerprint: assistantAuthorizationFingerprint(state, roomId), capturedAt: now,
    expiresAt: guestDeadline(state), available: false, reason, devices: [],
    brief: { roomCount: 0, deviceCount: 0, onCount: 0, lightsOnCount: 0, climateOnCount: 0 },
    canDraft: false, requestContext: null,
  };
}

/**
 * Build a strictly scoped comfort snapshot from the model's hydrated state, never registry defaults.
 * Cameras, safety/security, members, occupancy, coordinates, streams and history have no output path.
 */
export function buildAssistantContext(state: HomeState, snapshot: ControlSnapshot, now = Date.now(),
  { roomId = null }: AssistantScopeOptions = {}): AssistantContext {
  if (!Number.isSafeInteger(now) || now <= 0 || !currentSimulationAccess(state, now)) {
    return emptyContext(state, now, 'Verify your home access to use the assistant.', roomId);
  }
  if (!snapshot.ready || !snapshot.access) return emptyContext(state, now, 'Your saved simulation is still connecting.', roomId);
  if (snapshot.status !== 'saved' && snapshot.status !== 'saving') {
    return emptyContext(state, now, 'Saved simulation controls are unavailable. Reconnect before asking.', roomId);
  }
  const access = resolveModelSceneAccess(state);
  const visible = new Set(access.deviceIds.filter((id) => snapshot.access?.deviceIds.includes(id)));
  const controllable = new Set(access.controllableDeviceIds.filter((id) => snapshot.access?.controllableDeviceIds.includes(id)));
  const rooms = new Map(selectVisibleRooms(state)
    .filter((room) => room.modelRoomId && access.roomIds.includes(room.modelRoomId) && snapshot.access?.roomIds.includes(room.modelRoomId))
    .map((room) => [room.id, room]));
  const availableRooms = [...rooms.values()].map((room) => ({ id: room.id, name: displayName(room.name, 'Room') }));
  if (roomId !== null && !rooms.has(roomId)) {
    return emptyContext(state, now, 'This room is unavailable. Choose one of your permitted rooms.', roomId, availableRooms);
  }
  const devices: AssistantDevice[] = [];
  const seen = new Set<string>();
  for (const device of selectVisibleDevices(state)) {
    if (roomId !== null && device.roomId !== roomId) continue;
    if (!isComfortKind(device.kind) || !device.simulationOnly || !device.modelDeviceId || !visible.has(device.modelDeviceId)) continue;
    const definition = getDevice(device.modelDeviceId);
    const room = rooms.get(device.roomId);
    const reading = snapshot.state.deviceStates[device.modelDeviceId];
    if (!definition || definition.kind !== device.kind || !room || room.modelRoomId !== definition.roomId || !reading) continue;
    if (seen.has(device.id) || devices.length >= MAX_CONCIERGE_DEVICES) return emptyContext(state, now, 'The home device directory needs to refresh.', roomId, availableRooms);
    const values: Record<string, unknown> = {};
    for (const field of conciergeValueFields(device.kind)) {
      const value = readDeviceSetting(definition, reading, field);
      const parsed = parseConciergeValues({ [field]: value }, device.kind);
      if (parsed) Object.assign(values, parsed);
    }
    const parsed = parseConciergeValues(values, device.kind);
    if (!parsed) continue;
    seen.add(device.id);
    devices.push({ id: device.id, modelDeviceId: definition.id, kind: device.kind, name: displayName(device.name, 'Device'),
      roomId: room.id, roomName: displayName(room.name, 'Room'), values: parsed, controllable: controllable.has(definition.id) });
  }
  if (!devices.length) return emptyContext(state, now, roomId === null
    ? 'No supported comfort devices are available in your assigned rooms.'
    : 'No supported comfort devices are available in this room.', roomId, availableRooms);
  const canDraft = canManageScenes(state) && devices.some((device) => device.controllable);
  return {
    scope: homeEditorScope(state), roomId, availableRooms,
    scopeLabel: roomId === null ? 'All permitted rooms' : availableRooms.find((room) => room.id === roomId)!.name,
    fingerprint: assistantAuthorizationFingerprint(state, roomId), capturedAt: now,
    expiresAt: guestDeadline(state), available: true, reason: null, devices,
    brief: {
      roomCount: new Set(devices.map((device) => device.roomId)).size, deviceCount: devices.length,
      onCount: devices.filter((device) => device.values.isOn === true).length,
      lightsOnCount: devices.filter((device) => device.kind === 'light' && device.values.isOn === true).length,
      climateOnCount: devices.filter((device) => (device.kind === 'ac' || device.kind === 'fan') && device.values.isOn === true).length,
    },
    canDraft,
    requestContext: { mode: 'simulation', capturedAt: now, devices: devices.map(({ id, values }) => ({ id, values: { ...values } })) },
  };
}

/** Check a captured request against fresh authority and expiry, including same-home leave-and-return. */
export function assistantContextIsCurrent(context: AssistantContext, state: HomeState, now = Date.now()): boolean {
  return context.available && currentSimulationAccess(state, now)
    && context.scope === homeEditorScope(state) && context.fingerprint === assistantAuthorizationFingerprint(state, context.roomId)
    && (context.expiresAt === null || context.expiresAt > now)
    && Number.isFinite(now) && now >= context.capturedAt && now - context.capturedAt <= MAX_CONCIERGE_CONTEXT_AGE_MS;
}

/**
 * Convert only reviewed, explicit desired settings into an unsaved scene. This function never writes
 * a scene or sends commands; fresh scope, controls and supported capabilities are checked again.
 */
export function assistantSceneDraft(response: ConciergeResponse, context: AssistantContext, state: HomeState,
  snapshot: ControlSnapshot, now = Date.now()): Omit<Scene, 'id'> | null {
  if (!assistantContextIsCurrent(context, state, now) || !canManageScenes(state)) return null;
  if (!parseConciergeResponse(response, context.devices, context.canDraft)) return null;
  const current = buildAssistantContext(state, snapshot, now, { roomId: context.roomId });
  if (!current.available || !current.canDraft) return null;
  const parsed = parseConciergeResponse(response, current.devices, current.canDraft);
  if (!parsed?.scene) return null;
  const directory = new Map(current.devices.map((device) => [device.id, device]));
  const capturedDirectory = new Map(context.devices.map((device) => [device.id, device]));
  const actions: Scene['actions'] = [];
  const roomIds = new Set<string>();
  for (const action of parsed.scene.actions) {
    const device = directory.get(action.deviceId);
    const captured = capturedDirectory.get(action.deviceId);
    if (!device || !captured) return null;
    for (const [field, value] of Object.entries(action.values)) {
      // Never silently rebase a proposal onto a changed target; unrelated preferences may change.
      const setting = field as keyof ConciergeValues;
      if (device.values[setting] !== captured.values[setting]) return null;
      if (field === 'isOn') continue;
      const capability = getCapabilities(device.kind).find((entry) => 'field' in entry && entry.field === field);
      if (!capability || capability.type === 'stat' || validateSetting(capability, value) !== value) return null;
    }
    roomIds.add(device.roomId);
    actions.push({ type: 'patch', deviceId: device.id, patch: { ...action.values } });
  }
  const singleRoom = roomIds.size === 1;
  return { name: parsed.scene.name, scope: singleRoom ? 'room' : 'home', roomId: singleRoom ? [...roomIds][0] : '', actions };
}
