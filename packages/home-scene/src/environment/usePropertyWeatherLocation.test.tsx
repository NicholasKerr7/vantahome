// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePropertyWeatherLocation } from './usePropertyWeatherLocation';
import { clearPropertyWeatherConfiguration, getPropertyWeatherConfiguration, receivePropertyWeatherConfiguration,
  WEATHER_CONFIGURATION_CHANNEL, type PropertyWeatherConfiguration } from './propertyWeatherConfiguration';
import { PROPERTY_LOCATION } from './types';

let root: Root;
let container: HTMLElement;
const configured: PropertyWeatherConfiguration = {
  channel: WEATHER_CONFIGURATION_CHANNEL, version: 1,
  location: { ...PROPERTY_LOCATION, name: 'Confirmed property', latitude: 18.45 },
  configured: true, canManage: true, status: 'ready',
};

/** Expose the hook's public selection without creating network requests or rendering a scene. */
function LocationProbe() {
  const value = usePropertyWeatherLocation();
  return <output>{JSON.stringify(value)}</output>;
}

/** Read exactly the view model made available to the environment hook and weather controls. */
function result(): ReturnType<typeof usePropertyWeatherLocation> {
  return JSON.parse(container.querySelector('output')!.textContent!) as ReturnType<typeof usePropertyWeatherLocation>;
}

/** Send the same fixed event injected by the native host after configuration verification. */
function hostConfiguration(detail: unknown): void {
  window.dispatchEvent(new CustomEvent(WEATHER_CONFIGURATION_CHANNEL, { detail }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
  vi.stubGlobal('ReactNativeWebView', { postMessage: vi.fn() });
  clearPropertyWeatherConfiguration();
  container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  clearPropertyWeatherConfiguration();
  vi.unstubAllGlobals();
});

describe('property weather selection lifecycle', () => {
  it('waits for the trusted host before enabling weather, then reflects its verified location', () => {
    act(() => root.render(<LocationProbe />));
    expect(result()).toEqual({ location: PROPERTY_LOCATION, ready: false, configured: false, canManage: false, status: 'loading' });
    act(() => hostConfiguration(configured));
    expect(result()).toEqual({ location: configured.location, ready: true, configured: true, canManage: true, status: 'ready' });
  });

  it('removes the old property immediately when the host becomes unavailable or changes households', () => {
    act(() => root.render(<LocationProbe />));
    act(() => hostConfiguration(configured));
    act(() => hostConfiguration({ ...configured, location: null, configured: false, canManage: false, status: 'unavailable' }));
    expect(result()).toEqual({ location: PROPERTY_LOCATION, ready: false, configured: false, canManage: false, status: 'unavailable' });
    act(() => hostConfiguration({ ...configured, location: null, configured: false, canManage: false, status: 'loading' }));
    expect(result().ready).toBe(false);
    expect(result().status).toBe('loading');
    const next = { ...configured.location!, name: 'Next home', longitude: -77.9 };
    act(() => hostConfiguration({ ...configured, location: next, canManage: false }));
    expect(result()).toEqual({ location: next, ready: true, configured: true, canManage: false, status: 'ready' });
  });

  it('distinguishes an explicitly verified town fallback from a not-yet-loaded household', () => {
    act(() => root.render(<LocationProbe />));
    act(() => hostConfiguration({ ...configured, location: PROPERTY_LOCATION, configured: false, canManage: false }));
    expect(result()).toEqual({ location: PROPERTY_LOCATION, ready: true, configured: false, canManage: false, status: 'ready' });
  });

  it('ignores malformed native configuration and ordinary window messages', () => {
    act(() => root.render(<LocationProbe />));
    act(() => {
      hostConfiguration({ ...configured, location: { ...PROPERTY_LOCATION, longitude: 'private' } });
      window.dispatchEvent(new MessageEvent('message', { source: window.parent, data: configured }));
    });
    expect(result().ready).toBe(false);
    expect(result().configured).toBe(false);
  });

  it('standalone scenes keep the public town default even when an unrelated stored snapshot exists', () => {
    vi.stubGlobal('__VANTAHOME_EMBEDDED__', false);
    receivePropertyWeatherConfiguration(configured);
    act(() => root.render(<LocationProbe />));
    expect(result()).toEqual({ location: PROPERTY_LOCATION, ready: true, configured: false, canManage: false, status: 'ready' });
    act(() => hostConfiguration({ ...configured, location: null, status: 'unavailable' }));
    expect(result().ready).toBe(true);
    expect(result().location).toEqual(PROPERTY_LOCATION);
  });

  it('unmount drops private coordinates and removes the bridge before a fresh mount', () => {
    act(() => root.render(<LocationProbe />));
    act(() => hostConfiguration(configured));
    expect(result().configured).toBe(true);
    act(() => root.render(null));
    expect(getPropertyWeatherConfiguration().location).toBeNull();
    act(() => hostConfiguration(configured));
    expect(getPropertyWeatherConfiguration().location).toBeNull();
    act(() => root.render(<LocationProbe />));
    expect(result().ready).toBe(false);
    expect(result().configured).toBe(false);
  });
});
