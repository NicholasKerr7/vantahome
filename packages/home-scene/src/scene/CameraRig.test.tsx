// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCinematicStore } from '../cinematicStore';
import { CameraRig } from './CameraRig';
import type { HouseView } from './types';
import { createCinematicTourFrame } from './cinematicTour';

interface TestOrbitControls {
  target: Vector3;
  update: () => void;
  enabled: boolean;
  enableDamping: boolean;
}

const harness = vi.hoisted(() => ({
  frame: null as ((state: unknown, delta: number) => void) | null,
  scene: null as { camera: PerspectiveCamera; gl: { domElement: HTMLCanvasElement }; size: { width: number; height: number } } | null,
  controls: null as TestOrbitControls | null,
  beginOrbit: null as (() => void) | null,
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => harness.scene,
  useFrame: (callback: (state: unknown, delta: number) => void) => { harness.frame = callback; },
}));

vi.mock('@react-three/drei', async () => {
  const { forwardRef, useImperativeHandle, useMemo } = await import('react');
  const { Vector3 } = await import('three');
  return {
    /** Expose controller targets while keeping these camera lifecycle tests independent of WebGL. */
    OrbitControls: forwardRef<TestOrbitControls, { onStart: () => void; enabled: boolean; enableDamping: boolean }>(function TestControls({ onStart, enabled, enableDamping }, ref) {
      const controls = useMemo(() => ({ target: new Vector3(), update: vi.fn(), enabled, enableDamping }), []);
      controls.enabled = enabled;
      controls.enableDamping = enableDamping;
      useImperativeHandle(ref, () => controls, [controls]);
      harness.controls = controls;
      harness.beginOrbit = onStart;
      return null;
    }),
  };
});

let root: Root;
let container: HTMLDivElement;

/** Run ordinary scene frames until an animated camera return has settled. */
function advanceFrames(count = 180) {
  for (let frame = 0; frame < count; frame += 1) harness.frame?.({}, 1 / 60);
}

