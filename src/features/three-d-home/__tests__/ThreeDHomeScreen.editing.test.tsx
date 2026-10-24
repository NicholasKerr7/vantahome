jest.mock('../../home-voice/useForegroundAssistantVoice', () => ({ useForegroundAssistantVoice: () => ({ enabled: false, stop: jest.fn() }) }));
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createDefaultDevicePlacement } from '../../../../packages/home-scene/src/devicePlacement';
import { useHomeStore } from '../../../store/useHomeStore';
import ThreeDHomeScreen from '../../../screens/ThreeDHomeScreen';
import type { SceneSurfaceProps } from '../protocol';
import { locateCameraInHome } from '../../cameras/cameraNavigation';

let mockFocused = true;
let mockSceneProps: SceneSurfaceProps;
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
// Jest does not execute Metro's dynamic-import transform; exercise the panel boundary with its explicit test component.
jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  return { ...actual, lazy: (loader: () => unknown) => loader.toString().includes('SimulationDeviceEditor')
    ? require('../../devices/SimulationDeviceEditor').default : actual.lazy(loader as Parameters<typeof actual.lazy>[0]) };
});
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch }), useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../SceneSurface', () => ({ __esModule: true, default: (props: SceneSurfaceProps) => {
  mockSceneProps = props;
  return require('react').createElement(require('react-native').Text, { testID: 'scene' }, 'Property');
} }));
jest.mock('../../devices/SimulationDeviceEditor', () => ({ __esModule: true, default: ({ deviceId, onClose, onSaved, savedActionLabel }: {
  deviceId: string; onClose: () => void; onSaved: (id: string) => void; savedActionLabel: string;
}) => {
  const { View, Text, Pressable } = require('react-native');
  return <View testID="editor"><Text>{deviceId}</Text><Pressable accessibilityLabel="Cancel edit" onPress={onClose} />
    <Pressable accessibilityLabel={savedActionLabel} onPress={() => onSaved(deviceId)} /></View>;
} }));
const seed = useHomeStore.getState();
const originalAppState = AppState.currentState;
const deviceId = '33333333-3333-4333-8333-333333333333';
const modelDeviceId = `placed-${deviceId}`;
beforeEach(() => {
  jest.useFakeTimers(); mockFocused = true; AppState.currentState = 'active'; mockNavigate.mockClear(); mockDispatch.mockClear();
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    authTaskBlockingHome: false, activeMemberId: 'person', household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'room', name: 'Living room', modelRoomId: 'living' }],
    devices: [{ id: deviceId, modelDeviceId, name: 'Reading lamp', roomId: 'room', kind: 'light', isOn: true, brightness: 68,
      simulationOnly: true, modelRevision: 0, modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living')! }],
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
  });
});
afterEach(() => { useHomeStore.setState(seed, true); AppState.currentState = originalAppState; jest.useRealTimers(); });

/** Flush React.lazy while preserving controlled renderer readiness. */
async function requestEditor(id = modelDeviceId): Promise<void> {
  await act(async () => { mockSceneProps.onDeviceEdit?.(id); await Promise.resolve(); });
}

test('opens a verified saved device, pauses the same property and returns without resetting settings or camera', async () => {
  const screen = render(<ThreeDHomeScreen />);
  await requestEditor();
  expect(screen.queryByTestId('editor')).toBeNull();
  act(() => mockSceneProps.onStatus('ready'));
  const property = screen.getByTestId('scene');
  await requestEditor('family-tv');
  expect(screen.queryByTestId('editor')).toBeNull();
  await requestEditor();
  expect(screen.getByText(deviceId)).toBeTruthy();
  expect(mockSceneProps.suspended).toBe(true);
  fireEvent.press(screen.getByLabelText('Cancel edit'));
  expect(screen.queryByTestId('editor')).toBeNull();
  expect(mockSceneProps.suspended).toBe(false);
  expect(screen.getByTestId('scene')).toBe(property);
  await requestEditor();
  fireEvent.press(screen.getByLabelText('Back to 3D Home'));
  expect(screen.getByTestId('scene')).toBe(property);
  expect(useHomeStore.getState().devices[0]).toMatchObject({ id: deviceId, isOn: true, brightness: 68 });
});

