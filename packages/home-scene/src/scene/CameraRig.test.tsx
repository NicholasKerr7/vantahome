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
  endOrbit: null as (() => void) | null,
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
    OrbitControls: forwardRef<TestOrbitControls, { onStart: () => void; onEnd: () => void; enabled: boolean; enableDamping: boolean }>(function TestControls({ onStart, onEnd, enabled, enableDamping }, ref) {
      const controls = useMemo(() => ({ target: new Vector3(), update: vi.fn(), enabled, enableDamping }), []);
      controls.enabled = enabled;
      controls.enableDamping = enableDamping;
      useImperativeHandle(ref, () => controls, [controls]);
      harness.controls = controls;
      harness.beginOrbit = onStart;
      harness.endOrbit = onEnd;
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
  harness.endOrbit = null;
  useCinematicStore.setState({ showcase: false, canRecenter: false, resetViewVersion: 0 });
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


describe('contextual recenter lifecycle', () => {
  it.each(['exterior', 'ground', 'upper'] as const)('shows only after a meaningful manual %s movement ends and clears immediately on reset', (view) => {
    renderCamera(view);
    advanceFrames();
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    const camera = harness.scene!.camera;
    const originalPosition = camera.position.clone();
    const originalTarget = harness.controls!.target.clone();
    act(() => harness.beginOrbit?.());
    camera.position.x += 4;
    harness.controls!.target.x += 4;
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    act(() => harness.endOrbit?.());
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    act(() => useCinematicStore.getState().resetView());
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    advanceFrames();
    expect(camera.position.equals(originalPosition)).toBe(true);
    expect(harness.controls!.target.equals(originalTarget)).toBe(true);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
  });

  it('settles an over-wide phone preset at the existing zoom limit and recognizes its actual default on manual return', () => {
    harness.scene!.size = { width: 390, height: 760 };
    renderCamera('ground', false, 'living');
    const camera = harness.scene!.camera;
    const controller = harness.controls!;
    // Exercise the same radius constraint as the real controller, not an inert update.
    vi.mocked(controller.update).mockImplementation(() => {
      const offset = camera.position.clone().sub(controller.target);
      offset.setLength(Math.max(5, Math.min(55, offset.length())));
      camera.position.copy(controller.target).add(offset);
      camera.lookAt(controller.target);
    });
    advanceFrames();
    expect(camera.position.distanceTo(controller.target)).toBeCloseTo(55, 8);
    const originalPosition = camera.position.clone();
    const originalTarget = controller.target.clone();
    const calls = vi.mocked(controller.update).mock.calls.length;
    advanceFrames(20);
    expect(vi.mocked(controller.update).mock.calls.length).toBe(calls);
    expect(useCinematicStore.getState().canRecenter).toBe(false);

    act(() => harness.beginOrbit?.());
    camera.position.x += 4;
    controller.target.x += 4;
    act(() => harness.endOrbit?.());
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    camera.position.copy(originalPosition);
    controller.target.copy(originalTarget);
    controller.update();
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
  });

  it('ignores an unmoved click and small jitter even during initial automatic framing', () => {
    renderCamera('exterior');
    advanceFrames(2);
    act(() => harness.beginOrbit?.());
    act(() => harness.endOrbit?.());
    advanceFrames();
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    act(() => harness.beginOrbit?.());
    harness.scene!.camera.position.x += 0.005;
    harness.controls!.target.x += 0.005;
    act(() => harness.endOrbit?.());
    advanceFrames();
    expect(useCinematicStore.getState().canRecenter).toBe(false);
  });

  it('preserves manual displacement through a tour and its delayed fullscreen return', () => {
    renderCamera('exterior');
    advanceFrames();
    act(() => harness.beginOrbit?.());
    harness.scene!.camera.position.x += 4;
    harness.controls!.target.x += 4;
    act(() => harness.endOrbit?.());
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    const position = harness.scene!.camera.position.clone();
    act(() => useCinematicStore.getState().setShowcase(true));
    harness.scene!.size = { width: 1024, height: 768 };
    renderCamera('exterior');
    act(() => advanceFrames(200));
    act(() => useCinematicStore.getState().setShowcase(false));
    harness.scene!.size = { width: 420, height: 580 };
    renderCamera('exterior');
    advanceFrames(1);
    expect(harness.scene!.camera.position.equals(position)).toBe(true);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    act(() => useCinematicStore.getState().resetView());
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    advanceFrames();
    expect(harness.scene!.camera.position.distanceTo(position)).toBeGreaterThan(1);
  });

  it('never enables recenter because of automatic tour movement or a normal responsive resize', () => {
    renderCamera('exterior');
    advanceFrames();
    act(() => useCinematicStore.getState().setShowcase(true));
    act(() => advanceFrames(900));
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    act(() => useCinematicStore.getState().setShowcase(false));
    harness.scene!.size = { width: 800, height: 450 };
    renderCamera('exterior');
    advanceFrames();
    expect(useCinematicStore.getState().canRecenter).toBe(false);
  });

  it('defers immersive keyboard reveal until key release and cleanly resets the look direction', () => {
    renderCamera('immersive');
    advanceFrames();
    const { camera, gl } = harness.scene!;
    const direction = camera.getWorldDirection(new Vector3());
    gl.domElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    gl.domElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    act(() => useCinematicStore.getState().resetView());
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    expect(camera.getWorldDirection(new Vector3()).distanceTo(direction)).toBeLessThan(1e-8);
  });

  it.each(['blur', 'canvas-blur', 'visibilitychange'] as const)('releases a lost immersive key on %s without changing existing framing or visibility', (event) => {
    renderCamera('immersive');
    advanceFrames();
    const canvas = harness.scene!.gl.domElement;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    const orientation = harness.scene!.camera.quaternion.clone();
    if (event === 'blur') window.dispatchEvent(new Event('blur'));
    else if (event === 'canvas-blur') canvas.dispatchEvent(new Event('blur'));
    else {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
    }
    // A different key's release cannot be blocked by the missing ArrowRight keyup.
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
    advanceFrames(1);
    canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    expect(harness.scene!.camera.quaternion.angleTo(orientation)).toBeGreaterThan(0.1);
    window.dispatchEvent(new Event('blur'));
    expect(useCinematicStore.getState().canRecenter).toBe(true);
  });

  it('defers immersive drag reveal until release and clears pointer capture on blur', () => {
    renderCamera('immersive');
    advanceFrames();
    const canvas = harness.scene!.gl.domElement;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    /** Provide browser pointer coordinates without requiring a jsdom PointerEvent implementation. */
    function pointer(type: string, x: number) {
      const event = new Event(type);
      Object.assign(event, { pointerId: 1, clientX: x, clientY: 10 });
      canvas.dispatchEvent(event);
    }
    pointer('pointerdown', 10);
    pointer('pointermove', 50);
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    window.dispatchEvent(new Event('blur'));
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    const orientation = harness.scene!.camera.quaternion.clone();
    pointer('pointermove', 90);
    advanceFrames(1);
    expect(harness.scene!.camera.quaternion.angleTo(orientation)).toBeLessThan(1e-7);
  });

  it('clears the previous action before another room or canvas can inherit it', () => {
    renderCamera('upper');
    advanceFrames();
    act(() => harness.beginOrbit?.());
    harness.scene!.camera.position.x += 4;
    harness.controls!.target.x += 4;
    act(() => harness.endOrbit?.());
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    renderCamera('upper', false, 'kitchen');
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    advanceFrames();
    act(() => harness.beginOrbit?.());
    harness.scene!.camera.position.x += 4;
    harness.controls!.target.x += 4;
    act(() => harness.endOrbit?.());
    advanceFrames(1);
    expect(useCinematicStore.getState().canRecenter).toBe(true);
    act(() => root.render(null));
    expect(useCinematicStore.getState().canRecenter).toBe(false);
  });
});