/** Mount a selected camera mode against a real Three.js camera and an inert controller. */
function renderCamera(view: HouseView, reducedMotion = false, roomId = 'master', extras: Partial<ComponentProps<typeof CameraRig>> = {}) {
  act(() => root.render(<CameraRig view={view} floor="upper" roomId={roomId} reducedMotion={reducedMotion} suspended={false} {...extras} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  harness.scene = { camera: new PerspectiveCamera(42, 1, 0.08, 500), gl: { domElement: document.createElement('canvas') }, size: { width: 420, height: 580 } };
  harness.controls = null;
  harness.beginOrbit = null;
  useCinematicStore.setState({ showcase: false, resetViewVersion: 0 });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('camera view restoration', () => {
  it.each(['exterior', 'upper'] as const)('smoothly restores %s framing after an orbit and pan', (view) => {
    renderCamera(view);
    advanceFrames();
    const camera = harness.scene!.camera;
    const originalPosition = camera.position.clone();
    const originalTarget = harness.controls!.target.clone();
    const originalControls = harness.controls;
    act(() => harness.beginOrbit?.());
    camera.position.set(60, 35, 25);
    harness.controls!.target.set(-10, 2, 15);
    advanceFrames(1);
    const movedPosition = camera.position.clone();

    act(() => useCinematicStore.getState().resetView());
    expect(camera.position.equals(movedPosition)).toBe(true);
    expect(harness.controls).not.toBe(originalControls);
    advanceFrames();
    expect(camera.position.distanceTo(originalPosition)).toBeLessThan(0.05);
    expect(harness.controls!.target.distanceTo(originalTarget)).toBeLessThan(0.05);
  });

  it('restores the current preset immediately when motion is reduced', () => {
    renderCamera('upper', true);
    const camera = harness.scene!.camera;
    const originalPosition = camera.position.clone();
    const originalTarget = harness.controls!.target.clone();
    camera.position.set(40, 22, 15);
    harness.controls!.target.set(6, 1, 3);

    act(() => useCinematicStore.getState().resetView());
    expect(camera.position.equals(originalPosition)).toBe(true);
    expect(harness.controls!.target.equals(originalTarget)).toBe(true);
  });

  it('restores the fixed immersive sightline after keyboard look without flying through walls', () => {
    renderCamera('immersive');
    advanceFrames(1);
    const camera = harness.scene!.camera;
    const originalPosition = camera.position.clone();
    const originalDirection = camera.getWorldDirection(new Vector3());
    harness.scene!.gl.domElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    advanceFrames(1);
    expect(camera.getWorldDirection(new Vector3()).distanceTo(originalDirection)).toBeGreaterThan(0.1);

    act(() => useCinematicStore.getState().resetView());
    expect(camera.position.equals(originalPosition)).toBe(true);
    expect(camera.getWorldDirection(new Vector3()).distanceTo(originalDirection)).toBeLessThan(1e-8);
    advanceFrames();
    expect(camera.position.equals(originalPosition)).toBe(true);
    expect(camera.getWorldDirection(new Vector3()).distanceTo(originalDirection)).toBeLessThan(1e-8);
  });

  it('keeps an exterior orbit intact when inspecting a different room', () => {
    renderCamera('exterior');
    advanceFrames();
    act(() => harness.beginOrbit?.());
    const camera = harness.scene!.camera;
    camera.position.set(60, 35, 25);
    const movedPosition = camera.position.clone();
    renderCamera('exterior', false, 'kitchen');
    advanceFrames();
    expect(camera.position.equals(movedPosition)).toBe(true);
  });
});


describe('cinematic camera lifecycle', () => {
  it.each(['exterior', 'upper'] as const)('restores the exact custom %s pose, target and lens after later canvas resizes', (view) => {
    const tourFrame = createCinematicTourFrame();
    renderCamera(view, false, 'master', { tourFrame });
    advanceFrames();
    const camera = harness.scene!.camera;
    act(() => harness.beginOrbit?.());
    camera.position.set(22, 19, 6);
    harness.controls!.target.set(7, 2, -8);
    camera.lookAt(harness.controls!.target);
    camera.fov = 47;
    const position = camera.position.clone();
    const orientation = camera.quaternion.clone();
    const target = harness.controls!.target.clone();
    const up = camera.up.clone();

    act(() => useCinematicStore.getState().setShowcase(true));
    expect(harness.controls!.enabled).toBe(false);
    act(() => advanceFrames(800));
    expect(tourFrame.active).toBe(true);
    expect(tourFrame.gateOpen).toBe(1);
    expect(camera.position.distanceTo(position)).toBeGreaterThan(10);
    harness.scene!.size = { width: 1024, height: 768 };
    renderCamera(view, false, 'master', { tourFrame });
    act(() => advanceFrames(10));

    act(() => useCinematicStore.getState().setShowcase(false));
    expect(tourFrame.active).toBe(false);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(orientation)).toBe(true);
    expect(camera.up.equals(up)).toBe(true);
    expect(camera.fov).toBe(47);
    expect(harness.controls!.target.equals(target)).toBe(true);
    expect(harness.controls!.enabled).toBe(true);

    // ResizeObserver reports the dashboard size after the exit commit has completed.
    advanceFrames(30);
    harness.scene!.size = { width: 420, height: 580 };
    renderCamera(view, false, 'master', { tourFrame });
    advanceFrames(30);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(orientation)).toBe(true);
    expect(harness.controls!.target.equals(target)).toBe(true);
    expect(camera.fov).toBe(47);

    // The consumed exit guard must not suppress a later independent resize.
    harness.scene!.size = { width: 800, height: 450 };
    renderCamera(view, false, 'master', { tourFrame });
    advanceFrames();
    expect(camera.position.distanceTo(position)).toBeGreaterThan(1);
    expect(camera.fov).toBeCloseTo(42, 1);
  });

  it('consumes restoration even when entering and leaving did not resize the canvas', () => {
    renderCamera('exterior');
    advanceFrames();
    harness.scene!.camera.position.set(22, 19, 6);
    const position = harness.scene!.camera.position.clone();
    act(() => useCinematicStore.getState().setShowcase(true));
    act(() => advanceFrames(60));
    act(() => useCinematicStore.getState().setShowcase(false));
    expect(harness.scene!.camera.position.equals(position)).toBe(true);
    harness.scene!.size = { width: 800, height: 450 };
    renderCamera('exterior');
    advanceFrames();
    expect(harness.scene!.camera.position.distanceTo(position)).toBeGreaterThan(1);
  });

  it('fits the returned dashboard when the actual viewport rotated during the tour', () => {
    renderCamera('exterior');
    advanceFrames();
    harness.scene!.camera.position.set(22, 19, 6);
    const position = harness.scene!.camera.position.clone();
    act(() => useCinematicStore.getState().setShowcase(true));
    act(() => advanceFrames(60));
    vi.stubGlobal('innerWidth', 768);
    vi.stubGlobal('innerHeight', 1024);
    harness.scene!.size = { width: 768, height: 1024 };
    renderCamera('exterior');
    act(() => useCinematicStore.getState().setShowcase(false));
    // Restoration is synchronous, then the genuinely changed layout earns a new fit.
    expect(harness.scene!.camera.position.equals(position)).toBe(true);
    harness.scene!.size = { width: 650, height: 700 };
    renderCamera('exterior');
    advanceFrames();
    expect(harness.scene!.camera.position.distanceTo(position)).toBeGreaterThan(1);
    expect(harness.scene!.camera.fov).toBeCloseTo(42, 1);
  });

  it('can start from immersive and restores the original look angles without drifting on later frames', () => {
    const tourFrame = createCinematicTourFrame();
    renderCamera('immersive', false, 'master', { tourFrame });
    advanceFrames();
    const camera = harness.scene!.camera;
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowUp']) {
      harness.scene!.gl.domElement.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    }
    advanceFrames(1);
    const position = camera.position.clone();
    const orientation = camera.quaternion.clone();
    const fov = camera.fov;
    act(() => useCinematicStore.getState().setShowcase(true));
    act(() => advanceFrames(1200));
    expect(useCinematicStore.getState().showcase).toBe(true);
    expect(camera.position.distanceTo(position)).toBeGreaterThan(5);
    act(() => useCinematicStore.getState().setShowcase(false));
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.equals(orientation)).toBe(true);
    advanceFrames(90);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.angleTo(orientation)).toBeLessThan(1e-7);
    expect(camera.fov).toBe(fov);
  });

  it.each(['reducedMotion', 'suspended', 'tourAllowed'] as const)('restores immediately when %s prevents continued playback', (blocker) => {
    const tourFrame = createCinematicTourFrame();
    renderCamera('upper', false, 'master', { tourFrame });
    advanceFrames();
    const position = harness.scene!.camera.position.clone();
    act(() => useCinematicStore.getState().setShowcase(true));
    act(() => advanceFrames(120));
    renderCamera('upper', false, 'master', { tourFrame, [blocker]: blocker === 'tourAllowed' ? false : true });
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(tourFrame.active).toBe(false);
    expect(harness.scene!.camera.position.equals(position)).toBe(true);
    advanceFrames();
    expect(harness.scene!.camera.position.equals(position)).toBe(true);
  });

  it('never begins a tour without its current presentation grant', () => {
    const tourFrame = createCinematicTourFrame();
    renderCamera('upper', false, 'master', { tourAllowed: false, tourFrame });
    advanceFrames();
    const position = harness.scene!.camera.position.clone();
    act(() => useCinematicStore.getState().setShowcase(true));
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(tourFrame.active).toBe(false);
    advanceFrames();
    expect(harness.scene!.camera.position.equals(position)).toBe(true);
  });

  it('publishes titles only when an authored chapter changes, without per-frame store writes', () => {
    renderCamera('exterior');
    advanceFrames();
    act(() => useCinematicStore.getState().setShowcase(true));
    const listener = vi.fn();
    const unsubscribe = useCinematicStore.subscribe(listener);
    act(() => advanceFrames(500));
    expect(listener).not.toHaveBeenCalled();
    act(() => advanceFrames(300));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useCinematicStore.getState().chapter).toBe('Welcome home');
    unsubscribe();
  });

  it('does not install its own document input listener ahead of the idle hook', () => {
    renderCamera('exterior');
    advanceFrames();
    act(() => useCinematicStore.getState().setShowcase(true));
    // The sole input owner must observe playback=true so it can consume the return gesture.
    document.dispatchEvent(new Event('pointerdown', { cancelable: true }));
    expect(useCinematicStore.getState().showcase).toBe(true);
  });

  it('releases the presentation frame and playback state when its canvas unmounts', () => {
    const tourFrame = createCinematicTourFrame();
    renderCamera('exterior', false, 'master', { tourFrame });
    advanceFrames();
    act(() => useCinematicStore.getState().setShowcase(true));
    act(() => advanceFrames(60));
    act(() => root.render(null));
    expect(tourFrame.active).toBe(false);
    expect(useCinematicStore.getState().showcase).toBe(false);
  });
});
