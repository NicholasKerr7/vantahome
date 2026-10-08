import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CameraRecenterTracker } from './cameraRecenter';

/** Supply a real camera and isolated publication boundary without a renderer or global store. */
function setup() {
  const camera = new PerspectiveCamera(42, 1, 0.1, 500);
  const target = new Vector3();
  camera.position.set(0, 0, 20);
  camera.lookAt(target);
  const publish = vi.fn();
  const tracker = new CameraRecenterTracker(publish);
  tracker.setDefault(camera.position, target, camera.fov);
  return { camera, target, publish, tracker };
}

/** Orbit about the stable target while retaining the original viewing distance. */
function orbit(camera: PerspectiveCamera, degrees: number) {
  const radians = degrees * Math.PI / 180;
  camera.position.set(Math.sin(radians) * 20, 0, Math.cos(radians) * 20);
  camera.lookAt(0, 0, 0);
}

describe('manual camera displacement', () => {
  it('ignores initial framing, navigation and tour-like automatic motion without a manual gesture', () => {
    const { camera, target, publish, tracker } = setup();
    camera.position.set(80, 60, 30);
    camera.lookAt(target);
    for (let frame = 0; frame < 60; frame += 1) tracker.sample(camera, target, false);
    expect(publish).not.toHaveBeenCalled();
  });

  it.each(['orbit', 'pan', 'zoom'])('reveals once after meaningful %s movement and gesture release', (kind) => {
    const { camera, target, publish, tracker } = setup();
    tracker.beginManual(camera, target);
    if (kind === 'orbit') orbit(camera, 6);
    if (kind === 'pan') { camera.position.x += 2; target.x += 2; }
    if (kind === 'zoom') camera.position.z = 16;
    tracker.sample(camera, target, false);
    expect(publish).not.toHaveBeenCalled();
    tracker.endManual();
    for (let frame = 0; frame < 120; frame += 1) tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true]]);
  });

  it('accumulates short manual zoom steps without treating each wheel event as a new threshold', () => {
    const { camera, target, publish, tracker } = setup();
    for (const distance of [19.4, 18.8]) {
      tracker.beginManual(camera, target);
      camera.position.z = distance;
      tracker.endManual();
      tracker.sample(camera, target, false);
    }
    expect(publish.mock.calls).toEqual([[true]]);
  });

  it('ignores bare clicks, jitter and automatic FOV settling after a clean navigation cut', () => {
    const { camera, target, publish, tracker } = setup();
    tracker.beginManual(camera, target);
    tracker.endManual();
    tracker.sample(camera, target, false);
    tracker.beginManual(camera, target);
    orbit(camera, 0.2);
    camera.position.multiplyScalar(1.005);
    camera.fov = 70;
    tracker.endManual();
    tracker.sample(camera, target, false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('waits for a near-default return instead of flickering around the reveal threshold', () => {
    const { camera, target, publish, tracker } = setup();
    tracker.beginManual(camera, target);
    orbit(camera, 4);
    tracker.endManual();
    tracker.sample(camera, target, false);
    orbit(camera, 2);
    tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true]]);
    orbit(camera, 1);
    tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true], [false]]);
  });

  it('compares immersive look direction without mistaking its unit sightline for a zoom or pan', () => {
    const { camera, target, publish, tracker } = setup();
    tracker.beginManual(camera, target);
    camera.rotateY(0.15);
    const lookTarget = camera.getWorldDirection(new Vector3()).add(camera.position);
    tracker.endManual();
    tracker.sample(camera, lookTarget, true);
    expect(publish.mock.calls).toEqual([[true]]);
    camera.lookAt(target);
    lookTarget.copy(camera.getWorldDirection(new Vector3())).add(camera.position);
    tracker.sample(camera, lookTarget, true);
    expect(publish.mock.calls).toEqual([[true], [false]]);
  });

  it('retains visibility for lens displacement after deliberate movement until the full framing returns', () => {
    const { camera, target, publish, tracker } = setup();
    tracker.beginManual(camera, target);
    orbit(camera, 5);
    tracker.endManual();
    tracker.sample(camera, target, false);
    orbit(camera, 0);
    camera.fov = 46;
    tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true]]);
    camera.fov = 42;
    tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true], [false]]);
  });

  it('clears intent immediately for a new baseline and never lets external destination changes overwrite it', () => {
    const { camera, target, publish, tracker } = setup();
    tracker.beginManual(camera, target);
    orbit(camera, 6);
    tracker.endManual();
    tracker.sample(camera, target, false);
    tracker.setDefault(camera.position, target, 42);
    expect(publish.mock.calls).toEqual([[true], [false]]);
    tracker.beginManual(camera, target);
    target.x = 2;
    camera.position.x += 2;
    tracker.endManual();
    tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true], [false], [true]]);
    tracker.clear();
    tracker.sample(camera, target, false);
    expect(publish.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
