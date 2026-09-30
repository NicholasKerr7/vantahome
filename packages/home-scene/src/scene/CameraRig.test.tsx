// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCinematicStore } from '../cinematicStore';
import { CameraRig } from './CameraRig';
import type { HouseView } from './types';

interface TestOrbitControls {
  target: Vector3;
  update: () => void;
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
    OrbitControls: forwardRef<TestOrbitControls, { onStart: () => void }>(function TestControls({ onStart }, ref) {
      const controls = useMemo(() => ({ target: new Vector3(), update: vi.fn() }), []);
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
function renderCamera(view: HouseView, reducedMotion = false, roomId = 'master') {
  act(() => root.render(<CameraRig view={view} floor="upper" roomId={roomId} reducedMotion={reducedMotion} suspended={false} />));
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
