import React from 'react';
import { act, render } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/AppNavigator';
import { useHomeStore } from '../../../store/useHomeStore';
import CameraViewerScreen from '../../../screens/CameraViewerScreen';
import CamerasScreen from '../../../screens/CamerasScreen';

jest.mock('../CameraCenterScreen', () => {
  const { Text } = require('react-native');
  return { CameraCenterScreen: ({ focusedDeviceId }: { focusedDeviceId?: string }) => <Text>{focusedDeviceId ? `Simulation viewer: ${focusedDeviceId}` : 'Camera Center'}</Text> };
});
jest.mock('../../../screens/ConfiguredCamerasScreen', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>Configured cameras</Text> };
});
jest.mock('../../../screens/ConfiguredCameraViewerScreen', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ route }: { route: { params: { deviceId: string } } }) => <Text>Configured viewer: {route.params.deviceId}</Text> };
});
const initial = useHomeStore.getState();
const navigation = { dispatch: jest.fn(), navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true } as unknown as NativeStackScreenProps<RootStackParamList, 'CameraViewer'>['navigation'];

/** Use real authorization and binding selectors with one physical and one simulated camera. */
function seedMixedCameras(): void {
  useHomeStore.setState({ ...initial, accountUserId: 'owner', authenticatedUserId: 'owner', activeMemberId: 'owner',
    accountHomeId: 'home', activeHomeId: 'home', membershipReady: true, authTaskBlockingHome: false, modelCatalogVersion: 1,
    household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }], memberPermissionOverrides: [], roomMembers: [],
    rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [
      { id: 'physical-camera', name: 'Real camera', roomId: 'grounds', kind: 'camera', isOn: true, streamUrl: 'https://example.com/camera.m3u8' },
      { id: 'virtual-camera', name: 'Simulation camera', roomId: 'grounds', kind: 'camera', isOn: true, modelDeviceId: 'entry-camera', simulationOnly: true },
    ], realtime: { ...initial.realtime, enabled: false, useMqtt: false },
  });
}
/** Exercise the public route wrapper while leaving each destination's independent protection tests intact. */
function viewer(id: string) { return <CameraViewerScreen navigation={navigation} route={{ key: 'viewer', name: 'CameraViewer', params: { deviceId: id } }} />; }
/** Exercise the overview wrapper with the same verified store as the viewer. */
function overview() { return <CamerasScreen navigation={navigation as unknown as NativeStackScreenProps<RootStackParamList, 'Cameras'>['navigation']} route={{ key: 'cameras', name: 'Cameras' }} />; }

beforeEach(seedMixedCameras);
afterEach(() => { useHomeStore.setState(initial, true); jest.useRealTimers(); });

test('mixed catalogs keep an existing physical camera on the configured viewer', () => {
  const screen = render(viewer('physical-camera'));
  expect(screen.getByText('Configured viewer: physical-camera')).toBeTruthy();
  expect(screen.queryByText(/Simulation viewer/)).toBeNull();
  screen.rerender(viewer('virtual-camera'));
  expect(screen.getByText('Simulation viewer: virtual-camera')).toBeTruthy();
});

test('a physical camera without a URL still stays on its existing setup path', () => {
  useHomeStore.setState({ devices: useHomeStore.getState().devices.map((device) => device.id === 'physical-camera' ? { ...device, streamUrl: undefined } : device) });
  const screen = render(viewer('physical-camera'));
  expect(screen.getByText('Configured viewer: physical-camera')).toBeTruthy();
});

test.each(['living-light', 'unknown-camera'])('a raw simulation flag cannot claim an invalid binding to %s', (modelDeviceId) => {
  useHomeStore.setState({ devices: useHomeStore.getState().devices.map((device) => device.id === 'virtual-camera' ? { ...device, modelDeviceId } : device) });
  const screen = render(viewer('virtual-camera'));
  expect(screen.getByText('Configured viewer: virtual-camera')).toBeTruthy();
  expect(screen.queryByText(/Simulation viewer/)).toBeNull();
});

test('a simulated camera in the wrong authored room cannot use a model binding', () => {
  useHomeStore.setState({
    rooms: [{ id: 'living', name: 'Living room', modelRoomId: 'living' }],
    devices: useHomeStore.getState().devices.map((device) => device.id === 'virtual-camera' ? { ...device, roomId: 'living' } : device),
  });
  const screen = render(viewer('virtual-camera'));
  expect(screen.getByText('Configured viewer: virtual-camera')).toBeTruthy();
  expect(screen.queryByText(/Simulation viewer/)).toBeNull();
});

test('membership verification loss removes the configured viewer instead of opening an unverified fallback', () => {
  const screen = render(viewer('physical-camera'));
  expect(screen.getByText('Configured viewer: physical-camera')).toBeTruthy();
  act(() => { useHomeStore.setState({ membershipReady: false }); });
  expect(screen.queryByText(/Configured viewer/)).toBeNull();
  // CameraCenter independently shows its access-denied state without media or private content.
  expect(screen.getByText('Simulation viewer: physical-camera')).toBeTruthy();
});

test('a target outside the current camera grant cannot enter the configured viewer', () => {
  useHomeStore.setState({ household: [{ id: 'owner', name: 'Member', role: 'Member', status: 'home' }],
    memberPermissionOverrides: [{ memberId: 'owner', permission: 'camera.live', allowed: false }] });
  const screen = render(viewer('physical-camera'));
  expect(screen.queryByText(/Configured viewer/)).toBeNull();
  expect(screen.getByText('Simulation viewer: physical-camera')).toBeTruthy();
});

test('the overview retains an authorized physical catalog and guards it immediately when verification is lost', () => {
  useHomeStore.setState({ devices: useHomeStore.getState().devices.filter((device) => device.id === 'physical-camera') });
  const screen = render(overview());
  expect(screen.getByText('Configured cameras')).toBeTruthy();
  act(() => { useHomeStore.setState({ membershipReady: false }); });
  expect(screen.queryByText('Configured cameras')).toBeNull();
  expect(screen.getByText('Camera Center')).toBeTruthy();
});

test.each(['viewer', 'overview'])('Guest expiry closes the physical %s without unrelated store changes', (route) => {
  jest.useFakeTimers();
  useHomeStore.setState({
    household: [{ id: 'owner', name: 'Guest', role: 'Guest', status: 'home', accessExpiresAt: new Date(Date.now() + 5000).toISOString() }],
    roomMembers: [{ memberId: 'owner', roomIds: ['grounds'] }],
    memberPermissionOverrides: [{ memberId: 'owner', permission: 'camera.live', allowed: true }],
    devices: useHomeStore.getState().devices.filter((device) => device.id === 'physical-camera'),
  });
  const screen = render(route === 'viewer' ? viewer('physical-camera') : overview());
  expect(screen.getByText(route === 'viewer' ? 'Configured viewer: physical-camera' : 'Configured cameras')).toBeTruthy();
  const before = useHomeStore.getState();
  act(() => { jest.advanceTimersByTime(5001); });
  expect(screen.queryByText(/Configured/)).toBeNull();
  expect(useHomeStore.getState()).toBe(before);
});

test('a deleted or unknown target stays on the guarded camera path', () => {
  const screen = render(viewer('unknown-camera'));
  expect(screen.queryByText(/Configured viewer/)).toBeNull();
  expect(screen.getByText('Simulation viewer: unknown-camera')).toBeTruthy();
});
