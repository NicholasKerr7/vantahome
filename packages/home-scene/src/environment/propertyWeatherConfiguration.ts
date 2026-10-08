import { isWeatherLocation } from './weatherLocation';
import type { WeatherLocation } from './types';

export const WEATHER_CONFIGURATION_CHANNEL = 'vantahome-weather-configuration';
export type PropertyWeatherConfiguration = {
  channel: typeof WEATHER_CONFIGURATION_CHANNEL;
  version: 1;
  location: WeatherLocation | null;
  configured: boolean;
  canManage: boolean;
  status: 'loading' | 'ready' | 'unavailable';
};

export const EMPTY_WEATHER_CONFIGURATION: PropertyWeatherConfiguration = {
  channel: WEATHER_CONFIGURATION_CHANNEL, version: 1, location: null,
  configured: false, canManage: false, status: 'loading',
};
let configuration = EMPTY_WEATHER_CONFIGURATION;
const listeners = new Set<() => void>();

/** Validate host-owned location data independently from device permissions and weather requests. */
export function parsePropertyWeatherConfiguration(input: unknown): PropertyWeatherConfiguration | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'canManage,channel,configured,location,status,version'
    || value.channel !== WEATHER_CONFIGURATION_CHANNEL || value.version !== 1
    || typeof value.configured !== 'boolean' || typeof value.canManage !== 'boolean'
    || typeof value.status !== 'string' || !['loading', 'ready', 'unavailable'].includes(value.status)) return null;
  if (value.status === 'ready' ? !isWeatherLocation(value.location) : value.location !== null) return null;
  if (value.location && Object.keys(value.location).sort().join(',') !== 'latitude,longitude,name,timeZone') return null;
  return value as PropertyWeatherConfiguration;
}

/** Return a stable snapshot so consumers do not refetch when only another component renders. */
export function getPropertyWeatherConfiguration(): PropertyWeatherConfiguration { return configuration; }

/** Notify only when the authoritative configuration changes, never on ordinary camera frames. */
export function receivePropertyWeatherConfiguration(input: unknown): void {
  const value = parsePropertyWeatherConfiguration(input);
  if (!value || JSON.stringify(value) === JSON.stringify(configuration)) return;
  configuration = value;
  listeners.forEach((listener) => listener());
}

/** Reset a disconnected document rather than retain a former household's private coordinates. */
export function clearPropertyWeatherConfiguration(): void {
  configuration = EMPTY_WEATHER_CONFIGURATION;
  listeners.forEach((listener) => listener());
}

/** Subscribe to trusted snapshots without starting network requests or accessing account data. */
export function subscribePropertyWeatherConfiguration(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Encode labels as inert data before injecting the fixed native event. */
export function nativePropertyWeatherScript(value: PropertyWeatherConfiguration): string {
  if (!parsePropertyWeatherConfiguration(value)) throw new Error('Invalid property weather configuration.');
  const payload = JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.dispatchEvent(new CustomEvent('${WEATHER_CONFIGURATION_CHANNEL}',{detail:${payload}}));true;`;
}

/** Accept configuration only from the owning iframe parent or the native document's event bridge. */
export function connectPropertyWeatherConfiguration(target: Window): () => void {
  const native = Boolean((target as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView);
  /** Sandboxed web renderers use their exact parent window as the trust boundary. */
  function webMessage(event: MessageEvent<unknown>): void {
    if (!native && target.parent !== target && event.source === target.parent) receivePropertyWeatherConfiguration(event.data);
  }
  /** Native documents never accept location changes from ordinary window messages. */
  function nativeMessage(event: Event): void {
    if (native) receivePropertyWeatherConfiguration((event as CustomEvent<unknown>).detail);
  }
  target.addEventListener('message', webMessage);
  target.addEventListener(WEATHER_CONFIGURATION_CHANNEL, nativeMessage);
  return () => {
    target.removeEventListener('message', webMessage);
    target.removeEventListener(WEATHER_CONFIGURATION_CHANNEL, nativeMessage);
    clearPropertyWeatherConfiguration();
  };
}
