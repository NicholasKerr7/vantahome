import React from 'react';
import { act, render } from '@testing-library/react-native';
import NativeSceneSurface from '../SceneSurface';
import WebSceneSurface from '../SceneSurface.web';
import { PROPERTY_LOCATION } from '../../../../packages/home-scene/src/environment/types';
import { WEATHER_CONFIGURATION_CHANNEL, nativePropertyWeatherScript } from '../../../../packages/home-scene/src/environment/propertyWeatherConfiguration';
import type { HomeWeatherSettingsState } from '../../weather-settings/useHomeWeatherSettings';
import { HOME_CHROME_CHANNEL, type HomeChromeSnapshot } from '../../../../packages/home-scene/src/homeChromeProtocol';
import type { HomeChromeCommandIntent } from '../protocol';
import { createDefaultDevicePlacement, replaceRuntimeDevices } from '../../../../packages/home-scene/src/devicePlacement';
import { useHomeStore } from '../../../store/useHomeStore';
import { createDefaultSimulationSnapshot, type SimulationSnapshotMessage } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { SCENE_PREVIEW_CHANNEL, scenePreviewCommandMessage, type ScenePreviewCommand, type ScenePreviewReport } from '../../../../packages/home-scene/src/scenePreviewProtocol';

type NativeMessage = { nativeEvent: { data: string; url?: string } };
let mockNativeMessage: (event: NativeMessage) => void;
let mockWebMessage: (event: MessageEvent<unknown>) => void;
let mockDeliverSnapshot: (message: SimulationSnapshotMessage) => void;
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
jest.mock('../useSceneSimulationSession', () => ({ useSceneSimulationSession: (deliver: typeof mockDeliverSnapshot) => {
  mockDeliverSnapshot = deliver;
  return mockSession;
} }));
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
  replaceRuntimeDevices([]);
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

/** Isolate host preference delivery from weather, lifecycle and device-state messages. */
function deliveredPreferences(platform: 'native' | 'web'): string[] {
  return platform === 'native'
    ? mockInjectJavaScript.mock.calls.map(([script]: [string]) => script).filter((script) => script.includes('"type":"preferences"'))
    : mockFrameWindow.postMessage.mock.calls.filter(([message]) => message.channel === HOME_CHROME_CHANNEL && message.type === 'preferences')
      .map(([message]) => JSON.stringify(message));
}

/** Resolve delayed session hydration without inventing another renderer load or ready notification. */
function deliverHydratedSnapshot(): void {
  mockDeliverSnapshot({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: createDefaultSimulationSnapshot() });
}

test.each(['native', 'web'] as const)('%s updates the account temperature unit without remounting and reapplies it after fresh membership', async (platform) => {
  const originalState = useHomeStore.getState();
  useHomeStore.setState({ profile: { ...originalState.profile, tempUnit: 'C' }, membershipReady: true });
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onStatus = jest.fn();
  const frameNode = { contentWindow: mockFrameWindow };
  const createNodeMock = jest.fn((element) => element.type === 'iframe' ? frameNode : null);
  const screen = render(<Component onStatus={onStatus} />, { createNodeMock });
  await act(async () => { await Promise.resolve(); });
  act(() => sendChrome(platform, { channel: 'vantahome-scene', version: 1, status: 'ready' }));
  const document = platform === 'native' ? screen.getByTestId('native-scene-document') : screen.UNSAFE_root.findByProps({ title: '3D Home simulation' });
  mockInjectJavaScript.mockClear(); mockFrameWindow.postMessage.mockClear();

  act(() => { useHomeStore.setState({ profile: { ...originalState.profile, tempUnit: 'F' } }); });
  expect(deliveredPreferences(platform).at(-1)).toContain('"tempUnit":"F"');
  expect(platform === 'native' ? screen.getByTestId('native-scene-document') : screen.UNSAFE_root.findByProps({ title: '3D Home simulation' })).toBe(document);
  if (platform === 'native') expect(mockWeatherConstructor).toHaveBeenCalledTimes(1);
  else expect(createNodeMock).toHaveBeenCalledTimes(1);

  mockInjectJavaScript.mockClear(); mockFrameWindow.postMessage.mockClear();
  mockCanNavigate.mockReturnValue(false);
  act(() => { useHomeStore.setState({ profile: { ...originalState.profile, tempUnit: undefined }, membershipReady: false, sessionEpoch: originalState.sessionEpoch + 1 }); });
  expect(deliveredPreferences(platform)).toHaveLength(0);
  act(() => { useHomeStore.setState({ membershipReady: true }); });
  expect(deliveredPreferences(platform)).toHaveLength(0);
  mockCanNavigate.mockReturnValue(true);
  act(deliverHydratedSnapshot);
  expect(deliveredPreferences(platform).at(-1)).toContain('"tempUnit":"C"');
  const deliveryCount = deliveredPreferences(platform).length;
  act(deliverHydratedSnapshot);
  expect(deliveredPreferences(platform)).toHaveLength(deliveryCount);
  expect(platform === 'native' ? screen.getByTestId('native-scene-document') : screen.UNSAFE_root.findByProps({ title: '3D Home simulation' })).toBe(document);
  expect(mockSaveChromePreference).not.toHaveBeenCalled();
  screen.unmount();
  useHomeStore.setState(originalState);
});

