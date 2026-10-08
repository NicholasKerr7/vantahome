import React from 'react';
import { act, render } from '@testing-library/react-native';
import NativeSceneSurface from '../SceneSurface';
import WebSceneSurface from '../SceneSurface.web';
import { PROPERTY_LOCATION } from '../../../../packages/home-scene/src/environment/types';
import { WEATHER_CONFIGURATION_CHANNEL, nativePropertyWeatherScript } from '../../../../packages/home-scene/src/environment/propertyWeatherConfiguration';
import type { HomeWeatherSettingsState } from '../../weather-settings/useHomeWeatherSettings';

type NativeMessage = { nativeEvent: { data: string } };
let mockNativeMessage: (event: NativeMessage) => void;
let mockWebMessage: (event: MessageEvent<unknown>) => void;
const mockCanNavigate = jest.fn();
const mockSetWeatherLocation = jest.fn();
const mockWeatherConstructor = jest.fn();
const mockDisposeWeather = jest.fn();
const mockInjectJavaScript = jest.fn();
let mockNativeLoadEnd: () => void;
let mockWeatherSettings: HomeWeatherSettingsState;
const mockSession: { current: { handleMessage: jest.Mock; canNavigate: jest.Mock } | null } = {
  current: { handleMessage: jest.fn(), canNavigate: mockCanNavigate },
};
const mockFrameWindow = { postMessage: jest.fn() };
const routineRequest = { channel: 'vantahome-navigation', version: 1, type: 'device-routines', deviceId: 'living-light' };
const originalAddListener = window.addEventListener;
const originalRemoveListener = window.removeEventListener;

jest.mock('../scene-surface.css', () => ({}));
jest.mock('../prepareNativeScene', () => ({ prepareNativeScene: async () => 'file:///cache/index.html' }));
jest.mock('../useSceneSimulationSession', () => ({ useSceneSimulationSession: () => mockSession }));
jest.mock('../../weather-settings/useHomeWeatherSettings', () => ({ useHomeWeatherSettings: () => mockWeatherSettings }));
jest.mock('../nativeWeather', () => ({ NativeWeatherBroker: class {
  constructor(_deliver: unknown, options: unknown) { mockWeatherConstructor(options); }
  dispose() { mockDisposeWeather(); }
  handleMessage() {}
  setLocation(location: unknown) { mockSetWeatherLocation(location); }
}, nativeWeatherResponseScript: () => '' }));
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: React.forwardRef(({ onMessage, onLoadEnd }: { onMessage: (event: NativeMessage) => void; onLoadEnd: () => void }, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    mockNativeMessage = onMessage;
    mockNativeLoadEnd = onLoadEnd;
    return <View testID="native-scene-document" />;
  }) };
});

beforeEach(() => {
  mockCanNavigate.mockReturnValue(true);
  mockSession.current = { handleMessage: jest.fn(), canNavigate: mockCanNavigate };
  mockWeatherSettings = { location: PROPERTY_LOCATION, configured: false, canManage: true, loading: false, error: null, reload: jest.fn() };
  window.addEventListener = jest.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    mockWebMessage = listener as (event: MessageEvent<unknown>) => void;
  }) as typeof window.addEventListener;
  window.removeEventListener = jest.fn();
});

