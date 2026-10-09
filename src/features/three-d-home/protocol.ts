import type { SimulationSaveStatus } from './simulationPersistence';
import { homeChromeCommandMessage, isHomeChromePreferenceCommand, parseHomeChromeCommand, type HomeChromeCommand, type HomeChromeCommandMessage, type HomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';

export type HomeChromeCommandIntent = { id: number; command: HomeChromeCommand };

/** Renderer health is separate from the validated, simulation-only state bridge. */
export type SceneStatus = 'ready' | 'error';
export type SceneSurfaceProps = {
  suspended?: boolean;
  onStatus: (status: SceneStatus) => void;
  onSaveStatus?: (status: SimulationSaveStatus) => void;
  onDeviceRoutines?: (deviceId: string) => void;
  onChromeSnapshot?: (snapshot: HomeChromeSnapshot) => void;
  chromeCommand?: HomeChromeCommandIntent;
  /** Enable setters only while a foreground native Preferences panel covers this retained scene. */
  allowChromePreferencesWhileSuspended?: boolean;
};

/** Consume each explicit intent once; reconnecting, loading or resuming never retries stale actions. */
export function consumeHomeChromeCommand(
  intent: HomeChromeCommandIntent | undefined,
  consumed: { current: number },
  eligibility: { ready: boolean; canNavigate: boolean; suspended: boolean; allowPreferencesWhileSuspended: boolean },
): HomeChromeCommandMessage | null {
  if (!intent) return null;
  const message = parseHomeChromeCommand(homeChromeCommandMessage(intent.id, intent.command));
  if (!message || message.id <= consumed.current) return null;
  consumed.current = message.id;
  if (!eligibility.ready || !eligibility.canNavigate
    || (eligibility.suspended && !(eligibility.allowPreferencesWhileSuspended && isHomeChromePreferenceCommand(message.command)))) return null;
  return message;
}

/** Native presentation messages must originate in the exact packaged document, never its blank bootstrap. */
export function isCurrentSceneDocument(url: unknown, documentUri: string): boolean {
  return typeof url === 'string' && (url === documentUri || url.startsWith(`${documentUri}#`));
}

/** Reject arbitrary WebView messages, oversized payloads and future command-like messages. */
export function parseSceneStatus(input: unknown): SceneStatus | null {
  let value: unknown = input;
  if (typeof value === 'string') {
    if (value.length > 256) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).sort().join(',') !== 'channel,status,version') return null;
  if (message.channel !== 'vantahome-scene' || message.version !== 1) return null;
  return message.status === 'ready' || message.status === 'error' ? message.status : null;
}

/** Only the packaged document and its initial empty document can navigate in the WebView. */
export function isAllowedSceneNavigation(url: string, documentUri: string): boolean {
  return url === 'about:blank' || url === documentUri || url.startsWith(`${documentUri}#`);
}
