import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/AppNavigator';
import { CameraCenterScreen } from '../CameraCenterScreen';

let mockCanView = true;
let mockCanViewActivity = true;
let mockProtection = 'granted';
let mockFocused = true;
let mockIdentity = 'owner-home';
let mockAccessIdentity = 'camera-grant';
let mockSimulationError: string | null = null;
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockRetry = jest.fn();
const mockToggleFavorite = jest.fn();
const mockOpenCamera = jest.fn();
const mockOpenCenter = jest.fn();
const mockLocateCamera = jest.fn();
const mockCamera = { id: 'registry-camera', modelDeviceId: 'entry-camera', name: 'Entry camera', roomName: 'Grounds', status: 'demo' };
const mockUseCameraCenter = jest.fn((active: boolean) => ({
  cameras: active ? [mockCamera] : [], events: [], ready: true, preferencesReady: true,
  canView: mockCanView,
  simulationError: mockSimulationError, retrySimulation: mockRetry,
  preferenceError: null, retryPreferences: mockRetry, canViewActivity: mockCanViewActivity,
  toggleFavorite: mockToggleFavorite,
}));

jest.mock('../../../store/useHomeStore', () => ({
  useHomeStore: Object.assign((selector: (state: object) => unknown) => selector({}), { getState: () => ({}) }),
}));
jest.mock('../../three-d-home/modelSceneAccess', () => ({ modelSimulationIdentity: () => mockIdentity }));
jest.mock('../../three-d-home/useControllerFocused', () => ({ useControllerFocused: () => mockFocused }));
jest.mock('../../../security/useProtectedAccess', () => ({
  useProtectedAccess: () => ({ state: mockProtection, retry: mockRetry }),
}));
jest.mock('../useCameraCenter', () => ({
  useCameraCenter: (active: boolean) => mockUseCameraCenter(active),
  useCameraCenterAccess: () => ({ access: { identityKey: mockAccessIdentity } }),
}));
jest.mock('../cameraCenterModel', () => ({
  getCameraCenterAccess: () => ({ canView: mockCanView, devices: mockCanView ? [mockCamera] : [] }),
}));
jest.mock('../cameraNavigation', () => ({
  openCameraViewer: (...args: unknown[]) => mockOpenCamera(...args),
  openCameraCenter: (...args: unknown[]) => mockOpenCenter(...args),
  locateCameraInHome: (...args: unknown[]) => mockLocateCamera(...args),
}));
jest.mock('../../../components/CinematicSurface', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../center/CameraCenterView', () => {
  const { Text, Pressable, View } = require('react-native');
  return { CameraCenterEmpty: ({ title }: { title: string }) => <Text>{title}</Text>, CameraCenterView: (props: {
    cameras: typeof mockCamera[]; selectedCameraId: string | null; section: string;
    onControls: (id: string) => void; onOpenCamera: (id: string) => void; onLocate?: (id: string) => void;
    onAllCameras?: () => void; onSectionChange: (id: string) => void;
  }) => <View testID="camera-center-view">
    <Text>{props.cameras.length ? 'Authorized sample image' : 'No camera available'}</Text>
    <Text>{props.section}</Text>
    <Pressable accessibilityLabel="Controls" onPress={() => props.onControls('registry-camera')} />
    <Pressable accessibilityLabel="Watch" onPress={() => props.onOpenCamera('registry-camera')} />
    <Pressable accessibilityLabel="Locate" onPress={() => props.onLocate?.('registry-camera')} />
    <Pressable accessibilityLabel="Activity" onPress={() => props.onSectionChange('activity')} />
    <Pressable accessibilityLabel="All cameras" onPress={props.onAllCameras} />
  </View> };
});

const navigation = {
  navigate: mockNavigate, dispatch: mockDispatch, canGoBack: () => true, goBack: jest.fn(),
} as unknown as NativeStackNavigationProp<RootStackParamList>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanView = true;
  mockCanViewActivity = true;
  mockProtection = 'granted';
  mockFocused = true;
  mockIdentity = 'owner-home';
  mockAccessIdentity = 'camera-grant';
  mockSimulationError = null;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(() => jest.restoreAllMocks());

