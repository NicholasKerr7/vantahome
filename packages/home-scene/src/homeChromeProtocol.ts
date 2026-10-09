export const HOME_CHROME_CHANNEL = 'vantahome-home-chrome';
const MAX_MESSAGE_LENGTH = 1_024;

/** Public presentation only: no household identity, coordinates, device state or credentials. */
export interface HomeChromeSnapshot {
  locationName: string;
  localTime: string;
  tempC: number | null;
  weatherCode: number | null;
  weatherStatus: 'live' | 'cached' | 'loading' | 'unavailable';
  isNight: boolean;
  motionDisabled: boolean;
  systemReducedMotion: boolean;
  idleEnabled: boolean;
  preferenceError: boolean;
}

export type HomeChromeCommand =
  | { type: 'open-environment' }
  | { type: 'open-preferences' }
  | { type: 'set-motion'; disabled: boolean }
  | { type: 'set-tour'; enabled: boolean };
export type HomeChromeSnapshotMessage = { channel: typeof HOME_CHROME_CHANNEL; version: 1; type: 'snapshot'; snapshot: HomeChromeSnapshot };
export type HomeChromeCommandMessage = { channel: typeof HOME_CHROME_CHANNEL; version: 1; type: 'command'; id: number; command: HomeChromeCommand };
export type HomeChromePreferencesMessage = { channel: typeof HOME_CHROME_CHANNEL; version: 1; type: 'preferences'; idleEnabled: boolean; preferenceError: boolean };
type ChromeWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };

/** Restrict each envelope and payload to its documented fields without coercion. */
function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(','));
}

/** Bound native strings before parsing and reject non-record web payloads. */
function readMessage(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  if (input.length > MAX_MESSAGE_LENGTH) return null;
  try { return JSON.parse(input); } catch { return null; }
}