test.each(['native', 'web'] as const)('%s publishes the current unit after delayed initial hydration without repeated snapshot echoes', async (platform) => {
  const originalState = useHomeStore.getState();
  useHomeStore.setState({ profile: { ...originalState.profile, tempUnit: 'F' } });
  mockCanNavigate.mockReturnValue(false);
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const screen = render(<Component onStatus={jest.fn()} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  act(() => sendChrome(platform, { channel: 'vantahome-scene', version: 1, status: 'ready' }));
  expect(deliveredPreferences(platform)).toHaveLength(0);
  mockCanNavigate.mockReturnValue(true);
  act(deliverHydratedSnapshot);
  expect(deliveredPreferences(platform)).toHaveLength(1);
  expect(deliveredPreferences(platform)[0]).toContain('"tempUnit":"F"');
  act(deliverHydratedSnapshot);
  expect(deliveredPreferences(platform)).toHaveLength(1);
  mockCanNavigate.mockReturnValue(false);
  act(deliverHydratedSnapshot);
  expect(deliveredPreferences(platform)).toHaveLength(1);
  screen.unmount();
  useHomeStore.setState(originalState);
});

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


test('native readiness ignores messages from a replaced document', async () => {
  const onStatus = jest.fn();
  render(<NativeSceneSurface onStatus={onStatus} />);
  await act(async () => { await Promise.resolve(); });
  const data = JSON.stringify({ channel: 'vantahome-scene', version: 1, status: 'ready' });
  act(() => { mockNativeMessage({ nativeEvent: { data, url: 'file:///cache/old.html' } }); });
  expect(onStatus).not.toHaveBeenCalled();
  act(() => { mockNativeMessage({ nativeEvent: { data, url: 'file:///cache/index.html' } }); });
  expect(onStatus).toHaveBeenCalledWith('ready');
});

test.each(['native', 'web'] as const)('%s edit navigation requires the current document and a live, unsuspended session', async (platform) => {
  const deviceId = 'placed-00000000-0000-4000-8000-000000000001';
  replaceRuntimeDevices([{ id: deviceId, name: 'Reading light', placement: createDefaultDevicePlacement('master-bedside-left', 'living')! }]);
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onDeviceEdit = jest.fn();
  const onStatus = jest.fn();
  const screen = render(<Component onStatus={onStatus} onDeviceEdit={onDeviceEdit} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  const message = { channel: 'vantahome-navigation', version: 1, type: 'device-edit', deviceId };
  act(() => sendChrome(platform, message, false));
  act(() => sendChrome(platform, { ...message, deviceId: 'living-light' }));
  act(() => sendChrome(platform, { ...message, deviceId: 'placed-00000000-0000-4000-8000-000000000099' }));
  act(() => sendChrome(platform, { ...message, placement: { position: [0, 0, 0] } }));
  expect(onDeviceEdit).not.toHaveBeenCalled();
  act(() => sendChrome(platform, message));
  expect(onDeviceEdit).toHaveBeenCalledWith(deviceId);
  expect(onDeviceEdit).toHaveBeenCalledTimes(1);

  screen.rerender(<Component suspended onStatus={onStatus} onDeviceEdit={onDeviceEdit} />);
  act(() => sendChrome(platform, message));
  screen.rerender(<Component onStatus={onStatus} onDeviceEdit={onDeviceEdit} />);
  mockCanNavigate.mockReturnValue(false);
  act(() => sendChrome(platform, message));
  mockSession.current = null;
  act(() => sendChrome(platform, message));
  expect(onDeviceEdit).toHaveBeenCalledTimes(1);
  mockSession.current = { handleMessage: jest.fn(), canNavigate: mockCanNavigate };
  mockCanNavigate.mockReturnValue(true);
  replaceRuntimeDevices([]);
  act(() => sendChrome(platform, message));
  expect(onDeviceEdit).toHaveBeenCalledTimes(1);
  screen.unmount();
});

/** Count only the dedicated display protocol so state synchronization cannot satisfy these checks. */
function deliveredPreviews(platform: 'native' | 'web'): number {
  return platform === 'native'
    ? mockInjectJavaScript.mock.calls.filter(([script]: [string]) => script.includes(`CustomEvent('${SCENE_PREVIEW_CHANNEL}'`)).length
    : mockFrameWindow.postMessage.mock.calls.filter(([message]) => message.channel === SCENE_PREVIEW_CHANNEL).length;
}

/** Build a safe display request without any simulation command or saved-scene action. */
function previewIntent(id: number): ScenePreviewCommand {
  return scenePreviewCommandMessage(id, { title: 'Living room evening', expiresAt: Date.now() + 60_000,
    actions: [{ deviceId: 'living-light', values: { brightness: 25 }, baseline: { brightness: 31 } }] });
}

test.each(['native', 'web'] as const)('%s delivers preview intents once and never replays after readiness, resume, reload or restored grants', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onStatus = jest.fn();
  let intent = previewIntent(1);
  const screen = render(<Component onStatus={onStatus} previewCommand={intent} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  act(() => sendChrome(platform, { channel: 'vantahome-scene', version: 1, status: 'ready' }));
  screen.rerender(<Component onStatus={onStatus} previewCommand={{ ...intent }} />);
  expect(deliveredPreviews(platform)).toBe(0);

  intent = previewIntent(2);
  screen.rerender(<Component onStatus={onStatus} previewCommand={intent} />);
  screen.rerender(<Component onStatus={onStatus} previewCommand={{ ...intent }} />);
  expect(deliveredPreviews(platform)).toBe(1);

  intent = previewIntent(3);
  screen.rerender(<Component suspended onStatus={onStatus} previewCommand={intent} />);
  screen.rerender(<Component onStatus={onStatus} previewCommand={{ ...intent }} />);
  expect(deliveredPreviews(platform)).toBe(1);
  intent = scenePreviewCommandMessage(4, null);
  screen.rerender(<Component suspended onStatus={onStatus} previewCommand={intent} />);
  expect(deliveredPreviews(platform)).toBe(2);

  act(() => sendChrome(platform, { channel: 'vantahome-scene', version: 1, status: 'error' }));
  intent = previewIntent(5);
  screen.rerender(<Component onStatus={onStatus} previewCommand={intent} />);
  act(() => sendChrome(platform, { channel: 'vantahome-scene', version: 1, status: 'ready' }));
  screen.rerender(<Component onStatus={onStatus} previewCommand={{ ...intent }} />);
  expect(deliveredPreviews(platform)).toBe(2);

  mockCanNavigate.mockReturnValue(false);
  intent = previewIntent(6);
  screen.rerender(<Component onStatus={onStatus} previewCommand={intent} />);
  mockCanNavigate.mockReturnValue(true);
  screen.rerender(<Component onStatus={onStatus} previewCommand={{ ...intent }} />);
  expect(deliveredPreviews(platform)).toBe(2);
  screen.rerender(<Component onStatus={onStatus} previewCommand={previewIntent(7)} />);
  expect(deliveredPreviews(platform)).toBe(3);
  expect(mockSaveChromePreference).not.toHaveBeenCalled();
  expect(mockSession.current?.handleMessage).not.toHaveBeenCalled();
  screen.unmount();
});

test.each(['native', 'web'] as const)('%s routes valid preview reports only from its current document and live grants without sending device commands', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onPreviewReport = jest.fn();
  const onStatus = jest.fn();
  const screen = render(<Component onStatus={onStatus} onPreviewReport={onPreviewReport} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  const status: ScenePreviewReport = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'status', id: 1, status: 'active' };
  const selection: ScenePreviewReport = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'selection', modelRoomId: 'living' };
  const beforeState = useHomeStore.getState();
  act(() => { sendChrome(platform, status, false); sendChrome(platform, selection, false); });
  act(() => sendChrome(platform, { ...status, status: 'executed' }));
  act(() => sendChrome(platform, { ...status, deviceId: 'living-light' }));
  act(() => sendChrome(platform, { ...selection, modelRoomId: 'not-a-room' }));
  expect(onPreviewReport).not.toHaveBeenCalled();
  mockSession.current!.handleMessage.mockClear();

  act(() => { sendChrome(platform, status); sendChrome(platform, selection); });
  expect(onPreviewReport.mock.calls).toEqual([[status], [selection]]);
  expect(mockSession.current?.handleMessage).not.toHaveBeenCalled();
  expect(mockSaveChromePreference).not.toHaveBeenCalled();
  expect(useHomeStore.getState()).toBe(beforeState);

  // A covered renderer may acknowledge that its previous display preview has ended.
  screen.rerender(<Component suspended onStatus={onStatus} onPreviewReport={onPreviewReport} />);
  const closed = { ...status, status: 'closed' };
  act(() => sendChrome(platform, closed));
  expect(onPreviewReport).toHaveBeenLastCalledWith(closed);
  mockCanNavigate.mockReturnValue(false);
  act(() => { sendChrome(platform, status); sendChrome(platform, selection); });
  mockSession.current = null;
  act(() => sendChrome(platform, status));
  expect(onPreviewReport).toHaveBeenCalledTimes(3);
  screen.unmount();
});

