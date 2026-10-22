import { getDevice } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting } from './deviceControlActions';
import { canControlSceneDevice, type SceneAccess } from './sceneAccess';
import { SCENE_PREVIEW_CHANNEL, SCENE_PREVIEW_TTL_MS, parseScenePreviewCommand, type ScenePreviewStatus } from './scenePreviewProtocol';
import { useScenePreviewStore, type ActiveScenePreview } from './scenePreviewStore';
import type { DeviceState, DeviceStates } from './simulationTypes';

export interface ScenePreviewSource {
  access: SceneAccess;
  deviceStates: DeviceStates;
  roomId: string;
  view: string;
  floor: string;
}
interface ScenePreviewClientOptions {
  getState: () => ScenePreviewSource;
  subscribe: (receive: () => void) => () => void;
  available: () => boolean;
  send: (report: ScenePreviewStatus) => void;
  now?: () => number;
}

/** Normalize grant ordering without treating a new object reference as changed authorization. */
export function scenePreviewAccessSignature(access: SceneAccess): string {
  return JSON.stringify({ fullHome: access.fullHome, propertyOverview: access.propertyOverview === true,
    interiorLayout: access.interiorLayout === true, roomIds: [...access.roomIds].sort(),
    deviceIds: [...access.deviceIds].sort(), controllableDeviceIds: [...access.controllableDeviceIds].sort(),
    editableDeviceIds: [...(access.editableDeviceIds ?? [])].sort() });
}

/** Compare every value on affected devices, including preferences outside the proposed patch. */
function deviceSignature(state: DeviceState | undefined): string {
  return JSON.stringify(state ? [state.on, state.level, Object.entries(state.settings ?? {}).sort(([a], [b]) => a.localeCompare(b))] : null);
}

/** Navigation is preserved; moving to another room or model ends that contextual preview. */
function sceneScope(state: ScenePreviewSource): string { return `${state.view}:${state.floor}:${state.roomId}`; }

/** Recheck scope and affected values before exposing any derived display state. */
export function isScenePreviewCurrent(preview: ActiveScenePreview, state: ScenePreviewSource, now = Date.now()): boolean {
  return preview.payload.expiresAt > now && preview.accessSignature === scenePreviewAccessSignature(state.access)
    && preview.scope === sceneScope(state) && preview.payload.actions.every(({ deviceId }) => canControlSceneDevice(state.access, deviceId)
      && preview.affectedSignatures[deviceId] === deviceSignature(state.deviceStates[deviceId]));
}

/** Merge proposed copies only for rendering; the canonical map and its objects remain untouched. */
export function scenePreviewDisplayStates(state: ScenePreviewSource, preview: ActiveScenePreview | null, comparison: 'current' | 'proposed', now = Date.now()): DeviceStates {
  return preview && comparison === 'proposed' && isScenePreviewCurrent(preview, state, now)
    ? { ...state.deviceStates, ...preview.proposed } : state.deviceStates;
}

/** Read only a bounded correlation envelope so invalid fresh intents cannot replay later. */
function correlationId(input: unknown): number | null {
  let message = input;
  if (typeof message === 'string') {
    if (message.length > 32_768) return null;
    try { message = JSON.parse(message); } catch { return null; }
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const value = message as Record<string, unknown>;
  return value.channel === SCENE_PREVIEW_CHANNEL && value.version === 1 && typeof value.id === 'number'
    && Number.isSafeInteger(value.id) && value.id > 0 ? value.id : null;
}

/** Own the short-lived display session; this client deliberately has no command or persistence writer. */
export function createScenePreviewClient(options: ScenePreviewClientOptions) {
  const now = options.now ?? Date.now;
  let lastId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  /** Report only lifecycle state, never device values, names, grants or account identifiers. */
  function report(id: number, status: ScenePreviewStatus['status']): void {
    options.send({ channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'status', id, status });
  }

  /** Clear both comparison buffers atomically; the canonical scene was never modified. */
  function close(status: Exclude<ScenePreviewStatus['status'], 'active'> = 'closed'): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const active = useScenePreviewStore.getState().active;
    if (!active) return;
    useScenePreviewStore.setState({ active: null, comparison: 'proposed' });
    report(active.id, status);
  }

  /** Backgrounding, revocation or incoming affected-device state invalidates the displayed proposal immediately. */
  function refresh(): void {
    const active = useScenePreviewStore.getState().active;
    if (!active) return;
    if (!options.available()) close('closed');
    else if (active.payload.expiresAt <= now()) close('expired');
    else if (!isScenePreviewCurrent(active, options.getState(), now())) close('stale');
  }

  /** Validate a complete preview before deriving copies with the existing pure setting reducer. */
  function receive(input: unknown): void {
    if (disposed) return;
    const id = correlationId(input);
    if (id === null || id <= lastId) return;
    lastId = id;
    const command = parseScenePreviewCommand(input);
    if (!command) { close('invalid'); report(id, 'invalid'); return; }
    if (command.type === 'clear') { close(); report(id, 'closed'); return; }
    close();
    if (!options.available()) { report(id, 'invalid'); return; }
    const captured = now();
    if (command.preview.expiresAt <= captured) { report(id, 'expired'); return; }
    if (command.preview.expiresAt > captured + SCENE_PREVIEW_TTL_MS) { report(id, 'invalid'); return; }
    const state = options.getState();
    const proposed: DeviceStates = {};
    const affectedSignatures: Record<string, string> = {};
    for (const { deviceId, values, baseline } of command.preview.actions) {
      const device = getDevice(deviceId);
      const current = state.deviceStates[deviceId];
      if (!device || !current || !canControlSceneDevice(state.access, deviceId)) { report(id, 'invalid'); return; }
      if (Object.entries(baseline).some(([field, value]) => readDeviceSetting(device, current, field) !== value)) { report(id, 'stale'); return; }
      let display = { ...current, ...(current.settings ? { settings: { ...current.settings } } : {}) };
      for (const [field, value] of Object.entries(values)) display = applyDeviceSetting(deviceId, display, field, value);
      proposed[deviceId] = display;
      affectedSignatures[deviceId] = deviceSignature(current);
    }
    const active: ActiveScenePreview = { id, payload: command.preview, proposed, affectedSignatures,
      accessSignature: scenePreviewAccessSignature(state.access), scope: sceneScope(state) };
    useScenePreviewStore.setState({ active, comparison: 'proposed' });
    // A backward wall-clock adjustment must not extend the maximum display lifetime.
    timer = setTimeout(() => close('expired'), command.preview.expiresAt - captured);
    report(id, 'active');
  }

  const unsubscribe = options.subscribe(refresh);
  return { receive, refresh, close,
    /** Compare display buffers without changing state, navigation, timers or proposed values. */
    compare(comparison: 'current' | 'proposed'): void {
      refresh();
      if (useScenePreviewStore.getState().active) useScenePreviewStore.setState({ comparison });
    },
    /** Release the single expiry timer and subscription when this renderer goes away. */
    dispose(): void { disposed = true; close(); unsubscribe(); },
  };
}