/** Readable labels exclude control characters and remain small enough for a compact header. */
function isLabel(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Admit only bounded weather presentation and explicit local motion preferences. */
export function parseHomeChromeSnapshot(input: unknown): HomeChromeSnapshotMessage | null {
  const message = readMessage(input);
  if (!hasKeys(message, ['channel', 'version', 'type', 'snapshot']) || message.channel !== HOME_CHROME_CHANNEL || message.version !== 1 || message.type !== 'snapshot') return null;
  const state = message.snapshot;
  if (!hasKeys(state, ['locationName', 'localTime', 'tempC', 'weatherCode', 'weatherStatus', 'isNight', 'motionDisabled', 'systemReducedMotion', 'idleEnabled', 'preferenceError'])) return null;
  if (!isLabel(state.locationName, 120) || !isLabel(state.localTime, 32)
    || !(state.tempC === null || (typeof state.tempC === 'number' && Number.isFinite(state.tempC) && state.tempC >= -100 && state.tempC <= 70))
    || !(state.weatherCode === null || (typeof state.weatherCode === 'number' && Number.isInteger(state.weatherCode) && state.weatherCode >= 0 && state.weatherCode <= 99))
    || typeof state.weatherStatus !== 'string' || !['live', 'cached', 'loading', 'unavailable'].includes(state.weatherStatus)
    || ['isNight', 'motionDisabled', 'systemReducedMotion', 'idleEnabled', 'preferenceError'].some((key) => typeof state[key] !== 'boolean')) return null;
  return message as HomeChromeSnapshotMessage;
}

/** Presentation commands have no generic action, device selector or arbitrary payload. */
export function parseHomeChromeCommand(input: unknown): HomeChromeCommandMessage | null {
  const message = readMessage(input);
  if (!hasKeys(message, ['channel', 'version', 'type', 'id', 'command']) || message.channel !== HOME_CHROME_CHANNEL || message.version !== 1 || message.type !== 'command'
    || typeof message.id !== 'number' || !Number.isSafeInteger(message.id) || message.id <= 0) return null;
  const command = message.command;
  if (hasKeys(command, ['type']) && (command.type === 'open-environment' || command.type === 'open-preferences')) return message as HomeChromeCommandMessage;
  if (hasKeys(command, ['type', 'disabled']) && command.type === 'set-motion' && typeof command.disabled === 'boolean') return message as HomeChromeCommandMessage;
  if (hasKeys(command, ['type', 'enabled']) && command.type === 'set-tour' && typeof command.enabled === 'boolean') return message as HomeChromeCommandMessage;
  return null;
}

/** Keep command construction shared by native and browser hosts. */
export function homeChromeCommandMessage(id: number, command: HomeChromeCommand): HomeChromeCommandMessage {
  return { channel: HOME_CHROME_CHANNEL, version: 1, type: 'command', id, command };
}

/** A host configuration carries one stored presentation preference and never initiates an action. */
export function homeChromePreferencesMessage(idleEnabled: boolean, preferenceError: boolean): HomeChromePreferencesMessage {
  return { channel: HOME_CHROME_CHANNEL, version: 1, type: 'preferences', idleEnabled, preferenceError };
}

/** Reject extra fields or coerced flags before applying the host's device-local configuration. */
export function parseHomeChromePreferences(input: unknown): HomeChromePreferencesMessage | null {
  const message = readMessage(input);
  if (!hasKeys(message, ['channel', 'version', 'type', 'idleEnabled', 'preferenceError']) || message.channel !== HOME_CHROME_CHANNEL || message.version !== 1 || message.type !== 'preferences'
    || typeof message.idleEnabled !== 'boolean' || typeof message.preferenceError !== 'boolean') return null;
  return message as HomeChromePreferencesMessage;
}

/** Deliver only the validated stored preference to the packaged native document. */
export function nativeHomeChromePreferencesScript(message: HomeChromePreferencesMessage): string {
  const parsed = parseHomeChromePreferences(message);
  return parsed ? `window.dispatchEvent(new CustomEvent('${HOME_CHROME_CHANNEL}',{detail:${JSON.stringify(parsed)}}));true;` : 'true;';
}

/** Only preference setters may be sent while their enclosing native panel covers the scene. */
export function isHomeChromePreferenceCommand(command: HomeChromeCommand): boolean {
  return command.type === 'set-motion' || command.type === 'set-tour';
}

/** Inject only a validated presentation command into the packaged document. */
export function nativeHomeChromeCommandScript(message: HomeChromeCommandMessage): string {
  const parsed = parseHomeChromeCommand(message);
  return parsed ? `window.dispatchEvent(new CustomEvent('${HOME_CHROME_CHANNEL}',{detail:${JSON.stringify(parsed)}}));true;` : 'true;';
}

/** Send public renderer values through the existing isolated host transport. */
export function reportHomeChromeSnapshot(target: Window, snapshot: HomeChromeSnapshot): void {
  const message = parseHomeChromeSnapshot({ channel: HOME_CHROME_CHANNEL, version: 1, type: 'snapshot', snapshot });
  if (!message) return;
  const native = (target as ChromeWindow).ReactNativeWebView;
  if (native) native.postMessage(JSON.stringify(message));
  else if (target.parent !== target) target.parent.postMessage(message, '*');
}

/** Parent identity and native-event exclusivity keep other frames from driving header actions. */
export function subscribeHomeChromeCommands(target: Window, receive: (message: HomeChromeCommandMessage) => void): () => void {
  return subscribeHomeChromeMessages(target, parseHomeChromeCommand, receive);
}

/** Configuration uses the same exact parent/native transport validation as explicit commands. */
export function subscribeHomeChromePreferences(target: Window, receive: (message: HomeChromePreferencesMessage) => void): () => void {
  return subscribeHomeChromeMessages(target, parseHomeChromePreferences, receive);
}

/** Keep presentation transport ownership identical for configuration and explicit commands. */
function subscribeHomeChromeMessages<Message>(target: Window, parse: (input: unknown) => Message | null, receive: (message: Message) => void): () => void {
  const native = Boolean((target as ChromeWindow).ReactNativeWebView);
  /** Validate before dispatching; readiness and foreground eligibility remain the receiver's job. */
  function accept(input: unknown): void {
    const message = parse(input);
    if (message) receive(message);
  }
  /** Sandboxed frames have opaque origins, so compare the exact containing window. */
  function onWebMessage(event: MessageEvent<unknown>): void {
    if (!native && target.parent !== target && event.source === target.parent) accept(event.data);
  }
  /** Web documents cannot impersonate the native-only injected transport. */
  function onNativeMessage(event: Event): void {
    if (native) accept((event as CustomEvent<unknown>).detail);
  }
  target.addEventListener('message', onWebMessage);
  target.addEventListener(HOME_CHROME_CHANNEL, onNativeMessage);
  return () => {
    target.removeEventListener('message', onWebMessage);
    target.removeEventListener(HOME_CHROME_CHANNEL, onNativeMessage);
  };
}
