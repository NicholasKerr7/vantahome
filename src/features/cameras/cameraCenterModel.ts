import { getDevice } from '../../../packages/home-scene/src/data';
import { getCameraConsolePresentation } from '../../../packages/home-scene/src/cameraController';
import type { SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';
import { roleHasPermission } from '../../security/permissions';
import { selectVisibleDevices, type Device, type HomeState } from '../../store/useHomeStore';
import { isModelHome } from '../three-d-home/modelHomeScope';
import { selectSimulationDeviceBindings } from '../three-d-home/simulationDeviceBindings';

/** Only harmless presentation data reaches the camera wall; no remote media addresses are copied. */
export interface CameraCenterCamera {
  id: string;
  name: string;
  roomName: string;
  view: 'entry' | 'driveway' | 'terrace' | 'generic';
  status: 'demo' | 'privacy' | 'stale' | 'configured' | 'unconfigured' | 'unavailable';
  statusDetail: string;
  favorite: boolean;
  modelDeviceId?: string;
  nightVision?: boolean;
  armed?: boolean;
  canControl: boolean;
}

/** Saved simulation events have no capture time, image, person identity or recording URL. */
export interface CameraCenterEvent {
  id: string;
  cameraId: string;
  label: string;
  timeLabel: string;
  detail: string;
}

export interface CameraCenterAccess {
  canView: boolean;
  canViewActivity: boolean;
  canManage: boolean;
  devices: Device[];
  bindings: Record<string, string>;
  scopeKey: string | null;
  identityKey: string;
  usesSimulationCenter: boolean;
}

/** Verify household identity and camera permissions independently of shared property geometry. */
export function getCameraCenterAccess(
  state: HomeState,
  mode: RuntimeMode = runtimePolicy.mode,
  now = Date.now(),
): CameraCenterAccess {
  const member = state.household.find((item) => item.id === state.activeMemberId);
  const offline = mode === 'demo' && !state.accountUserId && !state.authenticatedUserId
    && !state.accountHomeId && !state.activeHomeId && !state.realtime.enabled && !state.realtime.useMqtt;
  const verified = !state.authTaskBlockingHome && hasCurrentMembershipAccess(member, now)
    && (offline || Boolean(state.membershipReady && state.authenticatedUserId
      && state.accountUserId === state.authenticatedUserId && member?.id === state.authenticatedUserId
      && state.activeHomeId && state.accountHomeId === state.activeHomeId));
  const overrides = state.memberPermissionOverrides.filter((item) => item.memberId === member?.id);
  const canView = Boolean(verified && member && roleHasPermission(member.role, 'device.view', overrides)
    && roleHasPermission(member.role, 'camera.live', overrides));
  const devices = canView ? selectVisibleDevices(state).filter((device) => device.kind === 'camera') : [];
  const allowed = new Set(devices.map((device) => device.id));
  const bindings = canView ? Object.fromEntries(Object.entries(selectSimulationDeviceBindings(state, mode))
    .filter(([id, modelId]) => allowed.has(id) && getDevice(modelId)?.kind === 'camera')) : {};
  const scopeKey = verified ? JSON.stringify([
    offline ? 'demo' : state.authenticatedUserId,
    offline ? 'model' : state.activeHomeId,
    state.activeMemberId,
  ]) : null;
  // A different accessible camera set renews the protected-view boundary;
  // harmless labels, telemetry and ordering changes do not prompt again.
  const cameraScope = devices.map((device) => [device.id, bindings[device.id] ?? null] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canView,
    canViewActivity: Boolean(canView && member && roleHasPermission(member.role, 'camera.history', overrides)),
    canManage: Boolean(canView && member && roleHasPermission(member.role, 'camera.manage', overrides)),
    devices,
    bindings,
    scopeKey,
    identityKey: JSON.stringify([scopeKey, state.sessionEpoch, member?.role, canView, cameraScope]),
    usesSimulationCenter: isModelHome(state, mode) || Boolean(verified
      && state.devices.some((device) => device.kind === 'camera' && device.simulationOnly && device.modelDeviceId)),
  };
}

/** Known authored mounting labels select illustration variants, never inferred camera coverage. */
function cameraView(modelDeviceId: string | undefined): CameraCenterCamera['view'] {
  const definition = modelDeviceId ? getDevice(modelDeviceId) : undefined;
  const id = definition?.templateDeviceId ?? modelDeviceId;
  if (id === 'entry-camera') return 'entry';
  if (id === 'drive-camera') return 'driveway';
  if (id === 'terrace-camera') return 'terrace';
  return 'generic';
}

/** Project only current authorized canonical simulation values, withholding them until hydration. */
export function buildCameraCenterModel(
  access: CameraCenterAccess,
  rooms: readonly { id: string; name: string }[],
  simulation: SimulationSnapshot | null,
  favorites: readonly string[] = [],
): { cameras: CameraCenterCamera[]; events: CameraCenterEvent[] } {
  if (!access.canView) return { cameras: [], events: [] };
  const favoriteIds = new Set(favorites);
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
  const events: CameraCenterEvent[] = [];
  const cameras = access.devices.map((device): CameraCenterCamera => {
    const modelDeviceId = access.bindings[device.id];
    const definition = modelDeviceId ? getDevice(modelDeviceId) : undefined;
    const saved = modelDeviceId ? simulation?.deviceStates[modelDeviceId] : undefined;
    const camera = definition && saved ? getCameraConsolePresentation(definition, saved) : null;
    // An existing connection can be opened deliberately in its original viewer;
    // its URL never enters this simulation-only projection or claims live playback.
    const configured = !modelDeviceId && typeof device.streamUrl === 'string' && Boolean(device.streamUrl.trim());
    if (camera && access.canViewActivity && !['none', 'unavailable'].includes(camera.previewEvent.kind)) {
      events.push({
        id: `${device.id}:${camera.previewEvent.kind}`,
        cameraId: device.id,
        label: camera.previewEvent.kind === 'snapshot' ? 'Sample snapshot'
          : camera.previewEvent.kind === 'known-visitor' ? 'Sample familiar visitor' : 'Sample visitor alert',
        timeLabel: 'No capture time',
        detail: 'Last saved simulation event. No photo or video was captured.',
      });
    }
    return {
      id: device.id,
      name: device.name,
      roomName: roomNames.get(device.roomId) ?? 'Assigned room',
      view: cameraView(modelDeviceId),
      status: camera ? 'demo' : modelDeviceId ? 'unavailable' : configured ? 'configured' : 'unconfigured',
      statusDetail: camera ? `${camera.armed ? 'Armed' : 'Disarmed'} preference · No live feed`
        : modelDeviceId ? 'Saved preview unavailable' : configured ? 'Open the configured viewer' : 'Camera not connected to this preview',
      favorite: favoriteIds.has(device.id),
      ...(modelDeviceId ? { modelDeviceId } : {}),
      ...(camera ? { nightVision: camera.nightVision, armed: camera.armed } : {}),
      canControl: access.canManage,
    };
  });
  // Favorite order is deliberately stable and is stored independently of device settings.
  const order = new Map(favorites.map((id, index) => [id, index]));
  cameras.sort((left, right) => (order.get(left.id) ?? favorites.length) - (order.get(right.id) ?? favorites.length));
  return { cameras, events };
}
