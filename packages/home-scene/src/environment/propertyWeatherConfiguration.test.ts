import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WEATHER_CONFIGURATION_CHANNEL, EMPTY_WEATHER_CONFIGURATION, clearPropertyWeatherConfiguration,
  connectPropertyWeatherConfiguration, getPropertyWeatherConfiguration, nativePropertyWeatherScript,
  parsePropertyWeatherConfiguration, receivePropertyWeatherConfiguration, subscribePropertyWeatherConfiguration,
  type PropertyWeatherConfiguration,
} from './propertyWeatherConfiguration';
import { PROPERTY_LOCATION } from './types';

const configured: PropertyWeatherConfiguration = {
  channel: WEATHER_CONFIGURATION_CHANNEL, version: 1,
  location: { ...PROPERTY_LOCATION, name: 'Confirmed property', latitude: 18.45 },
  configured: true, canManage: false, status: 'ready',
};

/** Model only the owning window and listener lifecycle, without a renderer or network. */
function hostWindow(native = false, standalone = false) {
  const listeners = new Map<string, EventListener>();
  const parent = {};
  const target = {
    parent,
    ReactNativeWebView: native ? { postMessage: vi.fn() } : undefined,
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  } as unknown as Window;
  if (standalone) Object.defineProperty(target, 'parent', { value: target });
  return {
    target, parent, listeners,
    /** Deliver a host event while retaining the supplied message-source identity. */
    emit(name: string, event: unknown) { listeners.get(name)?.(event as Event); },
  };
}

beforeEach(clearPropertyWeatherConfiguration);
afterEach(() => { clearPropertyWeatherConfiguration(); vi.unstubAllGlobals(); });

