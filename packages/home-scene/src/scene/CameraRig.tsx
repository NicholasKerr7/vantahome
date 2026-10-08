import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getExteriorPrivacyDistance, getLandscapeCamera } from './siteGeometry';
import { getOverviewDistanceScale } from './overviewFraming';
import siteLayout from '../site-layout.json';
import { getRoom } from '../data';
import { ROOM_POSITIONS, type HouseSceneProps } from './types';
import { useCinematicStore } from '../cinematicStore';
import { canPlayCinematic } from './cinematicMotion';
import { advanceCinematicTour, createCinematicTourFrame, sampleCinematicTour, type CinematicTourFrame } from './cinematicTour';

type CameraProps = Pick<
  HouseSceneProps,
  'view' | 'floor' | 'roomId' | 'reducedMotion'
> & { suspended: boolean; roomOnly?: boolean; exteriorOnly?: boolean; tourAllowed?: boolean; tourFrame?: CinematicTourFrame };

interface TourReturnLayout {
  canvasWidth: number;
  canvasHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface TourReturnPose extends TourReturnLayout {
  position: Vector3;
  orientation: Quaternion;
  up: Vector3;
  target: Vector3;
  fov: number | null;
  yaw: number;
  pitch: number;
}

/** Animate camera presets, then hand complete control back to the visitor. */
export function CameraRig({ view, floor, roomId, reducedMotion, suspended, roomOnly = false, exteriorOnly = false, tourAllowed = true, tourFrame }: CameraProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl, size } = useThree();
  const destination = useRef(new Vector3(27, 23, 14));
  const target = useRef(new Vector3(8, 1.2, -8));
  const currentLook = useRef(new Vector3(8, 1.2, -8));
  const direction = useRef(new Vector3());
  const moving = useRef(true);
  const lookAngles = useRef({ yaw: 0, pitch: 0 });
  const [localTourFrame] = useState(createCinematicTourFrame);
  const frame = tourFrame ?? localTourFrame;
  const returnPose = useRef<TourReturnPose | null>(null);
  const restoredLayout = useRef<TourReturnLayout | null>(null);
  const retainedFov = useRef<number | null>(null);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const showcase = useCinematicStore((state) => state.showcase);
  const resetViewVersion = useCinematicStore((state) => state.resetViewVersion);

