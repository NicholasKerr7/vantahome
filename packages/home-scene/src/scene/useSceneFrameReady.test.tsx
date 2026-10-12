// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Group } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSceneFrameReady } from './useSceneFrameReady';

const harness = vi.hoisted(() => ({
  frame: null as (() => void) | null,
  afterEffects: new Set<() => void>(),
  renderer: { info: { render: { frame: 0 } } },
  invalidate: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: { gl: typeof harness.renderer; invalidate: typeof harness.invalidate }) => unknown) =>
    selector({ gl: harness.renderer, invalidate: harness.invalidate }),
  useFrame: (callback: () => void) => { harness.frame = callback; },
  addAfterEffect: (callback: () => void) => {
    harness.afterEffects.add(callback);
    return () => harness.afterEffects.delete(callback);
  },
}));

let root: Root;
let container: HTMLDivElement;
const preparedScene = new Group();

/** Mount the real hook without creating a WebGL context in the DOM test runner. */
function ReadyProbe({ scene = preparedScene, onReady }: { scene?: Group; onReady: () => void }) {
  useSceneFrameReady(scene, onReady);
  return null;
}

/** Follow Fiber's actual order: local callbacks, renderer submission, global after-effects. */
function drawFrame(render = true): void {
  harness.frame?.();
  if (render) harness.renderer.info.render.frame += 1;
  for (const after of harness.afterEffects) after();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  harness.frame = null;
  harness.afterEffects.clear();
  harness.renderer.info.render.frame = 0;
  harness.invalidate.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('authorized scene first-frame readiness', () => {
  it('waits for its own rendered frame instead of asset preparation or another canvas', () => {
    const onReady = vi.fn();
    act(() => root.render(<ReadyProbe onReady={onReady} />));
    expect(harness.invalidate).toHaveBeenCalledTimes(1);
    for (const after of harness.afterEffects) after();
    expect(onReady).not.toHaveBeenCalled();
    act(() => drawFrame(false));
    expect(onReady).not.toHaveBeenCalled();
    act(() => drawFrame());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(harness.afterEffects.size).toBe(0);
    act(() => drawFrame());
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('discards a prepared scope that is replaced before the render completes', () => {
    const formerScopeReady = vi.fn();
    const currentScopeReady = vi.fn();
    act(() => root.render(<ReadyProbe onReady={formerScopeReady} />));
    harness.frame?.();
    const detachedAfter = [...harness.afterEffects][0];
    act(() => root.render(<ReadyProbe scene={new Group()} onReady={currentScopeReady} />));
    harness.renderer.info.render.frame += 1;
    detachedAfter();
    for (const after of harness.afterEffects) after();
    expect(formerScopeReady).not.toHaveBeenCalled();
    expect(currentScopeReady).not.toHaveBeenCalled();
    act(() => drawFrame());
    expect(currentScopeReady).toHaveBeenCalledTimes(1);
  });

  it('requires a new frame when permissions change around the same prepared model', () => {
    const previousReady = vi.fn();
    const restrictedReady = vi.fn();
    act(() => root.render(<ReadyProbe onReady={previousReady} />));
    act(() => drawFrame());
    act(() => root.render(<ReadyProbe onReady={restrictedReady} />));
    for (const after of harness.afterEffects) after();
    expect(restrictedReady).not.toHaveBeenCalled();
    act(() => drawFrame());
    expect(restrictedReady).toHaveBeenCalledTimes(1);
  });

  it('does not reveal from a background frame and resumes on the next visible draw', () => {
    const onReady = vi.fn();
    act(() => root.render(<ReadyProbe onReady={onReady} />));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => drawFrame());
    expect(onReady).not.toHaveBeenCalled();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => drawFrame());
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('cannot signal readiness after an unmount, even from an already captured callback', () => {
    const onReady = vi.fn();
    act(() => root.render(<ReadyProbe onReady={onReady} />));
    harness.frame?.();
    const detachedAfter = [...harness.afterEffects][0];
    act(() => root.render(null));
    harness.renderer.info.render.frame += 1;
    detachedAfter();
    expect(onReady).not.toHaveBeenCalled();
    expect(harness.afterEffects.size).toBe(0);
  });

  it('keeps one listener through strict remounts and does not repeat on ordinary rerenders', () => {
    const onReady = vi.fn();
    act(() => root.render(<StrictMode><ReadyProbe onReady={onReady} /></StrictMode>));
    expect(harness.afterEffects.size).toBe(1);
    act(() => drawFrame());
    act(() => root.render(<StrictMode><ReadyProbe onReady={onReady} /></StrictMode>));
    act(() => drawFrame());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(harness.afterEffects.size).toBe(0);
  });
});