test('native preview reports reject missing, stale and lookalike document URLs but accept the current fragment', async () => {
  const onPreviewReport = jest.fn();
  const screen = render(<NativeSceneSurface onStatus={jest.fn()} onPreviewReport={onPreviewReport} />);
  await act(async () => { await Promise.resolve(); });
  const report = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'status', id: 1, status: 'closed' };
  const data = JSON.stringify(report);
  for (const url of [undefined, 'about:blank', 'file:///cache/old.html', 'file:///cache/index.html?other', 'file:///cache/index.html.other']) {
    act(() => mockNativeMessage({ nativeEvent: { data, url } }));
  }
  expect(onPreviewReport).not.toHaveBeenCalled();
  act(() => mockNativeMessage({ nativeEvent: { data, url: 'file:///cache/index.html#property' } }));
  expect(onPreviewReport).toHaveBeenCalledTimes(1);
  expect(onPreviewReport).toHaveBeenCalledWith(report);
  screen.unmount();
});

test('web preview reports follow the current frame window rather than an origin string or a replaced frame', () => {
  const onPreviewReport = jest.fn();
  const frameNode = { contentWindow: mockFrameWindow };
  const screen = render(<WebSceneSurface onStatus={jest.fn()} onPreviewReport={onPreviewReport} />, {
    createNodeMock: (element) => element.type === 'iframe' ? frameNode : null,
  });
  const report = { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'selection', modelRoomId: null };
  act(() => mockWebMessage({ source: {}, origin: 'http://127.0.0.1:5187', data: report } as MessageEvent<unknown>));
  expect(onPreviewReport).not.toHaveBeenCalled();
  const newFrameWindow = { postMessage: jest.fn() };
  frameNode.contentWindow = newFrameWindow;
  act(() => sendChrome('web', report));
  expect(onPreviewReport).not.toHaveBeenCalled();
  act(() => mockWebMessage({ source: newFrameWindow, origin: 'null', data: report } as unknown as MessageEvent<unknown>));
  expect(onPreviewReport).toHaveBeenCalledTimes(1);
  expect(onPreviewReport).toHaveBeenCalledWith(report);
  screen.unmount();
});