  /** Restore the exact saved pose before the input that interrupted playback is processed. */
  const restoreTourCamera = useCallback(() => {
    frame.active = false;
    const saved = returnPose.current;
    if (!saved) return;
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.orientation);
    camera.up.copy(saved.up);
    destination.current.copy(saved.position);
    target.current.copy(saved.target);
    currentLook.current.copy(saved.target);
    lookAngles.current.yaw = saved.yaw;
    lookAngles.current.pitch = saved.pitch;
    if (camera instanceof PerspectiveCamera && saved.fov !== null) {
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      retainedFov.current = saved.fov;
    }
    if (controls.current) {
      controls.current.target.copy(saved.target);
      controls.current.enabled = !suspendedRef.current;
    }
    camera.updateMatrixWorld();
    moving.current = false;
    returnPose.current = null;
    restoredLayout.current = {
      canvasWidth: saved.canvasWidth, canvasHeight: saved.canvasHeight,
      viewportWidth: saved.viewportWidth, viewportHeight: saved.viewportHeight,
    };
  }, [camera, frame]);

  useLayoutEffect(() => {
    // A synchronous subscription also covers parent-owned idle, access and lifecycle stops.
    const unsubscribe = useCinematicStore.subscribe((state, previous) => {
      if (previous.showcase && !state.showcase) restoreTourCamera();
    });
    return () => {
      unsubscribe();
      restoreTourCamera();
      stopShowcase();
    };
  }, [restoreTourCamera]);

  useLayoutEffect(() => {
    if (!showcase || !tourAllowed || !canPlayCinematic(reducedMotion, suspended, document.hidden)) {
      restoreTourCamera();
      if (showcase) stopShowcase();
      return;
    }
    if (returnPose.current) return;
    const saved: TourReturnPose = {
      position: camera.position.clone(), orientation: camera.quaternion.clone(), up: camera.up.clone(),
      target: (controls.current?.target ?? currentLook.current).clone(),
      fov: camera instanceof PerspectiveCamera ? camera.fov : null,
      yaw: lookAngles.current.yaw, pitch: lookAngles.current.pitch,
      canvasWidth: size.width, canvasHeight: size.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    };
    returnPose.current = saved;
    // Flush residual orbit damping synchronously, then put the captured pose back
    // before a frame can render. It cannot resume moving after the tour ends.
    if (controls.current) {
      const damping = controls.current.enableDamping;
      controls.current.enableDamping = false;
      controls.current.update();
      controls.current.enableDamping = damping;
      controls.current.target.copy(saved.target);
      controls.current.enabled = false;
    }
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.orientation);
    camera.updateMatrixWorld();
    moving.current = false;
    sampleCinematicTour(0, size.width / Math.max(1, size.height), frame);
    useCinematicStore.getState().setChapter(frame.chapter);
  }, [camera, frame, reducedMotion, restoreTourCamera, showcase, size.height, size.width, suspended, tourAllowed, view]);

  /** Finish on the exact preset so repeated resets cannot accumulate framing drift. */
  const finishCameraMove = useCallback(() => {
    camera.position.copy(destination.current);
    currentLook.current.copy(target.current);
    camera.lookAt(target.current);
    controls.current?.target.copy(target.current);
    controls.current?.update();
    moving.current = false;
  }, [camera]);

  const navigation = `${view}:${floor}:${roomId}`;
  const previousNavigation = useRef(navigation);
  useEffect(() => {
    // The idle controller owns input cancellation; this only covers direct navigation.
    if (previousNavigation.current !== navigation) stopShowcase();
    previousNavigation.current = navigation;
  }, [navigation]);

  // Device inspection must not reset an orbit; only immersive room navigation moves it.
  const cameraFloor = view === 'exterior' ? 'ground' : floor;
  const cameraRoomId = view === 'exterior' ? 'grounds' : roomId;
  const presetNavigation = `${view}:${cameraFloor}:${cameraRoomId}:${resetViewVersion}`;
  const previousPresetNavigation = useRef(presetNavigation);
  const previousPrivacy = useRef({ roomOnly, exteriorOnly });

  useEffect(() => {
    const navigationChanged = previousPresetNavigation.current !== presetNavigation;
    previousPresetNavigation.current = presetNavigation;
    const privacyChanged = previousPrivacy.current.roomOnly !== roomOnly || previousPrivacy.current.exteriorOnly !== exteriorOnly;
    previousPrivacy.current = { roomOnly, exteriorOnly };
    if (useCinematicStore.getState().showcase || returnPose.current) return;
    // Consume only the return from fullscreen. A later rotation/window resize
    // still fits normally, as does an orientation change made during the tour.
    const layout = restoredLayout.current;
    const viewportChanged = layout && (window.innerWidth !== layout.viewportWidth || window.innerHeight !== layout.viewportHeight);
    if (layout && !navigationChanged && !privacyChanged && !viewportChanged) {
      if (size.width === layout.canvasWidth && size.height === layout.canvasHeight) restoredLayout.current = null;
      return;
    }
    restoredLayout.current = null;
    retainedFov.current = null;
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
    presetNavigation,
    showcase,
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
    if (useCinematicStore.getState().showcase && tourAllowed && canPlayCinematic(reducedMotion, suspended, document.hidden)) {
      if (!returnPose.current) return;
      advanceCinematicTour(frame, delta, size.width / Math.max(1, size.height));
      camera.position.set(...frame.eye);
      currentLook.current.set(...frame.target);
      camera.lookAt(currentLook.current);
      if (camera instanceof PerspectiveCamera && camera.fov !== frame.fov) {
        camera.fov = frame.fov;
        camera.updateProjectionMatrix();
      }
      if (controls.current) controls.current.enabled = false;
      if (useCinematicStore.getState().chapter !== frame.chapter) useCinematicStore.getState().setChapter(frame.chapter);
      camera.updateMatrixWorld();
      return;
    }
    if (camera instanceof PerspectiveCamera) {
      const desiredFov = retainedFov.current ?? (view === 'immersive' ? 72 : 42);
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
      enabled={!showcase && !suspended}
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
