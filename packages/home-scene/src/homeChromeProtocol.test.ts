import { describe, expect, it, vi } from 'vitest';
import { HOME_CHROME_CHANNEL, homeChromeCommandMessage, homeChromePreferencesMessage, nativeHomeChromeCommandScript, parseHomeChromeCommand, parseHomeChromePreferences, parseHomeChromeSnapshot, reportHomeChromeSnapshot, subscribeHomeChromeCommands, subscribeHomeChromePreferences, type HomeChromeSnapshot } from './homeChromeProtocol';

const snapshot: HomeChromeSnapshot = {
  locationName: 'Hopewell, Jamaica', localTime: '10:42 AM', tempC: 27, weatherCode: 3,
  weatherStatus: 'live', isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: true, preferenceError: false,
};
const message = { channel: HOME_CHROME_CHANNEL, version: 1, type: 'snapshot', snapshot };

/** Model transport identity without loading graphics or a real native WebView. */
function hostWindow(native = false) {
  const listeners = new Map<string, EventListener>();
  const parent = { postMessage: vi.fn() };
  const postMessage = vi.fn();
  const target = {
    parent, ReactNativeWebView: native ? { postMessage } : undefined,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as Window;
  return { target, parent, postMessage, listeners, emit: (type: string, event: unknown) => listeners.get(type)?.(event as Event) };
}

describe('home chrome presentation protocol', () => {
  it('round-trips bounded snapshots and commands through native JSON and web objects', () => {
    expect(parseHomeChromeSnapshot(message)?.snapshot).toEqual(snapshot);
    expect(parseHomeChromeSnapshot(JSON.stringify(message))?.snapshot).toEqual(snapshot);
    for (const command of [{ type: 'open-environment' }, { type: 'open-preferences' }, { type: 'set-motion', disabled: true }, { type: 'set-tour', enabled: false }] as const) {
      const request = homeChromeCommandMessage(1, command);
      expect(parseHomeChromeCommand(request)).toEqual(request);
      expect(parseHomeChromeCommand(JSON.stringify(request))).toEqual(request);
      expect(nativeHomeChromeCommandScript(request)).toContain(JSON.stringify(request));
    }
  });

  it('rejects malformed, oversized and permission-like snapshot values', () => {
    for (const input of [null, [], 'not json', 'x'.repeat(1_025), { ...message, version: 2 }, { ...message, accountId: 'private' },
      ...[{ locationName: 'x'.repeat(121) }, { locationName: 'name\nother' }, { localTime: '' }, { tempC: Infinity }, { tempC: -101 },
        { weatherCode: 100 }, { weatherCode: 1.5 }, { weatherStatus: 'stale' }, { weatherStatus: { toString: () => 'live' } },
        { idleEnabled: 1 }, { latitude: 18.5 }, { canControl: true }].map((change) => ({ ...message, snapshot: { ...snapshot, ...change } })),
    ]) expect(parseHomeChromeSnapshot(input)).toBeNull();
  });

  it('rejects extra command fields, invalid ids and coerced flags', () => {
    const command = homeChromeCommandMessage(2, { type: 'set-motion', disabled: true });
    for (const input of [null, [], 'x'.repeat(1_025), { ...command, id: 0 }, { ...command, id: Number.MAX_SAFE_INTEGER + 1 }, { ...command, id: '2' },
      { ...command, type: 'snapshot' }, { ...command, command: { type: 'set-motion', disabled: 'false' } },
      { ...command, command: { type: 'open-preferences', deviceId: 'living-light' } }, { ...command, command: { type: 'toggle-device' } },
    ]) expect(parseHomeChromeCommand(input)).toBeNull();
  });

  it.each([false, true])('isolates the %s native transport and removes its listeners', (native) => {
    const host = hostWindow(native);
    const receive = vi.fn();
    const dispose = subscribeHomeChromeCommands(host.target, receive);
    const command = homeChromeCommandMessage(1, { type: 'open-environment' });
    host.emit('message', { source: {}, data: command });
    host.emit(HOME_CHROME_CHANNEL, { detail: { command: 'bad' } });
    expect(receive).not.toHaveBeenCalled();
    host.emit('message', { source: host.parent, data: command });
    expect(receive).toHaveBeenCalledTimes(native ? 0 : 1);
    host.emit(HOME_CHROME_CHANNEL, { detail: command });
    expect(receive).toHaveBeenCalledTimes(1);
    reportHomeChromeSnapshot(host.target, snapshot);
    if (native) expect(host.postMessage).toHaveBeenCalledWith(JSON.stringify(message));
    else expect(host.parent.postMessage).toHaveBeenCalledWith(message, '*');
    dispose();
    expect(host.listeners.size).toBe(0);
  });

  it.each([false, true])('applies only narrow stored configuration from the trusted %s native host', (native) => {
    const host = hostWindow(native);
    const receive = vi.fn();
    const dispose = subscribeHomeChromePreferences(host.target, receive);
    const config = homeChromePreferencesMessage(false, true);
    expect(parseHomeChromePreferences(JSON.stringify(config))).toEqual(config);
    for (const invalid of [{ ...config, idleEnabled: 'false' }, { ...config, deviceId: 'gate' }, { ...config, type: 'command' }, 'x'.repeat(1_025)]) expect(parseHomeChromePreferences(invalid)).toBeNull();
    host.emit('message', { source: {}, data: config });
    host.emit(HOME_CHROME_CHANNEL, { detail: homeChromeCommandMessage(1, { type: 'set-tour', enabled: true }) });
    expect(receive).not.toHaveBeenCalled();
    host.emit('message', { source: host.parent, data: config });
    expect(receive).toHaveBeenCalledTimes(native ? 0 : 1);
    host.emit(HOME_CHROME_CHANNEL, { detail: config });
    expect(receive).toHaveBeenCalledTimes(1);
    dispose(); expect(host.listeners.size).toBe(0);
  });
});
