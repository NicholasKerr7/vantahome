export type ModelName = 'exterior' | 'ground' | 'upper' | 'landscape' | 'gate';
type SceneGlobals = typeof globalThis & {
  __VANTAHOME_EMBEDDED__?: boolean;
  __VANTAHOME_MODEL_URLS?: Partial<Record<ModelName, string>>;
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

/** Embedded sessions are ephemeral and never read the main app's household or account state. */
export function isEmbeddedScene(): boolean {
  return (globalThis as SceneGlobals).__VANTAHOME_EMBEDDED__ === true;
}

/** Reuse exported GLBs on the web and packaged data URLs in the offline embedded document. */
export function getModelUrl(model: ModelName): string {
  return (globalThis as SceneGlobals).__VANTAHOME_MODEL_URLS?.[model] ?? `${import.meta.env.BASE_URL}models/${model}.glb`;
}

/** Report only render readiness; the protocol intentionally has no device or authentication messages. */
export function reportSceneStatus(status: 'ready' | 'error'): void {
  if (!isEmbeddedScene()) return;
  const message = { channel: 'vantahome-scene', version: 1, status };
  const host = (globalThis as SceneGlobals).ReactNativeWebView;
  if (host) host.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}
