import { useCallback, useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getExteriorPrivacyDistance, getLandscapeCamera } from './siteGeometry';
import { getOverviewDistanceScale } from './overviewFraming';
import siteLayout from '../site-layout.json';
import { getRoom } from '../data';
import { ROOM_POSITIONS, type HouseSceneProps } from './types';
import { useCinematicStore } from '../cinematicStore';
import { advanceCinematicOrbit, bindCinematicInterruptions, canPlayCinematic } from './cinematicMotion';

type CameraProps = Pick<
  HouseSceneProps,
  'view' | 'floor' | 'roomId' | 'reducedMotion'
> & { suspended: boolean; roomOnly?: boolean; exteriorOnly?: boolean };

/** Animate camera presets, then hand complete control back to the visitor. */
export function CameraRig({ view, floor, roomId, reducedMotion, suspended, roomOnly = false, exteriorOnly = false }: CameraProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl, size } = useThree();
  const destination = useRef(new Vector3(27, 23, 14));
  const target = useRef(new Vector3(8, 1.2, -8));
  const currentLook = useRef(new Vector3(8, 1.2, -8));
  const direction = useRef(new Vector3());
  const moving = useRef(true);
  const lookAngles = useRef({ yaw: 0, pitch: 0 });
  const cinematicElapsed = useRef(0);
  const showcase = useCinematicStore((state) => state.showcase);
  const resetViewVersion = useCinematicStore((state) => state.resetViewVersion);

  /** Finish on the exact preset so repeated resets cannot accumulate framing drift. */
  const finishCameraMove = useCallback(() => {
    camera.position.copy(destination.current);
    currentLook.current.copy(target.current);
    camera.lookAt(target.current);
    controls.current?.target.copy(target.current);
    controls.current?.update();
    moving.current = false;
  }, [camera]);

  useEffect(() => {
    const unbind = bindCinematicInterruptions(document, stopShowcase);
    return () => {
      unbind();
      stopShowcase();
    };
  }, []);

  useEffect(() => {
    // A presentation never follows a navigation change into a different room or floor.
    stopShowcase();
  }, [view, floor, roomId]);

  useEffect(() => {
    if (!canPlayCinematic(view, reducedMotion, suspended, document.hidden)) stopShowcase();
  }, [reducedMotion, suspended, view, showcase]);

  useEffect(() => {
    cinematicElapsed.current = 0;
  }, [showcase]);

  // Device inspection must not reset an orbit; only immersive room navigation moves it.
  const cameraFloor = view === 'exterior' ? 'ground' : floor;
  const cameraRoomId = view === 'exterior' ? 'grounds' : roomId;

  useEffect(() => {
    const room =
      ROOM_POSITIONS[cameraRoomId] ??
      ROOM_POSITIONS[cameraFloor === 'upper' ? 'family' : 'living'];
    if (view === 'immersive') {
      destination.current.set(...room.eye);
      target.current.set(...room.look);
      if (cameraRoomId === 'grounds') {
        // Back up along the entrance sightline so the gate and posts fit a phone.
        const aspect = size.width / Math.max(1, size.height);
        const halfWidth = (siteLayout.runtime.gate.width + 1) / 2;
        const requiredDistance =
          (halfWidth * 1.1) / (Math.tan(Math.PI / 5) * aspect) + 1;
        const sightline = direction.current.subVectors(
          destination.current,
          target.current,
        );
        destination.current
          .copy(target.current)
          .add(
            sightline.setLength(Math.max(sightline.length(), requiredDistance)),
          );
      }
      if (cameraRoomId === 'utility') {
        const aspect = size.width / Math.max(1, size.height);
        const requiredDistance = 3.1 / (Math.tan(Math.PI / 5) * aspect);
        const sightline = direction.current.subVectors(
          destination.current,
          target.current,
        );
        destination.current
          .copy(target.current)
          .add(
            sightline.setLength(Math.max(sightline.length(), requiredDistance)),
          );
      }
      const look = direction.current
        .subVectors(target.current, destination.current)
        .normalize();
      lookAngles.current.yaw = Math.atan2(look.x, -look.z);
      lookAngles.current.pitch = Math.asin(look.y);
    } else if (view === 'exterior') {
      const fitted = getLandscapeCamera(size.width / Math.max(1, size.height));
      destination.current.set(...fitted.position);
      target.current.set(...fitted.target);
    } else {
      const bounds = getRoom(cameraRoomId).bounds;
      const distance = getOverviewDistanceScale(size.width, size.height);
      const isOverview = !roomOnly && (cameraRoomId === 'living' || cameraRoomId === 'family');
      if (!isOverview && bounds) {
        // A fitted room plan keeps individual bedside/ceiling controls apart on phones.
        const centerX = (bounds[0] + bounds[1]) / 2,
          centerZ = (bounds[2] + bounds[3]) / 2;
        const extent = Math.max(
          bounds[1] - bounds[0],
          bounds[3] - bounds[2],
          2.8,
        );
        const aspect = size.width / Math.max(1, size.height);
        const rise = Math.max(6.5, (extent * 1.5) / Math.min(1, aspect));
        destination.current.set(
          centerX + rise * 0.42,
          rise,
          centerZ + rise * 0.42,
        );
        target.current.set(centerX, 0.4, centerZ);
      } else {
        // Keep the full floor readable, with a small focus shift toward its room.
        const centerX = 8.2 + (room.center[0] - 8.2) * 0.17;
        const centerZ = -8 + (room.center[1] + 8) * 0.17;
        destination.current.set(
          centerX + 10.5 * distance,
          16 * distance,
          centerZ + 13.3 * distance,
        );
        // Aim slightly below the slab to center its perspective-expanded front edge.
        target.current.set(centerX, -1.8, centerZ);
      }
    }
    moving.current = true;
    // Interior room changes use a clean cut, avoiding a flight through solid walls.
    if (reducedMotion || view === 'immersive' || exteriorOnly) finishCameraMove();
  }, [
    finishCameraMove,
    cameraFloor,
    reducedMotion,
    cameraRoomId,
    roomOnly,
    exteriorOnly,
    size.width,
    size.height,
    view,
    resetViewVersion,
  ]);

  useEffect(() => {
    if (view !== 'immersive') return;
    const canvas = gl.domElement;
    let pointer: { id: number; x: number; y: number } | null = null;

    /** Begin a drag-to-look gesture without moving the camera through walls. */
    function beginLook(event: PointerEvent) {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    }
    /** Update horizontal and vertical view angles with bounded vertical tilt. */
    function moveLook(event: PointerEvent) {
      if (!pointer || pointer.id !== event.pointerId) return;
      lookAngles.current.yaw -= (event.clientX - pointer.x) * 0.0035;
      lookAngles.current.pitch = MathUtils.clamp(
        lookAngles.current.pitch - (event.clientY - pointer.y) * 0.0035,
        -0.9,
        0.9,
      );
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      moving.current = false;
    }
    /** Release a finished gesture, including interrupted touch input. */
    function endLook() {
      pointer = null;
    }
    /** Offer keyboard look controls without taking over page navigation. */
    function keyLook(event: KeyboardEvent) {
      const step = 0.12;
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') lookAngles.current.yaw += step;
      if (event.key === 'ArrowRight') lookAngles.current.yaw -= step;
      if (event.key === 'ArrowUp') lookAngles.current.pitch += step;
      if (event.key === 'ArrowDown') lookAngles.current.pitch -= step;
      lookAngles.current.pitch = MathUtils.clamp(
        lookAngles.current.pitch,
        -0.9,
        0.9,
      );
      moving.current = false;
    }
    canvas.addEventListener('pointerdown', beginLook);
    canvas.addEventListener('pointermove', moveLook);
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
    canvas.addEventListener('keydown', keyLook);
    return () => {
      canvas.removeEventListener('pointerdown', beginLook);
      canvas.removeEventListener('pointermove', moveLook);
      canvas.removeEventListener('pointerup', endLook);
      canvas.removeEventListener('pointercancel', endLook);
      canvas.removeEventListener('keydown', keyLook);
    };
  }, [gl, view]);

  // Negative priority orders camera motion before hotspot projection without taking over rendering.
  useFrame((_, delta) => {
    if (document.hidden || suspended) return;
    if (camera instanceof PerspectiveCamera) {
      const desiredFov = view === 'immersive' ? 72 : 42;
      const nextFov = reducedMotion
        ? desiredFov
        : MathUtils.damp(camera.fov, desiredFov, 6, Math.min(delta, 0.08));
      if (Math.abs(camera.fov - nextFov) > 0.001) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
    }
    if (moving.current) {
      const alpha = reducedMotion
        ? 1
        : 1 - Math.exp(-Math.min(delta, 0.25) * 5.5);
      camera.position.lerp(destination.current, alpha);
      currentLook.current.lerp(target.current, alpha);
      camera.lookAt(currentLook.current);
      if (controls.current) {
        controls.current.target.copy(currentLook.current);
        controls.current.update();
      }
      if (camera.position.distanceToSquared(destination.current) < 0.002 && currentLook.current.distanceToSquared(target.current) < 0.002)
        finishCameraMove();
    } else if (view === 'immersive') {
      const { yaw, pitch } = lookAngles.current;
      direction.current.set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      );
      currentLook.current.copy(camera.position).add(direction.current);
      camera.lookAt(currentLook.current);
    } else if (controls.current) {
      currentLook.current.copy(controls.current.target);
      // Read the transient store directly so capture-phase input stops the very next frame.
      if (useCinematicStore.getState().showcase && canPlayCinematic(view, reducedMotion, suspended, document.hidden)) {
        cinematicElapsed.current = advanceCinematicOrbit(
          camera.position,
          controls.current.target,
          cinematicElapsed.current,
          delta,
        );
        camera.lookAt(controls.current.target);
      }
    }
    camera.updateMatrixWorld();
  }, -2);

  /** Refresh world and view matrices after OrbitControls changes the pose later in the frame. */
  function syncOrbitMatrices() {
    camera.updateMatrixWorld();
  }

  /** Hand control over immediately and retain the exact pose where playback stopped. */
  function beginManualOrbit() {
    moving.current = false;
    stopShowcase();
  }

  if (view === 'immersive') return null;
  return (
    <OrbitControls
      // A fresh controller clears residual drag/pan momentum before restoring the preset.
      key={resetViewVersion}
      ref={controls}
      makeDefault
      enableDamping={!reducedMotion}
      enablePan={!exteriorOnly}
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.65}
      panSpeed={0.65}
      minDistance={exteriorOnly ? getExteriorPrivacyDistance(getLandscapeCamera(size.width / Math.max(1, size.height)).target) : view === 'exterior' ? 10 : 5}
      maxDistance={view === 'exterior' ? 300 : 55}
      maxPolarAngle={Math.PI / 2.06}
      minPolarAngle={0.08}
      onChange={syncOrbitMatrices}
      onStart={beginManualOrbit}
    />
  );
}

/** Cancel transient camera playback without touching any saved simulation preferences. */
function stopShowcase() {
  if (useCinematicStore.getState().showcase) useCinematicStore.getState().setShowcase(false);
}