describe('trusted property weather configuration', () => {
  it('accepts explicit ready, loading, unavailable and town-default states', () => {
    expect(parsePropertyWeatherConfiguration(configured)).toEqual(configured);
    expect(parsePropertyWeatherConfiguration(EMPTY_WEATHER_CONFIGURATION)).toEqual(EMPTY_WEATHER_CONFIGURATION);
    expect(parsePropertyWeatherConfiguration({ ...EMPTY_WEATHER_CONFIGURATION, status: 'unavailable' })?.status).toBe('unavailable');
    expect(parsePropertyWeatherConfiguration({ ...configured, location: PROPERTY_LOCATION, configured: false })?.configured).toBe(false);
  });

  it.each([
    null, [], JSON.stringify(configured), {},
    { ...configured, channel: 'other' }, { ...configured, version: 2 },
    { ...configured, canManage: 'true' }, { ...configured, configured: 1 },
    { ...configured, status: 'current' }, { ...configured, location: null },
    { ...configured, status: 'loading' }, { ...configured, status: 'unavailable' },
    { ...configured, url: 'https://example.test' }, { ...configured, deviceId: 'door' },
    { ...EMPTY_WEATHER_CONFIGURATION, status: { toString: () => 'loading' } },
    { ...EMPTY_WEATHER_CONFIGURATION, status: ['unavailable'] },
    { ...configured, location: { ...PROPERTY_LOCATION, latitude: '18.45' } },
    { ...configured, location: { ...PROPERTY_LOCATION, latitude: Infinity } },
    { ...configured, location: { ...PROPERTY_LOCATION, latitude: 91 } },
    { ...configured, location: { ...PROPERTY_LOCATION, longitude: -181 } },
    { ...configured, location: { ...PROPERTY_LOCATION, longitude: NaN } },
    { ...configured, location: { ...PROPERTY_LOCATION, timeZone: 'Wrong/Zone' } },
    { ...configured, location: { ...PROPERTY_LOCATION, name: '' } },
    { ...configured, location: { ...PROPERTY_LOCATION, name: 'a'.repeat(121) } },
    { ...configured, location: { ...PROPERTY_LOCATION, homeId: 'private-house' } },
  ])('rejects malformed or command-like configuration %#', (input) => {
    expect(parsePropertyWeatherConfiguration(input)).toBeNull();
  });

  it('publishes only changed validated snapshots and releases unsubscribed listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePropertyWeatherConfiguration(listener);
    receivePropertyWeatherConfiguration(configured);
    const snapshot = getPropertyWeatherConfiguration();
    receivePropertyWeatherConfiguration({ ...configured, location: { ...configured.location! } });
    receivePropertyWeatherConfiguration({ ...configured, version: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getPropertyWeatherConfiguration()).toBe(snapshot);
    unsubscribe();
    receivePropertyWeatherConfiguration(EMPTY_WEATHER_CONFIGURATION);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('accepts web configuration only from its exact parent, never native-looking events', () => {
    const host = hostWindow();
    const dispose = connectPropertyWeatherConfiguration(host.target);
    host.emit('message', { source: {}, data: configured });
    host.emit(WEATHER_CONFIGURATION_CHANNEL, { detail: configured });
    expect(getPropertyWeatherConfiguration()).toBe(EMPTY_WEATHER_CONFIGURATION);
    host.emit('message', { source: host.parent, data: configured });
    expect(getPropertyWeatherConfiguration()).toEqual(configured);
    dispose();
    expect(host.listeners.size).toBe(0);
    expect(getPropertyWeatherConfiguration()).toBe(EMPTY_WEATHER_CONFIGURATION);
    host.emit('message', { source: host.parent, data: configured });
    expect(getPropertyWeatherConfiguration()).toBe(EMPTY_WEATHER_CONFIGURATION);
  });

  it('does not accept an ordinary message from itself in a standalone document', () => {
    const host = hostWindow(false, true);
    const dispose = connectPropertyWeatherConfiguration(host.target);
    host.emit('message', { source: host.target, data: configured });
    expect(getPropertyWeatherConfiguration()).toBe(EMPTY_WEATHER_CONFIGURATION);
    dispose();
  });

  it('native configuration uses only a validated host event and clears coordinates on disconnect', () => {
    const host = hostWindow(true);
    const dispose = connectPropertyWeatherConfiguration(host.target);
    host.emit('message', { source: host.parent, data: configured });
    host.emit(WEATHER_CONFIGURATION_CHANNEL, { detail: { ...configured, location: null } });
    expect(getPropertyWeatherConfiguration()).toBe(EMPTY_WEATHER_CONFIGURATION);
    host.emit(WEATHER_CONFIGURATION_CHANNEL, { detail: configured });
    expect(getPropertyWeatherConfiguration()).toEqual(configured);
    dispose();
    expect(host.listeners.size).toBe(0);
    expect(getPropertyWeatherConfiguration().location).toBeNull();
  });

  it('encodes hostile labels as inert script data and rejects malformed injection input', () => {
    const name = '</script>\u2028\u2029\";globalThis.weatherInjected=true;//';
    const value = { ...configured, location: { ...PROPERTY_LOCATION, name } };
    const script = nativePropertyWeatherScript(value);
    expect(script).not.toContain('<');
    expect(script).not.toContain('\u2028');
    expect(script).not.toContain('\u2029');
    const dispatchEvent = vi.fn();
    vi.stubGlobal('weatherInjected', false);
    /** Capture an injected event without relying on browser globals in this boundary test. */
    class CaptureEvent {
      constructor(readonly type: string, readonly options: { detail: unknown }) {}
    }
    new Function('window', 'CustomEvent', script)({ dispatchEvent }, CaptureEvent);
    expect(dispatchEvent).toHaveBeenCalledWith(new CaptureEvent(WEATHER_CONFIGURATION_CHANNEL, { detail: value }));
    expect((globalThis as typeof globalThis & { weatherInjected: boolean }).weatherInjected).toBe(false);
    expect(() => nativePropertyWeatherScript({ ...configured, location: null })).toThrow('Invalid property weather configuration');
  });
});
