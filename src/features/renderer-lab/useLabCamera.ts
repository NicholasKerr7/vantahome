import { useCallback, useEffect, useRef } from "react";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { useFilamentContext } from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";
import presets from '../../../packages/home-scene/src/renderer-lab/presets.json';

type CameraPreset = {
  eye: readonly number[];
  target: readonly number[];
};

type CameraOptions = {
  preset: CameraPreset;
  resetKey: number;
  onPick: (x: number, y: number) => void;
  minDistance?: number;
  maxDistance?: number;
};

type OrbitPosition = {
  yaw: number;
  elevation: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

type TouchPoint = { locationX: number; locationY: number };

type TouchSession = {
  startedAt: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pinchDistance: number;
  suppressPick: boolean;
};

const MIN_ELEVATION = 0.08;
const MAX_ELEVATION = Math.PI / 2 - 0.06;
const TAP_DISTANCE = 8;
const TAP_DURATION_MS = 400;
const ORBIT_RADIANS_PER_POINT = 0.006;
const CAMERA_FOV = presets.camera.fov;
const CAMERA_NEAR = presets.camera.near;
const CAMERA_FAR = presets.camera.far;

/** Keeps a camera value within a usable, finite range. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Measures two fingers in the native view's local coordinate system. */
function touchDistance(first: TouchPoint, second: TouchPoint): number {
  return Math.hypot(
    first.locationX - second.locationX,
    first.locationY - second.locationY,
  );
}

/** Converts a preset's eye and target into the orbit state used by the render thread. */
function createOrbitPosition(preset: CameraPreset): OrbitPosition {
  const targetX = preset.target[0] ?? 0;
  const targetY = preset.target[1] ?? 0;
  const targetZ = preset.target[2] ?? 0;
  const offsetX = (preset.eye[0] ?? 0) - targetX;
  const offsetY = (preset.eye[1] ?? 8) - targetY;
  const offsetZ = (preset.eye[2] ?? 12) - targetZ;
  const radius = Math.max(0.1, Math.hypot(offsetX, offsetY, offsetZ));

  return {
    yaw: Math.atan2(offsetX, offsetZ),
    elevation: clamp(
      Math.asin(clamp(offsetY / radius, -1, 1)),
      MIN_ELEVATION,
      MAX_ELEVATION,
    ),
    radius,
    targetX,
    targetY,
    targetZ,
  };
}

/**
 * Supplies a native orbit/pinch camera without scheduling React renders per frame.
 * Call updateCamera from Filament's render callback and attach the returned native
 * handlers to its view. Only short, stationary, single-finger gestures can pick.
 */
export function useLabCamera({
  preset,
  resetKey,
  onPick,
  minDistance,
  maxDistance,
}: CameraOptions) {
  const { camera, view } = useFilamentContext();
  const initialPosition = createOrbitPosition(preset);
  const isPropertyPreset = initialPosition.radius >= 25;
  const minimumRadius = Math.max(0.1, minDistance ?? (isPropertyPreset ? 8 : 3));
  const maximumRadius = Math.max(
    minimumRadius,
    maxDistance ?? (isPropertyPreset ? 160 : 70),
  );
  const orbit = useSharedValue(initialPosition);
  const layoutAspect = useSharedValue(1);
  const previousAspect = useSharedValue(0);
  const session = useRef<TouchSession | null>(null);

  const eyeX = preset.eye[0];
  const eyeY = preset.eye[1];
  const eyeZ = preset.eye[2];
  const targetX = preset.target[0];
  const targetY = preset.target[1];
  const targetZ = preset.target[2];

  useEffect(() => {
    const nextPosition = createOrbitPosition({
      eye: [eyeX, eyeY, eyeZ],
      target: [targetX, targetY, targetZ],
    });
    orbit.value = {
      ...nextPosition,
      radius: clamp(nextPosition.radius, minimumRadius, maximumRadius),
    };
    session.current = null;
  }, [
    eyeX,
    eyeY,
    eyeZ,
    targetX,
    targetY,
    targetZ,
    resetKey,
    minimumRadius,
    maximumRadius,
    orbit,
  ]);

  /** Applies the latest shared orbit and projection on Filament's rendering thread. */
  const updateCamera = useCallback(() => {
    "worklet";
    const nativeAspect = view.getAspectRatio();
    const aspect = nativeAspect > 0 ? nativeAspect : layoutAspect.value;
    if (aspect !== previousAspect.value) {
      camera.setProjection(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
      previousAspect.value = aspect;
    }

    const position = orbit.value;
    const fittedRadius = position.radius * Math.max(1, 0.8 / aspect);
    const horizontalRadius = fittedRadius * Math.cos(position.elevation);
    camera.lookAt(
      [
        position.targetX + horizontalRadius * Math.sin(position.yaw),
        position.targetY + fittedRadius * Math.sin(position.elevation),
        position.targetZ + horizontalRadius * Math.cos(position.yaw),
      ],
      [position.targetX, position.targetY, position.targetZ],
      [0, 1, 0],
    );
  }, [camera, view, orbit, layoutAspect, previousAspect]);

  /** Records a fallback aspect while the native render surface is being created. */
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) layoutAspect.value = width / height;
    },
    [layoutAspect],
  );

  /** Begins a gesture or switches an existing gesture into non-picking pinch mode. */
  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    const first = touches[0];
    if (!first) return;

    if (!session.current) {
      session.current = {
        startedAt: Date.now(),
        startX: first.locationX,
        startY: first.locationY,
        lastX: first.locationX,
        lastY: first.locationY,
        pinchDistance: 0,
        suppressPick: false,
      };
    }

    const second = touches[1];
    if (second) {
      session.current.suppressPick = true;
      session.current.pinchDistance = touchDistance(first, second);
    }
  }, []);

  /** Updates shared orbit coordinates directly, preserving pinch-to-orbit continuity. */
  const onTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const gesture = session.current;
      const touches = event.nativeEvent.touches;
      const first = touches[0];
      if (!gesture || !first) return;

      const second = touches[1];
      if (second) {
        gesture.suppressPick = true;
        const distance = touchDistance(first, second);
        if (gesture.pinchDistance > 0 && distance > 0) {
          const current = orbit.value;
          orbit.value = {
            ...current,
            radius: clamp(
              current.radius * (gesture.pinchDistance / distance),
              minimumRadius,
              maximumRadius,
            ),
          };
        }
        gesture.pinchDistance = distance;
      } else {
        const distanceFromStart = Math.hypot(
          first.locationX - gesture.startX,
          first.locationY - gesture.startY,
        );
        if (distanceFromStart >= TAP_DISTANCE) gesture.suppressPick = true;
        const current = orbit.value;
        orbit.value = {
          ...current,
          yaw:
            current.yaw -
            (first.locationX - gesture.lastX) * ORBIT_RADIANS_PER_POINT,
          elevation: clamp(
            current.elevation +
              (first.locationY - gesture.lastY) * ORBIT_RADIANS_PER_POINT,
            MIN_ELEVATION,
            MAX_ELEVATION,
          ),
        };
        gesture.pinchDistance = 0;
      }
      gesture.lastX = first.locationX;
      gesture.lastY = first.locationY;
    },
    [orbit, minimumRadius, maximumRadius],
  );

  /** Picks only after every finger is released and the entire gesture qualified as a tap. */
  const onTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const gesture = session.current;
      if (!gesture) return;
      const remaining = event.nativeEvent.touches;
      const first = remaining[0];
      if (first) {
        gesture.suppressPick = true;
        gesture.lastX = first.locationX;
        gesture.lastY = first.locationY;
        gesture.pinchDistance = remaining[1]
          ? touchDistance(first, remaining[1])
          : 0;
        return;
      }

      session.current = null;
      const ended = event.nativeEvent.changedTouches[0] ?? event.nativeEvent;
      const moved = Math.hypot(
        ended.locationX - gesture.startX,
        ended.locationY - gesture.startY,
      );
      if (
        !gesture.suppressPick &&
        moved < TAP_DISTANCE &&
        Date.now() - gesture.startedAt < TAP_DURATION_MS
      ) {
        onPick(ended.locationX, ended.locationY);
      }
    },
    [onPick],
  );

  /** Cancels the complete gesture so interrupted touches cannot activate devices. */
  const onTouchCancel = useCallback(() => {
    session.current = null;
  }, []);

  return {
    updateCamera,
    onLayout,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
