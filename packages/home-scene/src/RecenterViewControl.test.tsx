// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecenterViewControl } from './RecenterViewControl';
import { useCinematicStore } from './cinematicStore';
import { useHomeStore } from './state';

let root: Root;
let viewport: HTMLElement;

/** Mount the action inside its real, stable focus destination without WebGL. */
function renderControl(unavailable = false) {
  act(() => root.render(<RecenterViewControl unavailable={unavailable} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useCinematicStore.setState({ canRecenter: false, showcase: false, resetViewVersion: 0 });
  viewport = document.createElement('section');
  viewport.id = 'house-preview';
  viewport.tabIndex = -1;
  document.body.append(viewport);
  root = createRoot(viewport);
});

afterEach(() => {
  act(() => root.unmount());
  viewport.remove();
  vi.unstubAllGlobals();
});

describe('contextual camera recovery', () => {
  it('appears after displacement without stealing focus, then restores focus before removing itself', () => {
    renderControl();
    viewport.focus();
    expect(viewport.querySelector('button')).toBeNull();
    act(() => useCinematicStore.getState().setCanRecenter(true));
    const button = viewport.querySelector('button')!;
    expect(button.textContent).toBe('Recenter view');
    expect(button.type).toBe('button');
    expect(document.activeElement).toBe(viewport);
    button.focus();
    const home = useHomeStore.getState();
    act(() => button.click());
    expect(document.activeElement).toBe(viewport);
    expect(viewport.querySelector('button')).toBeNull();
    expect(useCinematicStore.getState().resetViewVersion).toBe(1);
    expect(useHomeStore.getState()).toBe(home);
  });

  it('stays out of covering controls and tours while retaining the displaced-view recovery', () => {
    act(() => useCinematicStore.getState().setCanRecenter(true));
    renderControl(true);
    expect(viewport.querySelector('button')).toBeNull();
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    renderControl();
    expect(viewport.querySelector('button')).not.toBeNull();
    act(() => useCinematicStore.getState().setShowcase(true));
    expect(viewport.querySelector('button')).toBeNull();
    act(() => useCinematicStore.getState().setShowcase(false));
    expect(viewport.querySelector('button')).not.toBeNull();
    expect(useCinematicStore.getState().resetViewVersion).toBe(0);
  });

  it('does not steal a dialog trigger focus when hidden by its parent', () => {
    act(() => useCinematicStore.getState().setCanRecenter(true));
    renderControl();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    renderControl(true);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
