const CHANNEL = 'vantahome-weather';
const RESPONSE_EVENT = 'vantahome-native-weather-v1';
const RESPONSE_TIMEOUT_MS = 12_000;
type NativeWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };
let nextRequestId = 0;

/** Native file documents use the host's single-purpose broker; browser embeds retain ordinary fetch. */
export function hasNativeWeatherTransport(): boolean {
  return typeof window !== 'undefined' && typeof (window as NativeWindow).ReactNativeWebView?.postMessage === 'function';
}

/** Request weather without granting the scene a URL, location, authentication or command capability. */
export function requestNativeWeather(signal: AbortSignal): Promise<unknown> {
  const host = typeof window === 'undefined' ? undefined : (window as NativeWindow).ReactNativeWebView;
  if (!host) return Promise.reject(new Error('Weather transport is unavailable.'));
  if (signal.aborted) return Promise.reject(new DOMException('Weather request cancelled.', 'AbortError'));
  const requestId = ++nextRequestId;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    /** Remove every listener before publishing a result so late messages cannot change the request. */
    function finish(body: unknown, error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(RESPONSE_EVENT, receive);
      signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(body);
    }

    /** Ignore other operations, malformed payloads, and responses for earlier scene requests. */
    function receive(event: Event): void {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return;
      const message = detail as Record<string, unknown>;
      if (message.channel !== CHANNEL || message.version !== 1 || message.requestId !== requestId) return;
      const expectedKeys = message.status === 'ok' ? 'body,channel,requestId,status,version' : 'channel,requestId,status,version';
      if (Object.keys(message).sort().join(',') !== expectedKeys) return;
      if (message.status === 'ok') finish(message.body);
      else if (message.status === 'error') finish(undefined, new Error('Weather could not be refreshed. Check your connection.'));
    }

    /** Cancel only this request; native unmount also aborts outstanding network work. */
    function cancel(): void {
      try { host?.postMessage(JSON.stringify({ channel: CHANNEL, version: 1, type: 'cancel', requestId })); } catch { /* The host may already be gone. */ }
      finish(undefined, new DOMException('Weather request cancelled.', 'AbortError'));
    }

    timer = setTimeout(() => {
      try { host.postMessage(JSON.stringify({ channel: CHANNEL, version: 1, type: 'cancel', requestId })); } catch { /* Timeout still reaches the user. */ }
      finish(undefined, new Error('Weather request timed out.'));
    }, RESPONSE_TIMEOUT_MS);
    window.addEventListener(RESPONSE_EVENT, receive);
    signal.addEventListener('abort', cancel, { once: true });
    try { host.postMessage(JSON.stringify({ channel: CHANNEL, version: 1, type: 'current', requestId })); }
    catch { finish(undefined, new Error('Weather transport is unavailable.')); }
  });
}
