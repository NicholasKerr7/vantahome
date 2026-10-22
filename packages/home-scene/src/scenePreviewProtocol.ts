import { isComfortKind, parseConciergeValues, type ConciergeValues } from '../../../shared/home-concierge/contract';
import { getDevice, ROOMS } from './data';

export const SCENE_PREVIEW_CHANNEL = 'vantahome-scene-preview';
export const SCENE_PREVIEW_TTL_MS = 60_000;
const MAX_MESSAGE_LENGTH = 32_768;

export interface ScenePreviewPayload {
  title: string;
  expiresAt: number;
  actions: { deviceId: string; values: ConciergeValues; baseline: ConciergeValues }[];
}
export type ScenePreviewCommand =
  | { channel: typeof SCENE_PREVIEW_CHANNEL; version: 1; id: number; type: 'set'; preview: ScenePreviewPayload }
  | { channel: typeof SCENE_PREVIEW_CHANNEL; version: 1; id: number; type: 'clear' };
export interface ScenePreviewStatus {
  channel: typeof SCENE_PREVIEW_CHANNEL;
  version: 1;
  type: 'status';
  id: number;
  status: 'active' | 'closed' | 'expired' | 'invalid' | 'stale';
}
export interface ScenePreviewSelection {
  channel: typeof SCENE_PREVIEW_CHANNEL;
  version: 1;
  type: 'selection';
  modelRoomId: string | null;
}
export type ScenePreviewReport = ScenePreviewStatus | ScenePreviewSelection;
type PreviewWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };

/** Reject prototype-bearing records and undocumented fields at every message boundary. */
function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(','));
}

/** Bound native strings before parsing; browser objects undergo the same field checks. */
function readMessage(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  if (input.length > MAX_MESSAGE_LENGTH) return null;
  try { return JSON.parse(input); } catch { return null; }
}

/** Correlation IDs are positive safe integers, never credentials or account identifiers. */
function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Validate only explicit comfort values, including an exact matching baseline field set. */
export function parseScenePreviewCommand(input: unknown): ScenePreviewCommand | null {
  const message = readMessage(input);
  if (!message || typeof message !== 'object') return null;
  const value = message as Record<string, unknown>;
  if (value.channel !== SCENE_PREVIEW_CHANNEL || value.version !== 1 || !validId(value.id)) return null;
  if (hasKeys(value, ['channel', 'version', 'id', 'type']) && value.type === 'clear') return value as ScenePreviewCommand;
  if (!hasKeys(value, ['channel', 'version', 'id', 'type', 'preview']) || value.type !== 'set') return null;
  const preview = value.preview;
  if (!hasKeys(preview, ['title', 'expiresAt', 'actions']) || typeof preview.title !== 'string'
    || !preview.title.trim() || preview.title.length > 80 || /[\u0000-\u001f\u007f]/.test(preview.title)
    || typeof preview.expiresAt !== 'number' || !Number.isSafeInteger(preview.expiresAt) || preview.expiresAt <= 0
    || !Array.isArray(preview.actions) || !preview.actions.length || preview.actions.length > 32) return null;
  const actions: ScenePreviewPayload['actions'] = [];
  for (const action of preview.actions) {
    if (!hasKeys(action, ['deviceId', 'values', 'baseline']) || typeof action.deviceId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(action.deviceId)
      || actions.some((prior) => prior.deviceId === action.deviceId)) return null;
    const device = getDevice(action.deviceId);
    if (!device || !isComfortKind(device.kind)) return null;
    const values = parseConciergeValues(action.values, device.kind);
    const baseline = parseConciergeValues(action.baseline, device.kind);
    // Provider null placeholders are deliberately forbidden in this display protocol.
    if (!values || !baseline || !hasKeys(action.values, Object.keys(values))
      || !hasKeys(action.baseline, Object.keys(values)) || Object.keys(baseline).length !== Object.keys(values).length) return null;
    actions.push({ deviceId: action.deviceId, values, baseline });
  }
  return { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'set', id: value.id,
    preview: { title: preview.title.trim(), expiresAt: preview.expiresAt, actions } };
}

/** Parse presentation-only responses without exposing device state or room labels. */
export function parseScenePreviewReport(input: unknown): ScenePreviewReport | null {
  const value = readMessage(input);
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.channel !== SCENE_PREVIEW_CHANNEL || message.version !== 1) return null;
  if (hasKeys(message, ['channel', 'version', 'type', 'id', 'status']) && message.type === 'status'
    && validId(message.id) && typeof message.status === 'string'
    && ['active', 'closed', 'expired', 'invalid', 'stale'].includes(message.status)) return message as unknown as ScenePreviewStatus;
  if (hasKeys(message, ['channel', 'version', 'type', 'modelRoomId']) && message.type === 'selection'
    && (message.modelRoomId === null || (typeof message.modelRoomId === 'string' && ROOMS.some((room) => room.id === message.modelRoomId)))) return message as unknown as ScenePreviewSelection;
  return null;
}

/** Construct a display intent; a null payload explicitly ends an earlier preview. */
export function scenePreviewCommandMessage(id: number, preview: ScenePreviewPayload | null): ScenePreviewCommand {
  return preview ? { channel: SCENE_PREVIEW_CHANNEL, version: 1, id, type: 'set', preview }
    : { channel: SCENE_PREVIEW_CHANNEL, version: 1, id, type: 'clear' };
}

/** Inject only a validated DTO into the fixed native event; never execute supplied source. */
export function nativeScenePreviewCommandScript(message: ScenePreviewCommand): string {
  const parsed = parseScenePreviewCommand(message);
  return parsed ? `window.dispatchEvent(new CustomEvent('${SCENE_PREVIEW_CHANNEL}',{detail:${JSON.stringify(parsed)}}));true;` : 'true;';
}

/** Accept source-bound host intents; the client owns validation and replay rejection. */
export function subscribeScenePreviewCommands(target: Window, receive: (input: unknown) => void): () => void {
  const native = Boolean((target as PreviewWindow).ReactNativeWebView);
  /** Opaque browser frames require exact parent-window identity. */
  function web(event: MessageEvent<unknown>): void {
    if (!native && target.parent !== target && event.source === target.parent) receive(event.data);
  }
  /** A native document receives commands only through its dedicated injected event. */
  function nativeEvent(event: Event): void {
    if (native) receive((event as CustomEvent<unknown>).detail);
  }
  target.addEventListener('message', web);
  target.addEventListener(SCENE_PREVIEW_CHANNEL, nativeEvent);
  return () => { target.removeEventListener('message', web); target.removeEventListener(SCENE_PREVIEW_CHANNEL, nativeEvent); };
}

/** Return a small validated presentation report through the containing host. */
export function reportScenePreview(target: Window, report: ScenePreviewReport): void {
  const parsed = parseScenePreviewReport(report);
  if (!parsed) return;
  const native = (target as PreviewWindow).ReactNativeWebView;
  if (native) native.postMessage(JSON.stringify(parsed));
  else if (target.parent !== target) target.parent.postMessage(parsed, '*');
}
