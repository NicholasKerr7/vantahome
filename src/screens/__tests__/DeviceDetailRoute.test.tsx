import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../packages/home-scene/src/data';
import { DeviceControlsSheet } from '../../features/three-d-home/DeviceControlsSheet';
import { SimulationControlClient } from '../../features/three-d-home/simulationControlClient';
import { useHomeStore, type Device } from '../../store/useHomeStore';
import DeviceDetailRoute from '../DeviceDetailRoute';

jest.mock('../../config/runtimeMode', () => ({ runtimePolicy: { mode: 'demo', allowUnauthenticatedDemo: true } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../../components/CinematicSurface', () => ({ __esModule: true, default: require('react-native').View }));
jest.mock('../DeviceDetailScreen', () => ({ __esModule: true, default: () => require('react').createElement(require('react-native').Text, null, 'Native device controls') }));
jest.mock('../../features/three-d-home/DeviceControlsSheet', () => ({ DeviceControlsSheet: jest.fn(() => require('react').createElement(require('react-native').Text, null, 'House inspector')) }));
const mockClient = new SimulationControlClient();
jest.mock('../../features/three-d-home/useSimulationControls', () => ({ useSimulationControls: () => ({ ...mockClient.getSnapshot(), client: mockClient }) }));
const seed = useHomeStore.getState();

/** Build a native catalog record using the manifest's canonical identity and room. */
function catalogDevice(id: string): Device {
  const device = getDevice(id)!;
  return { id, kind: device.kind, name: device.name, roomId: device.roomId, isOn: false };
}

/** Inspect only the shared sheet's public contract. */
function sheetProps() {
  const calls = (DeviceControlsSheet as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as React.ComponentProps<typeof DeviceControlsSheet>;
}

beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState({ ...seed, modelCatalogVersion: 1, accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
    household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }], activeMemberId: 'owner', memberPermissionOverrides: [],
    rooms: [{ id: 'living', name: 'Living room' }, { id: 'entry', name: 'Entry' }], devices: [catalogDevice('living-light'), catalogDevice('entry-camera')],
  });
});
afterEach(() => useHomeStore.setState(seed));

/** Mount the real route gate with a small navigation spy. */
function renderRoute(deviceId: string) {
  const navigation = { goBack: jest.fn(), setParams: jest.fn() };
  return { ...render(<DeviceDetailRoute navigation={navigation as never} route={{ key: 'detail', name: 'DeviceDetail', params: { deviceId } }} />), navigation };
}

test('opens the shared house inspector and preserves close and per-device browsing', () => {
  const screen = renderRoute('living-light');
  expect(screen.getByText('House inspector')).toBeTruthy();
  expect(sheetProps().allowedDeviceIds).toEqual(['living-light', 'entry-camera']);
  act(() => sheetProps().onSelect('entry-camera'));
  expect(screen.navigation.setParams).toHaveBeenCalledWith({ deviceId: 'entry-camera' });
  act(() => sheetProps().onClose());
  expect(screen.navigation.goBack).toHaveBeenCalled();
});

test('keeps canonical cameras on their native camera route', () => {
  const screen = renderRoute('entry-camera');
  expect(screen.getByText('Native device controls')).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
});

test('does not open a manifest device missing from the visible home catalog', () => {
  const screen = renderRoute('master-ac');
  expect(screen.getByText('Device unavailable')).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
});

test('keeps account homes on native controls even when a device has a canonical-looking id', () => {
  useHomeStore.setState({ authenticatedUserId: 'account-user', accountUserId: 'account-user', membershipReady: true });
  const screen = renderRoute('living-light');
  expect(screen.getByText('Native device controls')).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
});

test('does not send a stale inspector command after the account changes', () => {
  const toggle = jest.spyOn(mockClient, 'toggle').mockImplementation(() => undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  renderRoute('living-light');
  const controls = sheetProps().client;
  act(() => { useHomeStore.setState({ authenticatedUserId: 'different-account' }); });
  controls.toggle('living-light');
  expect(toggle).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  toggle.mockRestore(); alert.mockRestore();
});

test('hides devices excluded by household room access', () => {
  useHomeStore.setState({ household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home' }], activeMemberId: 'guest', roomMembers: [] });
  const screen = renderRoute('living-light');
  expect(screen.getByText('Device unavailable')).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Go back'));
  expect(screen.navigation.goBack).toHaveBeenCalled();
});

/** Use cloud UUIDs for navigation while keeping simulated controls in the authorized authored room. */
function useAuthenticatedModel(role: 'Owner' | 'Guest' | 'Tenant' = 'Owner') {
  useHomeStore.setState({
    authenticatedUserId: 'account', accountUserId: 'account', activeHomeId: 'home', accountHomeId: 'home', membershipReady: true,
    household: [{ id: 'account', name: 'Test account', role, status: 'home' }], activeMemberId: 'account',
    rooms: [{ id: 'cloud-living', name: 'Living room', modelRoomId: 'living' }, { id: 'cloud-master', name: 'Main bedroom', modelRoomId: 'master' }],
    roomMembers: [{ memberId: 'account', roomIds: ['cloud-living', 'cloud-master'] }],
    devices: [
      { ...catalogDevice('living-light'), id: 'cloud-light', roomId: 'cloud-living', modelDeviceId: 'living-light', simulationOnly: true },
      { ...catalogDevice('master-blinds'), id: 'cloud-blinds', roomId: 'cloud-master', modelDeviceId: 'master-blinds', simulationOnly: true },
    ],
  });
}

test('opens authenticated virtual full controls with model IDs and browses using cloud IDs', () => {
  useAuthenticatedModel('Tenant');
  const screen = renderRoute('cloud-blinds');
  expect(screen.getByText('House inspector')).toBeTruthy();
  expect(sheetProps().deviceId).toBe('master-blinds');
  expect(sheetProps().allowedDeviceIds).toEqual(['living-light', 'master-blinds']);
  act(() => sheetProps().onSelect('living-light'));
  expect(screen.navigation.setParams).toHaveBeenCalledWith({ deviceId: 'cloud-light' });
});

test('removes authenticated full controls when its room grant is revoked', () => {
  useAuthenticatedModel('Guest');
  const screen = renderRoute('cloud-light');
  expect(screen.getByText('House inspector')).toBeTruthy();
  act(() => { useHomeStore.setState({ roomMembers: [] }); });
  expect(screen.getByText('Device unavailable')).toBeTruthy();
});

test('never guesses virtual controls for an invalid model binding', () => {
  useAuthenticatedModel();
  useHomeStore.setState((state) => ({ devices: state.devices.map((device) => ({ ...device, modelDeviceId: 'master-ac' })) }));
  const screen = renderRoute('cloud-light');
  expect(screen.getByText('Device unavailable')).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
});

test('keeps a physical mapped light on native controls', () => {
  useAuthenticatedModel();
  useHomeStore.setState((state) => ({ devices: state.devices.map((device) => ({ ...device, simulationOnly: false })) }));
  expect(renderRoute('cloud-light').getByText('Native device controls')).toBeTruthy();
  expect(DeviceControlsSheet).not.toHaveBeenCalled();
});
