import React from 'react';
import { act, render } from '@testing-library/react-native';
import NativeSceneSurface from '../SceneSurface';
import WebSceneSurface from '../SceneSurface.web';
import { PROPERTY_LOCATION } from '../../../../packages/home-scene/src/environment/types';
import { WEATHER_CONFIGURATION_CHANNEL, nativePropertyWeatherScript } from '../../../../packages/home-scene/src/environment/propertyWeatherConfiguration';
import type { HomeWeatherSettingsState } from '../../weather-settings/useHomeWeatherSettings';
import { HOME_CHROME_CHANNEL, type HomeChromeSnapshot } from '../../../../packages/home-scene/src/homeChromeProtocol';
import type { HomeChromeCommandIntent } from '../protocol';

type NativeMessage = { nativeEvent: { data: string; url?: string } };
let mockNativeMessage: (event: NativeMessage) => void;
let mockWebMessage: (event: MessageEvent<unknown>) => void;
const mockCanNavigate = jest.fn();
const mockSetWeatherLocation = jest.fn();
const mockWeatherConstructor = jest.fn();
const mockDisposeWeather = jest.fn();
const mockInjectJavaScript = jest.fn();
const mockSaveChromePreference = jest.fn();
let mockChromePreferences = { ready: true, idleEnabled: true, preferenceError: false, save: mockSaveChromePreference };
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
jest.mock('../useHomeChromePreferences', () => ({ useHomeChromePreferences: () => mockChromePreferences }));
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
  mockChromePreferences = { ready: true, idleEnabled: true, preferenceError: false, save: mockSaveChromePreference };
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

const chromeSnapshot: HomeChromeSnapshot = {
  locationName: 'Hopewell, Jamaica', localTime: '10:42 AM', tempC: 27, weatherCode: 3, weatherStatus: 'live',
  isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: true, preferenceError: false,
};

/** Deliver renderer traffic from the trusted packaged URL or the exact web frame. */
function sendChrome(platform: 'native' | 'web', data: unknown, trusted = true): void {
  if (platform === 'native') mockNativeMessage({ nativeEvent: { data: JSON.stringify(data), url: trusted ? 'file:///cache/index.html' : 'about:blank' } });
  else mockWebMessage({ source: trusted ? mockFrameWindow : {}, data } as unknown as MessageEvent<unknown>);
}

/** Count presentation commands separately from unrelated simulation and weather traffic. */
function deliveredCommands(platform: 'native' | 'web'): number {
  return platform === 'native'
    ? mockInjectJavaScript.mock.calls.filter(([script]: [string]) => script.includes(`CustomEvent('${HOME_CHROME_CHANNEL}'`) && script.includes('"type":"command"')).length
    : mockFrameWindow.postMessage.mock.calls.filter(([message]) => message.channel === HOME_CHROME_CHANNEL && message.type === 'command').length;
}

test.each(['native', 'web'] as const)('%s accepts chrome snapshots only from the current document and current membership', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onChromeSnapshot = jest.fn();
  const screen = render(<Component onStatus={jest.fn()} onChromeSnapshot={onChromeSnapshot} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  const message = { channel: HOME_CHROME_CHANNEL, version: 1, type: 'snapshot', snapshot: chromeSnapshot };
  act(() => sendChrome(platform, message, false));
  act(() => sendChrome(platform, { ...message, token: 'unexpected' }));
  expect(onChromeSnapshot).not.toHaveBeenCalled();
  act(() => sendChrome(platform, message));
  expect(onChromeSnapshot).toHaveBeenCalledWith(chromeSnapshot);
  mockCanNavigate.mockReturnValue(false);
  act(() => sendChrome(platform, message));
  mockSession.current = null;
  act(() => sendChrome(platform, message));
  expect(onChromeSnapshot).toHaveBeenCalledTimes(1);
  screen.unmount();
});

test.each(['native', 'web'] as const)('%s sends fresh eligible chrome commands once, never on load or resumed access', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onStatus = jest.fn();
  let intent: HomeChromeCommandIntent = { id: 1, command: { type: 'open-environment' } };
  const screen = render(<Component onStatus={onStatus} chromeCommand={intent} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  act(() => sendChrome(platform, { channel: 'vantahome-scene', version: 1, status: 'ready' }));
  screen.rerender(<Component onStatus={onStatus} chromeCommand={intent} />);
  expect(deliveredCommands(platform)).toBe(0);

  intent = { id: 2, command: { type: 'open-environment' } };
  screen.rerender(<Component onStatus={onStatus} chromeCommand={intent} />);
  screen.rerender(<Component onStatus={onStatus} chromeCommand={{ ...intent }} />);
  expect(deliveredCommands(platform)).toBe(1);
  intent = { id: 3, command: { type: 'set-motion', disabled: true } };
  screen.rerender(<Component onStatus={onStatus} suspended chromeCommand={intent} />);
  screen.rerender(<Component onStatus={onStatus} chromeCommand={intent} />);
  expect(deliveredCommands(platform)).toBe(1);

  intent = { id: 4, command: { type: 'set-tour', enabled: false } };
  screen.rerender(<Component onStatus={onStatus} suspended allowChromePreferencesWhileSuspended chromeCommand={intent} />);
  expect(mockSaveChromePreference).toHaveBeenCalledWith(false);
  expect(mockSaveChromePreference).toHaveBeenCalledTimes(1);
  expect(deliveredCommands(platform)).toBe(1);
  intent = { id: 5, command: { type: 'open-preferences' } };
  screen.rerender(<Component onStatus={onStatus} suspended allowChromePreferencesWhileSuspended chromeCommand={intent} />);
  expect(deliveredCommands(platform)).toBe(1);

  mockCanNavigate.mockReturnValue(false);
  intent = { id: 6, command: { type: 'set-motion', disabled: false } };
  screen.rerender(<Component onStatus={onStatus} chromeCommand={intent} />);
  mockCanNavigate.mockReturnValue(true);
  screen.rerender(<Component onStatus={onStatus} chromeCommand={{ ...intent }} />);
  expect(deliveredCommands(platform)).toBe(1);
  screen.unmount();
});

test.each(['native', 'web'] as const)('%s rejects late preference hydration after current membership is lost', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  mockChromePreferences = { ...mockChromePreferences, ready: false };
  const onStatus = jest.fn();
  const screen = render(<Component onStatus={onStatus} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  mockInjectJavaScript.mockClear(); mockFrameWindow.postMessage.mockClear();
  mockCanNavigate.mockReturnValue(false);
  mockChromePreferences = { ...mockChromePreferences, ready: true, idleEnabled: false };
  screen.rerender(<Component onStatus={onStatus} />);
  expect(mockInjectJavaScript).not.toHaveBeenCalled();
  expect(mockFrameWindow.postMessage).not.toHaveBeenCalled();
  screen.unmount();
});