test('native host publishes only verified location changes and disables the broker when access is lost', async () => {
  mockWeatherSettings = { ...mockWeatherSettings, location: null, loading: true };
  const onStatus = jest.fn();
  const screen = render(<NativeSceneSurface onStatus={onStatus} />);
  await act(async () => { await Promise.resolve(); });
  expect(mockWeatherConstructor).toHaveBeenCalledWith({ location: null });
  act(() => { mockNativeLoadEnd(); });
  expect(mockSetWeatherLocation).toHaveBeenLastCalledWith(null);
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining(nativePropertyWeatherScript({
    channel: WEATHER_CONFIGURATION_CHANNEL, version: 1, location: null, configured: false, canManage: true, status: 'loading',
  })));

  const location = { ...PROPERTY_LOCATION, name: 'Property', latitude: 18.5 };
  mockWeatherSettings = { ...mockWeatherSettings, location, configured: true, loading: false };
  screen.rerender(<NativeSceneSurface onStatus={onStatus} />);
  expect(mockWeatherConstructor).toHaveBeenCalledTimes(1);
  expect(mockSetWeatherLocation).toHaveBeenLastCalledWith(location);
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining(nativePropertyWeatherScript({
    channel: WEATHER_CONFIGURATION_CHANNEL, version: 1, location, configured: true, canManage: true, status: 'ready',
  })));

  mockWeatherSettings = { ...mockWeatherSettings, location: null, configured: false, canManage: false, error: 'Access unavailable.' };
  screen.rerender(<NativeSceneSurface onStatus={onStatus} />);
  expect(mockSetWeatherLocation).toHaveBeenLastCalledWith(null);
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining('"status":"unavailable"'));
  screen.unmount();
  expect(mockDisposeWeather).toHaveBeenCalledTimes(1);
});

test('web host replaces private coordinates with an unavailable snapshot after access is lost', () => {
  const location = { ...PROPERTY_LOCATION, name: 'Property', latitude: 18.5 };
  mockWeatherSettings = { ...mockWeatherSettings, location, configured: true };
  const onStatus = jest.fn();
  const screen = render(<WebSceneSurface onStatus={onStatus} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  expect(mockFrameWindow.postMessage).toHaveBeenCalledWith({
    channel: WEATHER_CONFIGURATION_CHANNEL, version: 1, location, configured: true, canManage: true, status: 'ready',
  }, '*');
  mockWeatherSettings = { ...mockWeatherSettings, location: null, configured: false, canManage: false, error: 'Access unavailable.' };
  screen.rerender(<WebSceneSurface onStatus={onStatus} />);
  expect(mockFrameWindow.postMessage).toHaveBeenLastCalledWith({
    channel: WEATHER_CONFIGURATION_CHANNEL, version: 1, location: null, configured: false, canManage: false, status: 'unavailable',
  }, '*');
  screen.unmount();
});
afterEach(() => {
  window.addEventListener = originalAddListener;
  window.removeEventListener = originalRemoveListener;
  jest.clearAllMocks();
});

/** Deliver a request from the owned renderer, matching each platform's transport envelope. */
function sendRoutine(platform: 'native' | 'web'): void {
  if (platform === 'native') mockNativeMessage({ nativeEvent: { data: JSON.stringify(routineRequest) } });
  else mockWebMessage({ source: mockFrameWindow, data: routineRequest } as unknown as MessageEvent<unknown>);
}

test.each(['native', 'web'] as const)('%s scene ignores paused, disconnected, and synchronously revoked navigation', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onDeviceRoutines = jest.fn();
  const onStatus = jest.fn();
  const screen = render(<Component onStatus={onStatus} onDeviceRoutines={onDeviceRoutines} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  act(() => sendRoutine(platform));
  expect(onDeviceRoutines).toHaveBeenCalledTimes(1);

  screen.rerender(<Component suspended onStatus={onStatus} onDeviceRoutines={onDeviceRoutines} />);
  act(() => sendRoutine(platform));
  expect(onDeviceRoutines).toHaveBeenCalledTimes(1);

  screen.rerender(<Component onStatus={onStatus} onDeviceRoutines={onDeviceRoutines} />);
  // The session revokes synchronously, even before the host's suspended prop can commit.
  mockCanNavigate.mockReturnValue(false);
  act(() => sendRoutine(platform));
  expect(onDeviceRoutines).toHaveBeenCalledTimes(1);
  mockSession.current = null;
  act(() => sendRoutine(platform));
  expect(onDeviceRoutines).toHaveBeenCalledTimes(1);
  screen.unmount();
});
