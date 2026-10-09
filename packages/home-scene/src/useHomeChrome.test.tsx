// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeChrome } from './useHomeChrome';
import { HOME_CHROME_CHANNEL, homeChromeCommandMessage, homeChromePreferencesMessage, type HomeChromeCommand } from './homeChromeProtocol';
import { useHomeStore } from './state';
import { useCinematicStore } from './cinematicStore';
import { PROPERTY_LOCATION, type LiveEnvironment } from './environment/types';
import { SCENE_PRESENTATION_CHANNEL, scenePresentationMessage } from './scenePresentation';

vi.mock('./embeddedHost', () => ({ isEmbeddedScene: () => true }));
const postMessage = vi.fn();
const onOpenEnvironment = vi.fn();
const onOpenPreferences = vi.fn();
const environment: LiveEnvironment = {
  localTime: '10:42 AM', localDate: '2026-10-09', weather: null, status: 'stale', error: null,
  isNight: false, daylight: 1, sunAltitudeDeg: 42, now: 0, location: PROPERTY_LOCATION,
  timeZone: PROPERTY_LOCATION.timeZone, clockSource: 'solar-calculation', refresh: () => undefined,
};
let root: Root;
let container: HTMLElement;

/** Mount only the bridge with existing preference stores; no renderer or weather request is needed. */
function ChromeProbe({ ready = true, hostSuspended = false, systemReducedMotion = false, now = 0 }: { ready?: boolean; hostSuspended?: boolean; systemReducedMotion?: boolean; now?: number }) {
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  useHomeChrome({ environment: { ...environment, now }, ready, hostSuspended, motionDisabled, systemReducedMotion, onOpenEnvironment, onOpenPreferences });
  return null;
}

/** Model the native host's fixed injected event rather than a public browser postMessage. */
function send(id: number, command: HomeChromeCommand): void {
  window.dispatchEvent(new CustomEvent(HOME_CHROME_CHANNEL, { detail: homeChromeCommandMessage(id, command) }));
}

/** Echo only canonical host preferences, with no command or persistence side effect in the scene. */
function configure(idleEnabled: boolean, preferenceError = false): void {
  window.dispatchEvent(new CustomEvent(HOME_CHROME_CHANNEL, { detail: homeChromePreferencesMessage(idleEnabled, preferenceError) }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ReactNativeWebView', { postMessage });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  postMessage.mockReset(); onOpenEnvironment.mockReset(); onOpenPreferences.mockReset();
  useHomeStore.setState({ motionDisabled: false });
  useCinematicStore.setState({ idleEnabled: true, preferenceError: false, showcase: false });
  container = document.createElement('main'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('native header scene presentation', () => {
  it('publishes only hydrated public values and avoids unrelated clock/object updates', () => {
    act(() => root.render(<ChromeProbe ready={false} />));
    expect(postMessage).not.toHaveBeenCalled();
    act(() => root.render(<ChromeProbe />));
    expect(postMessage).not.toHaveBeenCalled();
    act(() => configure(true));
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      channel: HOME_CHROME_CHANNEL, version: 1, type: 'snapshot', snapshot: {
        locationName: 'Hopewell, Jamaica', localTime: '10:42 AM', tempC: null, weatherCode: null, weatherStatus: 'cached',
        isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: true, preferenceError: false,
      },
    });
    act(() => root.render(<ChromeProbe now={1_000} />));
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('drops unavailable and covered navigation intents instead of replaying them later', () => {
    act(() => root.render(<ChromeProbe ready={false} />));
    act(() => send(1, { type: 'open-environment' }));
    act(() => root.render(<ChromeProbe />));
    act(() => send(1, { type: 'open-environment' }));
    expect(onOpenEnvironment).not.toHaveBeenCalled();
    act(() => send(2, { type: 'open-environment' }));
    expect(onOpenEnvironment).toHaveBeenCalledTimes(1);
    act(() => root.render(<ChromeProbe hostSuspended />));
    act(() => send(3, { type: 'open-preferences' }));
    act(() => root.render(<ChromeProbe />));
    act(() => send(3, { type: 'open-preferences' }));
    expect(onOpenPreferences).not.toHaveBeenCalled();
    act(() => send(4, { type: 'open-preferences' }));
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it('applies stored tour configuration without localStorage and respects system reduced motion', () => {
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    act(() => root.render(<ChromeProbe hostSuspended />));
    act(() => send(1, { type: 'set-tour', enabled: false }));
    expect(useCinematicStore.getState().idleEnabled).toBe(true);
    act(() => { useCinematicStore.setState({ showcase: true }); configure(false, true); });
    expect(useCinematicStore.getState().idleEnabled).toBe(false);
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(localWrite).not.toHaveBeenCalled();
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0]).snapshot.idleEnabled).toBe(false);
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0]).snapshot.preferenceError).toBe(true);
    act(() => send(2, { type: 'set-motion', disabled: true }));
    expect(useHomeStore.getState().motionDisabled).toBe(true);
    act(() => root.render(<ChromeProbe hostSuspended systemReducedMotion />));
    act(() => send(3, { type: 'set-motion', disabled: false }));
    expect(useHomeStore.getState().motionDisabled).toBe(true);
  });

  it('does not accept hidden-document setters or replay them on return', () => {
    act(() => root.render(<ChromeProbe />));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => send(1, { type: 'set-tour', enabled: false }));
    expect(useCinematicStore.getState().idleEnabled).toBe(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => send(1, { type: 'set-tour', enabled: false }));
    expect(useCinematicStore.getState().idleEnabled).toBe(true);
  });

  it('honors an ordered trusted resume immediately before a fresh navigation command', () => {
    act(() => root.render(<ChromeProbe hostSuspended />));
    act(() => {
      window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) }));
      send(1, { type: 'open-preferences' });
    });
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });
});
