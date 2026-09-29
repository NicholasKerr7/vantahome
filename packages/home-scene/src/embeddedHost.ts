export type ModelName = 'exterior' | 'ground' | 'upper' | 'landscape' | 'gate';
type SceneGlobals = typeof globalThis & {
  __VANTAHOME_EMBEDDED__?: boolean;
  __VANTAHOME_MODEL_URLS?: Partial<Record<ModelName, string>>;
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

/** Embedded sessions exchange only simulation preferences and never read account or household state. */
export function isEmbeddedScene(): boolean {
  return (globalThis as SceneGlobals).__VANTAHOME_EMBEDDED__ === true;
}

/** Reuse exported GLBs on the web and packaged data URLs in the offline embedded document. */
export function getModelUrl(model: ModelName): string {
  return (globalThis as SceneGlobals).__VANTAHOME_MODEL_URLS?.[model] ?? `${import.meta.env.BASE_URL}models/${model}.glb`;
}

/** Report rendering status separately from the strictly validated simulation-state bridge. */
export function reportSceneStatus(status: 'ready' | 'error'): void {
  if (!isEmbeddedScene()) return;
  const message = { channel: 'vantahome-scene', version: 1, status };
  const host = (globalThis as SceneGlobals).ReactNativeWebView;
  if (host) host.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}

/** Ask the native host to open its routine directory without exposing account or command data. */
export function requestDeviceRoutines(deviceId: string): void {
  if (!isEmbeddedScene()) return;
  const message = { channel: 'vantahome-navigation', version: 1, type: 'device-routines', deviceId };
  const host = (globalThis as SceneGlobals).ReactNativeWebView;
  if (host) host.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}
