import {
  NativeWeatherBroker, NATIVE_WEATHER_MAX_BODY_CHARS, NATIVE_WEATHER_MIN_INTERVAL_MS,
  NATIVE_WEATHER_TIMEOUT_MS, NATIVE_WEATHER_URL, nativeWeatherResponseScript, parseNativeWeatherRequest,
} from './nativeWeather';

/** Build only valid protocol messages; callers override fields to exercise rejection paths. */
function message(requestId = 1, type = 'current', extra = {}) {
  return JSON.stringify({ channel: 'vantahome-weather', version: 1, type, requestId, ...extra });
}

/** Provide the small native Fetch surface without relying on a browser's Response implementation. */
function response(text = '{"current":{}}', length?: number): Response {
  return { ok: true, headers: { get: () => length === undefined ? null : String(length) }, text: async () => text } as unknown as Response;
}

/** Drain the bounded promise chain after a synchronous test fetch. */
async function flush(): Promise<void> {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}

afterEach(() => jest.useRealTimers());

describe('native weather request boundary', () => {
  it('accepts only exact current or cancel messages with safe integer IDs', () => {
    expect(parseNativeWeatherRequest(message())).toMatchObject({ requestId: 1, type: 'current' });
    expect(parseNativeWeatherRequest(message(1, 'cancel'))).toMatchObject({ type: 'cancel' });
    for (const value of [message(0), message(-1), message(1.5), message(Number.MAX_SAFE_INTEGER + 1),
      message(1, 'fetch'), message(1, 'current', { url: 'https://example.com' }), message(1, 'current', { latitude: 0 }),
      message(1, 'current', { version: 2 }), '{}', 'x'.repeat(257), {}, null]) {
      expect(parseNativeWeatherRequest(value)).toBeNull();
    }
  });

  it('escapes API strings into data instead of executable injected script', () => {
    const text = '</script>\u2028\u2029";globalThis.injected=true;//';
    const script = nativeWeatherResponseScript({ channel: 'vantahome-weather', version: 1, requestId: 1, status: 'ok', body: { text } });
    expect(script).not.toContain('</script>');
    expect(script).not.toContain('\u2028');
    expect(script).not.toContain('\u2029');
    expect(script).toContain('\\u003c/script>');
  });
});

describe('native weather broker', () => {
  it('fetches only the fixed property URL without credentials and returns bounded JSON', async () => {
    const deliver = jest.fn();
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response());
    const broker = new NativeWeatherBroker(deliver, { fetcher });
    expect(broker.handleMessage(message(1, 'current', { url: 'https://example.com' }))).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    broker.handleMessage(message());
    await flush();
    expect(fetcher).toHaveBeenCalledWith(NATIVE_WEATHER_URL, expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }));
    expect(new URL(NATIVE_WEATHER_URL).searchParams.get('latitude')).toBe('18.4538');
    expect(new URL(NATIVE_WEATHER_URL).searchParams.get('longitude')).toBe('-78.01534');
    expect(deliver).toHaveBeenCalledWith({ channel: 'vantahome-weather', version: 1, requestId: 1, status: 'ok', body: { current: {} } });
    broker.dispose();
  });

  it('rejects simultaneous and rapid requests without additional network calls', async () => {
    const deliver = jest.fn();
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(response());
    let now = 0;
    const broker = new NativeWeatherBroker(deliver, { fetcher, now: () => now });
    broker.handleMessage(message(1));
    broker.handleMessage(message(2));
    await flush();
    broker.handleMessage(message(3));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ requestId: 2, status: 'error' }));
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ requestId: 3, status: 'error' }));
    now = NATIVE_WEATHER_MIN_INTERVAL_MS;
    broker.handleMessage(message(4));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    broker.dispose();
  });

  it.each([
    ['oversized header', () => response('{}', NATIVE_WEATHER_MAX_BODY_CHARS + 1)],
    ['oversized body', () => response(' '.repeat(NATIVE_WEATHER_MAX_BODY_CHARS + 1))],
    ['invalid JSON', () => response('{broken')],
    ['unexpected array', () => response('[]')],
  ])('rejects %s before delivering successful data', async (_name, createResponse) => {
    const deliver = jest.fn();
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(createResponse());
    const broker = new NativeWeatherBroker(deliver, { fetcher });
    broker.handleMessage(message());
    await flush();
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    broker.dispose();
  });

  it('bounds even a fetcher that ignores abort, then ignores its late result', async () => {
    jest.useFakeTimers();
    let complete!: (value: Response) => void;
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const deliver = jest.fn();
    const broker = new NativeWeatherBroker(deliver, { fetcher });
    broker.handleMessage(message());
    jest.advanceTimersByTime(NATIVE_WEATHER_TIMEOUT_MS);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    complete(response());
    await flush();
    expect(deliver).toHaveBeenCalledTimes(1);
    broker.dispose();
  });

  it.each(['cancel', 'dispose'])('aborts on %s and suppresses late successful results', async (action) => {
    let complete!: (value: Response) => void;
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const deliver = jest.fn();
    const broker = new NativeWeatherBroker(deliver, { fetcher });
    broker.handleMessage(message());
    if (action === 'cancel') broker.handleMessage(message(1, 'cancel')); else broker.dispose();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    complete(response());
    await flush();
    expect(deliver).not.toHaveBeenCalled();
    broker.dispose();
  });
});