test('revocation closes an active editor and a guest cannot reopen it', async () => {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockSceneProps.onStatus('ready'));
  await requestEditor();
  expect(screen.getByTestId('editor')).toBeTruthy();
  await act(async () => { useHomeStore.setState({ household: [{ id: 'person', name: 'Guest', role: 'Guest', status: 'home' }] }); });
  expect(screen.queryByTestId('editor')).toBeNull();
  await requestEditor();
  expect(screen.queryByTestId('editor')).toBeNull();
});

test('ignores a stale renderer request after the current property is replaced', async () => {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockSceneProps.onStatus('ready'));
  const stale = mockSceneProps.onDeviceEdit;
  act(() => mockSceneProps.onStatus('error'));
  fireEvent.press(screen.getByLabelText('Retry 3D Home'));
  act(() => mockSceneProps.onStatus('ready'));
  await act(async () => { stale?.(modelDeviceId); });
  expect(screen.queryByTestId('editor')).toBeNull();
  await requestEditor();
  expect(screen.getByTestId('editor')).toBeTruthy();
  mockFocused = false;
  screen.rerender(<ThreeDHomeScreen />);
  expect(screen.queryByTestId('editor')).toBeNull();
  mockFocused = true;
  screen.rerender(<ThreeDHomeScreen />);
  expect(screen.queryByTestId('editor')).toBeNull();
});

test('camera Watch opens only the current authorized model binding and performs no commands', async () => {
  useHomeStore.setState({ rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [{ id: 'camera-one', modelDeviceId: 'entry-camera', name: 'Entry', roomId: 'grounds', kind: 'camera', isOn: true, simulationOnly: true }] });
  const screen = render(<ThreeDHomeScreen />);
  const devices = useHomeStore.getState().devices;
  act(() => mockSceneProps.onCameraWatch?.('entry-camera'));
  expect(mockDispatch).not.toHaveBeenCalled();
  act(() => mockSceneProps.onStatus('ready'));
  const property = screen.getByTestId('scene');
  act(() => mockSceneProps.onCameraWatch?.('entry-camera'));
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { name: 'CameraViewer', params: { deviceId: 'camera-one' }, pop: true } }));
  expect(useHomeStore.getState().devices).toBe(devices);
  expect(screen.getByTestId('scene')).toBe(property);
  mockFocused = false;
  screen.rerender(<ThreeDHomeScreen />);
  act(() => mockSceneProps.onCameraWatch?.('entry-camera'));
  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().devices).toBe(devices);
});


test('Locate waits for ready chrome, reuses the retained renderer and consumes its intent once', () => {
  useHomeStore.setState({ rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [{ id: 'camera-one', modelDeviceId: 'entry-camera', name: 'Entry', roomId: 'grounds', kind: 'camera', isOn: true, simulationOnly: true }] });
  const dispatch = jest.fn();
  expect(locateCameraInHome(dispatch, 'camera-one')).toBe(true);
  const token = dispatch.mock.calls[0][0].payload.params.params.cameraLocationToken as string;
  const route = { key: 'home', name: 'Home' as const, params: { cameraLocationToken: token } };
  const screen = render(<ThreeDHomeScreen route={route} />);
  const property = screen.getByTestId('scene');
  act(() => mockSceneProps.onStatus('ready'));
  expect(mockSceneProps.chromeCommand).toBeUndefined();
  act(() => mockSceneProps.onChromeSnapshot?.({ locationName: 'Home', localTime: '10:00 AM', tempC: 23, weatherCode: 0,
    weatherStatus: 'live', isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: false, preferenceError: false }));
  expect(mockSceneProps.chromeCommand?.command).toEqual({ type: 'locate-camera', deviceId: 'entry-camera' });
  const id = mockSceneProps.chromeCommand?.id;
  screen.rerender(<ThreeDHomeScreen route={route} />);
  expect(mockSceneProps.chromeCommand?.id).toBe(id);
  expect(screen.getByTestId('scene')).toBe(property);
});
