import { CommonActions, type NavigationAction } from '@react-navigation/native';
import { openHomeFeature } from '../../app/homeNavigation';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { getCameraCenterAccess } from './cameraCenterModel';

const LOCATION_LIFETIME_MS = 30_000;
let locationSequence = 0;
let pendingLocation: { token: string; deviceId: string; scope: string; expiresAt: number } | null = null;

/** Resolve the model's exact authorized registry binding, without matching names or geometry sharing. */
export function resolveCameraDeviceId(state: HomeState, modelDeviceId: string): string | null {
  const access = getCameraCenterAccess(state);
  return access.devices.find((device) => access.bindings[device.id] === modelDeviceId)?.id ?? null;
}

/** Watch is navigation only; current membership, room and camera permissions are checked at the tap. */
export function openCameraViewer(dispatch: (action: NavigationAction) => void, deviceId: string): boolean {
  const access = getCameraCenterAccess(useHomeStore.getState());
  if (!access.canView || !access.devices.some((device) => device.id === deviceId)) return false;
  dispatch(CommonActions.navigate({ name: 'CameraViewer', params: { deviceId }, pop: true }));
  return true;
}

/** Reuse the existing camera wall so repeated Expand and All cameras do not stack duplicate screens. */
export function openCameraCenter(dispatch: (action: NavigationAction) => void): boolean {
  if (!getCameraCenterAccess(useHomeStore.getState()).canView) return false;
  dispatch(CommonActions.navigate({ name: 'Cameras', pop: true }));
  return true;
}

/** Return through the existing Home stack with an expiring intent, never another renderer. */
export function locateCameraInHome(dispatch: (action: NavigationAction) => void, deviceId: string): boolean {
  const access = getCameraCenterAccess(useHomeStore.getState());
  if (!access.canView || !access.scopeKey || !access.bindings[deviceId] || !access.devices.some((device) => device.id === deviceId)) return false;
  const token = `camera-location-${++locationSequence}`;
  pendingLocation = { token, deviceId, scope: access.identityKey, expiresAt: Date.now() + LOCATION_LIFETIME_MS };
  openHomeFeature(dispatch, 'Home', { cameraLocationToken: token });
  return true;
}

/** Redeem once after Home is ready, rechecking identity, permissions, binding and expiry. */
export function consumeCameraLocation(token: string | undefined): string | null {
  if (!token || pendingLocation?.token !== token) return null;
  const request = pendingLocation;
  pendingLocation = null;
  const access = getCameraCenterAccess(useHomeStore.getState());
  if (request.expiresAt <= Date.now() || !access.canView || access.identityKey !== request.scope
    || !access.devices.some((device) => device.id === request.deviceId)) return null;
  return access.bindings[request.deviceId] ?? null;
}
