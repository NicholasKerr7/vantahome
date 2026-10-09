// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecenterViewControl } from './RecenterViewControl';
import { SceneViewControls } from './SceneViewControls';
import { useCinematicStore } from './cinematicStore';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let root: Root;
let viewport: HTMLElement;

/** Exercise the real adjacent view and recovery controls without mounting WebGL. */
function renderControls() {
  act(() => root.render(<>
    <SceneViewControls onRooms={() => undefined} />
    <RecenterViewControl unavailable={false} />
  </>));
}

/** Find a visible action by its rendered label, preserving its actual click behavior. */
function button(label: string): HTMLButtonElement {
  const target = [...viewport.querySelectorAll('button')].find((element) => element.textContent === label);
  if (!target) throw new Error(`Missing ${label} control`);
  return target;
}

/** Assert a single truthful mode, independently of the contextual recovery button. */
function expectSelected(label: string) {
  expect([...viewport.querySelectorAll('.view-controls button[aria-pressed="true"]')].map((element) => element.textContent)).toEqual([label]);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
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

describe('exclusive view selection through camera recovery', () => {
  it.each(['ground', 'upper'] as const)('returns from immersive to the %s floor with only Floor plan selected', (floor) => {
    useHomeStore.getState().setFloor(floor);
    renderControls();
    expectSelected('Floor plan');
    act(() => button('Immersive').click());
    expectSelected('Immersive');
    act(() => useCinematicStore.getState().setCanRecenter(true));
    const beforeReset = useHomeStore.getState();
    act(() => button('Recenter view').click());
    expectSelected('Immersive');
    expect(useHomeStore.getState()).toBe(beforeReset);
    expect(document.activeElement).toBe(viewport);
    act(() => button('Immersive').click());
    expectSelected('Floor plan');
    expect(useHomeStore.getState().view).toBe(floor);
    expect(button('Immersive').getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['ground', 'upper', 'exterior', 'immersive'] as const)('recenters %s without selecting another mode or changing devices', (view) => {
    useHomeStore.getState().setView(view);
    useCinematicStore.getState().setCanRecenter(true);
    renderControls();
    const selectedLabel = view === 'exterior' ? 'Landscape' : view === 'immersive' ? 'Immersive' : 'Floor plan';
    const beforeReset = useHomeStore.getState();
    expectSelected(selectedLabel);
    act(() => button('Recenter view').click());
    expectSelected(selectedLabel);
    expect(useHomeStore.getState()).toBe(beforeReset);
    expect(useCinematicStore.getState().resetViewVersion).toBe(1);
    expect(viewport.querySelector('.recenter-view-control')).toBeNull();
  });

  it('restores the interior floor after exiting the gate view and leaves its prior mode unselected', () => {
    useHomeStore.getState().setFloor('upper');
    renderControls();
    act(() => button('Landscape').click());
    expectSelected('Landscape');
    act(() => button('Gate view').click());
    expectSelected('Gate view');
    act(() => button('Gate view').click());
    expectSelected('Floor plan');
    expect(useHomeStore.getState()).toMatchObject({ floor: 'upper', view: 'upper', roomId: 'family' });
    expect(button('Immersive').getAttribute('aria-pressed')).toBe('false');
  });
});
