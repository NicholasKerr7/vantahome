// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetViewControl } from './ResetViewControl';
import { useCinematicStore } from './cinematicStore';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  useCinematicStore.setState({ showcase: false, resetViewVersion: 0 });
  useHomeStore.setState(createDefaultState());
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('reset view control', () => {
  it('restores only camera framing and stops playback while preserving the selected room and devices', () => {
    useHomeStore.getState().setRoom('master');
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().setDeviceLevel('master-light', 37);
    const home = useHomeStore.getState();
    useCinematicStore.getState().setShowcase(true);
    act(() => root.render(<ResetViewControl unavailable={false} />));
    const button = container.querySelector('button')!;

    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Reset view');
    expect(button.tabIndex).toBe(0);
    act(() => button.click());
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(useCinematicStore.getState().resetViewVersion).toBe(1);
    expect(useHomeStore.getState()).toBe(home);

    act(() => button.click());
    expect(useCinematicStore.getState().resetViewVersion).toBe(2);
    expect(useHomeStore.getState()).toBe(home);
  });

  it('waits for scene readiness before accepting a reset', () => {
    act(() => root.render(<ResetViewControl unavailable />));
    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('when the scene is ready');
    act(() => button.click());
    expect(useCinematicStore.getState().resetViewVersion).toBe(0);
  });
});
