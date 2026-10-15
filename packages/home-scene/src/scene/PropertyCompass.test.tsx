// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PerspectiveCamera } from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PropertyCompass, PropertyCompassProjection, type CompassMarkers } from './PropertyCompass';

interface FrameState { camera: PerspectiveCamera; size: { width: number; height: number } }
const harness = vi.hoisted(() => ({ frame: null as ((state: FrameState) => void) | null }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: (state: FrameState) => void) => { harness.frame = callback; } }));
let root: Root;
let container: HTMLDivElement;
let markers: { current: CompassMarkers };

/** Mount the real SVG and frame callback without a browser GPU dependency. */
function renderCompass(enabled: boolean) {
  act(() => root.render(<>
    <PropertyCompassProjection markers={markers} enabled={enabled} />
    {enabled && <PropertyCompass markers={markers} />}
  </>));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  markers = { current: {} };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders all four true directions after the first frame, even at a close zoom', () => {
  renderCompass(true);
  const camera = new PerspectiveCamera(42, 390 / 580, 0.08, 500);
  camera.position.set(10, 3, -12);
  camera.lookAt(10, 0, -8);
  camera.updateMatrixWorld();
  harness.frame?.({ camera, size: { width: 390, height: 580 } });
  expect(container.querySelectorAll('[data-cardinal][visibility="visible"]')).toHaveLength(4);
  for (const marker of Object.values(markers.current)) {
    expect(marker?.getAttribute('transform')).toMatch(/^translate\([\d.]+ [\d.]+\)$/);
  }
  expect(container.querySelector('svg')?.getAttribute('aria-label')).toContain('True north aligned to the official NLA parcel map');
  expect(container.querySelector('.property-cardinal-note')?.textContent).toBe('TRUE');
  expect(container.querySelectorAll('button, [tabindex]')).toHaveLength(0);
});

it('does not rewrite stable coordinates and cleans refs when entering a floor or cinematic view', () => {
  renderCompass(true);
  const camera = new PerspectiveCamera(42, 1, 0.08, 500);
  camera.position.set(35, 40, -40);
  camera.lookAt(10, 0, -8);
  camera.updateMatrixWorld();
  const frame = { camera, size: { width: 600, height: 600 } };
  harness.frame?.(frame);
  const setter = vi.spyOn(markers.current.N!, 'setAttribute');
  harness.frame?.(frame);
  expect(setter).not.toHaveBeenCalled();
  renderCompass(false);
  expect(Object.values(markers.current).every((marker) => marker === null)).toBe(true);
  expect(() => harness.frame?.(frame)).not.toThrow();
  renderCompass(true);
  harness.frame?.(frame);
  expect(container.querySelectorAll('[data-cardinal][visibility="visible"]')).toHaveLength(4);
});
