// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { parseCameraWatchRequest } from './cameraNavigation';
import { requestCameraWatch } from './requestCameraWatch';
import { parseHomeChromeCommand, homeChromeCommandMessage } from './homeChromeProtocol';
import { useHomeStore } from './state';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';

const request = { channel: 'vantahome-navigation', version: 1, type: 'camera-watch', deviceId: 'entry-camera' };
const original = useHomeStore.getState().access;
afterEach(() => { vi.unstubAllGlobals(); useHomeStore.setState({ access: original }); });

test('Watch allows only exact camera navigation envelopes', () => {
  expect(parseCameraWatchRequest(JSON.stringify(request))).toEqual(request);
  for (const value of [null, 'x'.repeat(257), { ...request, deviceId: 'living-light' }, { ...request, deviceId: 'missing' },
    { ...request, version: 2 }, { ...request, url: 'https://example.com' }, { ...request, type: 'toggle' }]) expect(parseCameraWatchRequest(value)).toBeNull();
});

test('Watch uses navigation transport only and rechecks current scene access', () => {
  const postMessage = vi.fn();
  vi.stubGlobal('__VANTAHOME_EMBEDDED__', true);
  vi.stubGlobal('ReactNativeWebView', { postMessage });
  useHomeStore.setState({ access: FULL_SCENE_ACCESS });
  const devices = useHomeStore.getState().deviceStates;
  requestCameraWatch('entry-camera');
  expect(postMessage).toHaveBeenCalledWith(JSON.stringify(request));
  useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
  requestCameraWatch('entry-camera');
  requestCameraWatch('living-light');
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().deviceStates).toBe(devices);
});

test('Locate rejects non-camera and expanded presentation commands', () => {
  expect(parseHomeChromeCommand(homeChromeCommandMessage(1, { type: 'locate-camera', deviceId: 'entry-camera' }))).not.toBeNull();
  expect(parseHomeChromeCommand(homeChromeCommandMessage(1, { type: 'locate-camera', deviceId: 'living-light' }))).toBeNull();
  expect(parseHomeChromeCommand({ ...homeChromeCommandMessage(1, { type: 'locate-camera', deviceId: 'entry-camera' }), deviceState: { on: true } })).toBeNull();
});
