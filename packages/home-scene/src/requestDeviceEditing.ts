import { parseDeviceEditingRequest } from './deviceEditingNavigation';
import { isEmbeddedScene } from './embeddedHost';

/** Send a navigation-only intent from the scene; the authenticated host rechecks current editing authority. */
export function requestDeviceEditing(deviceId: string): void {
  if (!isEmbeddedScene()) return;
  const message = parseDeviceEditingRequest({ channel: 'vantahome-navigation', version: 1, type: 'device-edit', deviceId });
  if (!message) return;
  const host = (window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } }).ReactNativeWebView;
  if (host) host.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}