test.each(['native', 'web'] as const)('%s camera Watch checks document ownership, foreground and current session', async (platform) => {
  const Component = platform === 'native' ? NativeSceneSurface : WebSceneSurface;
  const onCameraWatch = jest.fn();
  const onStatus = jest.fn();
  const request = { channel: 'vantahome-navigation', version: 1, type: 'camera-watch', deviceId: 'entry-camera' };
  const screen = render(<Component onStatus={onStatus} onCameraWatch={onCameraWatch} />, {
    createNodeMock: (element) => element.type === 'iframe' ? { contentWindow: mockFrameWindow } : null,
  });
  await act(async () => { await Promise.resolve(); });
  /** The exact current scene document is the only allowed sender. */
  function send(owned = true): void {
    if (platform === 'native') mockNativeMessage({ nativeEvent: { data: JSON.stringify(request), url: owned ? 'file:///cache/index.html' : 'about:blank' } });
    else mockWebMessage({ source: owned ? mockFrameWindow : {}, data: request } as unknown as MessageEvent<unknown>);
  }
  act(() => send(false));
  expect(onCameraWatch).not.toHaveBeenCalled();
  act(() => send());
  expect(onCameraWatch).toHaveBeenCalledWith('entry-camera');
  screen.rerender(<Component suspended onStatus={onStatus} onCameraWatch={onCameraWatch} />);
  act(() => send());
  expect(onCameraWatch).toHaveBeenCalledTimes(1);
  screen.rerender(<Component onStatus={onStatus} onCameraWatch={onCameraWatch} />);
  mockCanNavigate.mockReturnValue(false);
  act(() => send());
  expect(onCameraWatch).toHaveBeenCalledTimes(1);
});
