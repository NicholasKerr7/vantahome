import React from 'react';
import { act, render } from '@testing-library/react-native';
import NativeSceneSurface from '../SceneSurface';
import WebSceneSurface from '../SceneSurface.web';

type NativeMessage = { nativeEvent: { data: string } };
let mockNativeMessage: (event: NativeMessage) => void;
let mockWebMessage: (event: MessageEvent<unknown>) => void;
const mockCanNavigate = jest.fn();
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
jest.mock('../nativeWeather', () => ({ NativeWeatherBroker: class { dispose() {} handleMessage() {} }, nativeWeatherResponseScript: () => '' }));
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: React.forwardRef(({ onMessage }: { onMessage: (event: NativeMessage) => void }, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: jest.fn() }));
    mockNativeMessage = onMessage;
    return <View testID="native-scene-document" />;
  }) };
});

beforeEach(() => {
  mockCanNavigate.mockReturnValue(true);
  mockSession.current = { handleMessage: jest.fn(), canNavigate: mockCanNavigate };
  window.addEventListener = jest.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
    mockWebMessage = listener as (event: MessageEvent<unknown>) => void;
  }) as typeof window.addEventListener;
  window.removeEventListener = jest.fn();
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
