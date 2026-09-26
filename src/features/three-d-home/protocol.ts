/** The only messages the simulation can send; there is deliberately no command channel. */
export type SceneStatus = 'ready' | 'error';
export type SceneSurfaceProps = { onStatus: (status: SceneStatus) => void };

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
