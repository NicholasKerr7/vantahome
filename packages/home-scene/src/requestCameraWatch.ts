import { isEmbeddedScene } from './embeddedHost';
import { parseCameraWatchRequest } from './cameraNavigation';
import { canViewSceneDevice } from './sceneAccess';
import { useHomeStore } from './state';
import { useScenePreviewStore } from './scenePreviewStore';

/** Send an authorized camera navigation intent; the host rechecks its registry and access before opening. */
export function requestCameraWatch(deviceId: string): void {
  if (!isEmbeddedScene() || useScenePreviewStore.getState().active || !canViewSceneDevice(useHomeStore.getState().access, deviceId)) return;
  const message = parseCameraWatchRequest({ channel: 'vantahome-navigation', version: 1, type: 'camera-watch', deviceId });
  if (!message) return;
  const host = (window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } }).ReactNativeWebView;
  if (host) host.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}
