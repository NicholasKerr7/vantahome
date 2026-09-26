const CHANNEL = 'vantahome-weather';
export const NATIVE_WEATHER_EVENT = 'vantahome-native-weather-v1';
export const NATIVE_WEATHER_TIMEOUT_MS = 10_000;
export const NATIVE_WEATHER_MIN_INTERVAL_MS = 30_000;
export const NATIVE_WEATHER_MAX_BODY_CHARS = 64 * 1024;

// Fixed public town coordinates match the scene's PROPERTY_LOCATION. No URL or
// coordinates from WebView messages are ever used to construct a request.
export const NATIVE_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=18.4538&longitude=-78.01534&current=temperature_2m%2Cprecipitation%2Crain%2Cshowers%2Csnowfall%2Ccloud_cover%2Cwind_speed_10m%2Cwind_direction_10m%2Cweather_code&daily=sunrise%2Csunset&timezone=America%2FJamaica&timeformat=unixtime&forecast_days=3&wind_speed_unit=kmh&precipitation_unit=mm&temperature_unit=celsius';

type WeatherRequest = { channel: typeof CHANNEL; version: 1; type: 'current' | 'cancel'; requestId: number };
export type NativeWeatherResponse = { channel: typeof CHANNEL; version: 1; requestId: number } & (
  { status: 'ok'; body: Record<string, unknown> } | { status: 'error' }
);
type BrokerOptions = { fetcher?: typeof fetch; now?: () => number };
type PendingRequest = { requestId: number; controller: AbortController; timer?: ReturnType<typeof setTimeout> };

/** Accept only a bounded request identifier and a fixed operation, never arbitrary network input. */
export function parseNativeWeatherRequest(input: unknown): WeatherRequest | null {
  if (typeof input !== 'string' || input.length > 256) return null;
  let value: unknown;
  try { value = JSON.parse(input); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).sort().join(',') !== 'channel,requestId,type,version'
    || message.channel !== CHANNEL || message.version !== 1
    || (message.type !== 'current' && message.type !== 'cancel')
    || !Number.isSafeInteger(message.requestId) || Number(message.requestId) < 1) return null;
  return message as WeatherRequest;
}

/** Encode data as a JavaScript literal so API strings cannot become executable bridge code. */
export function nativeWeatherResponseScript(response: NativeWeatherResponse): string {
  const payload = JSON.stringify(response).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.dispatchEvent(new CustomEvent('${NATIVE_WEATHER_EVENT}',{detail:${payload}}));true;`;
}

/** Offer one read-only weather capability while keeping the local WebView's file access restricted. */
export class NativeWeatherBroker {
  private active: PendingRequest | null = null;
  private lastAttemptAt = -Infinity;
  private disposed = false;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  /** Inject only the transport and clock needed for deterministic boundary tests. */
  constructor(private readonly deliver: (response: NativeWeatherResponse) => void, options: BrokerOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** Handle recognized messages without permitting parallel requests or rapid polling. */
  handleMessage(input: unknown): boolean {
    const request = parseNativeWeatherRequest(input);
    if (!request) return false;
    if (this.disposed) return true;
    if (request.type === 'cancel') {
      if (this.active?.requestId === request.requestId) this.cancelActive();
      return true;
    }
    if (this.active || this.now() - this.lastAttemptAt < NATIVE_WEATHER_MIN_INTERVAL_MS) {
      this.deliver({ channel: CHANNEL, version: 1, requestId: request.requestId, status: 'error' });
      return true;
    }
    const pending = { requestId: request.requestId, controller: new AbortController() };
    this.active = pending;
    this.lastAttemptAt = this.now();
    void this.load(pending);
    return true;
  }

  /** Cancel work and suppress all late results when the owning WebView leaves the screen. */
  dispose(): void {
    this.disposed = true;
    this.cancelActive();
  }

  /** Clear the deadline as well as the request when its consumer no longer exists. */
  private cancelActive(): void {
    clearTimeout(this.active?.timer);
    this.active?.controller.abort();
    this.active = null;
  }

  /** Fetch only the public endpoint, bounding duration and data before crossing back into JavaScript. */
  private async load(pending: PendingRequest): Promise<void> {
    pending.timer = setTimeout(() => {
      pending.controller.abort();
      if (this.active !== pending || this.disposed) return;
      this.active = null;
      this.deliver({ channel: CHANNEL, version: 1, requestId: pending.requestId, status: 'error' });
    }, NATIVE_WEATHER_TIMEOUT_MS);
    let response: NativeWeatherResponse = { channel: CHANNEL, version: 1, requestId: pending.requestId, status: 'error' };
    try {
      const result = await this.fetcher(NATIVE_WEATHER_URL, {
        signal: pending.controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (!result.ok || Number(result.headers.get('content-length') ?? 0) > NATIVE_WEATHER_MAX_BODY_CHARS) throw new Error('Weather response unavailable.');
      const text = await result.text();
      if (text.length > NATIVE_WEATHER_MAX_BODY_CHARS) throw new Error('Weather response too large.');
      const body: unknown = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Weather response invalid.');
      // The scene applies its complete weather/unit/time schema before displaying this data.
      response = { ...response, status: 'ok', body: body as Record<string, unknown> };
    } catch {
      // Return a generic failure only; native networking details never enter the scene.
    } finally {
      clearTimeout(pending.timer);
      if (this.active !== pending) return;
      this.active = null;
      if (!this.disposed && !pending.controller.signal.aborted) this.deliver(response);
    }
  }
}