test('requires camera permission and protected access before presenting any sample', () => {
  mockProtection = 'denied';
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  expect(screen.queryByText('Authorized sample image')).toBeNull();
  fireEvent.press(screen.getByLabelText('Try again'));
  expect(mockRetry).toHaveBeenCalledTimes(1);
  mockProtection = 'granted';
  mockCanView = false;
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.getByText('Camera access unavailable')).toBeTruthy();
  expect(screen.queryByTestId('camera-center-view')).toBeNull();
});

test('Watch, Locate and Controls keep the same registry identity and guard stale controls', () => {
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  fireEvent.press(screen.getByLabelText('Watch'));
  expect(mockOpenCamera).toHaveBeenCalledWith(mockDispatch, 'registry-camera');
  fireEvent.press(screen.getByLabelText('Locate'));
  expect(mockLocateCamera).toHaveBeenCalledWith(mockDispatch, 'registry-camera');
  fireEvent.press(screen.getByLabelText('Controls'));
  expect(mockNavigate).toHaveBeenCalledWith('DeviceDetail', { deviceId: 'registry-camera' });
  mockCanView = false;
  fireEvent.press(screen.getByLabelText('Controls'));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
});

test('an unauthorized focused ID never substitutes another camera', () => {
  const screen = render(<CameraCenterScreen navigation={navigation} focusedDeviceId="removed-camera" />);
  expect(screen.getByText('No camera available')).toBeTruthy();
  expect(screen.queryByText('Authorized sample image')).toBeNull();
  fireEvent.press(screen.getByLabelText('All cameras'));
  expect(mockOpenCenter).toHaveBeenCalledWith(mockDispatch);
});

test('history revocation removes Activity immediately without losing live-view access', () => {
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  fireEvent.press(screen.getByLabelText('Activity'));
  expect(screen.getByText('activity')).toBeTruthy();
  mockCanViewActivity = false;
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.queryByText('activity')).toBeNull();
  expect(screen.getByText('Authorized sample image')).toBeTruthy();
});

test('blur and app inactivity hide content; background unmounts the protected session', () => {
  let notify: (state: AppStateStatus) => void = () => undefined;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, listener) => {
    notify = listener;
    return { remove: jest.fn() };
  });
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  mockFocused = false;
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.queryByText('Authorized sample image')).toBeNull();
  mockFocused = true;
  act(() => notify('inactive'));
  expect(screen.queryByText('Authorized sample image')).toBeNull();
  act(() => notify('background'));
  expect(screen.getByTestId('camera-center-background')).toBeTruthy();
  mockProtection = 'checking';
  act(() => notify('active'));
  expect(screen.getByText('Confirming camera access')).toBeTruthy();
  screen.unmount();
  subscription.mockRestore();
});

test('identity changes remount local selection and section state', () => {
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  fireEvent.press(screen.getByLabelText('Activity'));
  mockIdentity = 'different-person-home';
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.getByText('cameras')).toBeTruthy();
  expect(screen.queryByText('activity')).toBeNull();
});


test('changed camera grants remount the protected session and clear its previous section', () => {
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  fireEvent.press(screen.getByLabelText('Activity'));
  mockCanView = false;
  mockAccessIdentity = 'revoked';
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.queryByTestId('camera-center-view')).toBeNull();
  mockCanView = true;
  mockAccessIdentity = 'renewed-grant';
  mockProtection = 'checking';
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.getByText('Confirming camera access')).toBeTruthy();
  mockProtection = 'granted';
  screen.rerender(<CameraCenterScreen navigation={navigation} />);
  expect(screen.getByText('cameras')).toBeTruthy();
  expect(screen.queryByText('activity')).toBeNull();
});

test('unavailable canonical state offers recovery without presenting illustrative device state', () => {
  mockSimulationError = 'Saved camera previews are unavailable.';
  const screen = render(<CameraCenterScreen navigation={navigation} />);
  expect(screen.getByText('Camera preview unavailable')).toBeTruthy();
  expect(screen.queryByTestId('camera-center-view')).toBeNull();
  fireEvent.press(screen.getByLabelText('Retry camera preview'));
  expect(mockRetry).toHaveBeenCalledTimes(1);
});
