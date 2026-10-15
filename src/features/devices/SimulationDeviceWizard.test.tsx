import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ROOMS } from '../../../packages/home-scene/src/data';
import { createDefaultDevicePlacement } from '../../../packages/home-scene/src/devicePlacement';
import { useHomeStore } from '../../store/useHomeStore';
import {
  loadPendingSimulationDeviceRegistration,
  registerSimulationDevice,
  type SimulationDeviceRegistrationResult,
} from '../../services/simulationDeviceRegistration';
import SimulationDeviceWizard from './SimulationDeviceWizard';

jest.mock('../../services/simulationDeviceRegistration', () => ({
  ...jest.requireActual('../../services/simulationDeviceRegistration'),
  loadPendingSimulationDeviceRegistration: jest.fn(async () => null),
  registerSimulationDevice: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => require('react-native').View);
jest.mock('../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('./DevicePlacementPreview', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return ({ placement, onChange }: { placement: import('../../../packages/home-scene/src/devicePlacement').SimulationDevicePlacement; onChange: (next: import('../../../packages/home-scene/src/devicePlacement').SimulationDevicePlacement) => void }) =>
    React.createElement(Pressable, { accessibilityLabel: 'Move model left', onPress: () => onChange({ ...placement, position: [placement.position[0] - 0.25, placement.position[1], placement.position[2]] }) }, React.createElement(Text, null, 'Placement canvas'));
});

const seed = useHomeStore.getState();
const modelRoom = ROOMS.find((room) => room.id === 'living')!;
const roomId = '22222222-2222-4222-8222-222222222222';
const savedDeviceId = '33333333-3333-4333-8333-333333333333';
const register = jest.mocked(registerSimulationDevice);
const restore = jest.mocked(loadPendingSimulationDeviceRegistration);

beforeEach(() => {
  jest.clearAllMocks();
  restore.mockResolvedValue(null);
  register.mockResolvedValue({ deviceId: savedDeviceId, status: 'created' });
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    authTaskBlockingHome: false, activeMemberId: 'person', household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: roomId, name: 'Living room', modelRoomId: modelRoom.id }], devices: [], memberPermissionOverrides: [],
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
  });
});
afterEach(() => useHomeStore.setState(seed));

/** Enter a named default ceiling light and stop on its final review. */
async function reviewNewDevice(screen: ReturnType<typeof render>): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Continue')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.changeText(screen.getByLabelText('Device name'), 'Reading light');
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Move model left'));
  fireEvent.press(screen.getByLabelText('Continue'));
}

test('saves the named preview pose once and reports success only after registry confirmation', async () => {
  let confirmSave!: (value: SimulationDeviceRegistrationResult) => void;
  register.mockImplementation(() => new Promise((resolve) => { confirmSave = resolve; }));
  const onSaved = jest.fn();
  const screen = render(<SimulationDeviceWizard initialRoomId={roomId} onClose={jest.fn()} onSaved={onSaved} />);
  await reviewNewDevice(screen);
  fireEvent.press(screen.getByLabelText('Save device'));
  fireEvent.press(screen.getByLabelText('Saving device…'));
  await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
  const base = createDefaultDevicePlacement('master-light', modelRoom.id)!;
  expect(register).toHaveBeenCalledWith({ requestId: '11111111-1111-4111-8111-111111111111', name: 'Reading light', roomId,
    placement: { ...base, position: [base.position[0] - 0.25, base.position[1], base.position[2]] } });
  expect(screen.queryByText('A new part of your home.')).toBeNull();
  await act(async () => { confirmSave({ deviceId: savedDeviceId, status: 'created' }); });
  expect(screen.getByText('A new part of your home.')).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Open full controls'));
  expect(onSaved).toHaveBeenCalledWith(savedDeviceId);
});

test('restores an uncertain save after reopening and retries the identical payload without editing it', async () => {
  const draft = { requestId: '44444444-4444-4444-8444-444444444444', name: 'Saved lamp', roomId,
    placement: createDefaultDevicePlacement('master-bedside-left', modelRoom.id)! };
  restore.mockResolvedValue(draft);
  register.mockRejectedValueOnce(new Error('The device was saved. Retry to refresh its device list.'));
  const screen = render(<SimulationDeviceWizard onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Retry save')).toBeTruthy());
  expect(screen.queryByLabelText('Device name')).toBeNull();
  expect(screen.queryByLabelText('Previous step')).toBeNull();
  fireEvent.press(screen.getByLabelText('Retry save'));
  await waitFor(() => expect(screen.getByText('The device was saved. Retry to refresh its device list.')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Retry save'));
  await waitFor(() => expect(screen.getByText('A new part of your home.')).toBeTruthy());
  expect(register).toHaveBeenNthCalledWith(1, draft);
  expect(register).toHaveBeenNthCalledWith(2, draft);
});

test('can reconcile an unfinished save even when its previous room was removed', async () => {
  const draft = { requestId: '44444444-4444-4444-8444-444444444444', name: 'Previous lamp', roomId,
    placement: createDefaultDevicePlacement('master-bedside-left', modelRoom.id)! };
  useHomeStore.setState({ rooms: [] });
  restore.mockResolvedValue(draft);
  register.mockRejectedValueOnce(new Error('The original room was removed. Close setup and choose another room.'));
  const screen = render(<SimulationDeviceWizard onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Retry save')).toBeTruthy());
  expect(screen.getByText('Previously selected room')).toBeTruthy();
  expect(screen.getByLabelText('Retry save').props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByLabelText('Retry save'));
  await waitFor(() => expect(register).toHaveBeenCalledWith(draft));
});

test('blocks a new draft when its unfinished-save journal cannot be read, with a recovery action', async () => {
  restore.mockRejectedValueOnce(new Error('Storage unavailable'));
  const screen = render(<SimulationDeviceWizard onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Resume setup')).toBeTruthy());
  expect(screen.queryByLabelText('Continue')).toBeNull();
  fireEvent.press(screen.getByLabelText('Resume setup'));
  await waitFor(() => expect(screen.getByLabelText('Continue')).toBeTruthy());
  expect(register).not.toHaveBeenCalled();
});

test('prevents an empty name and removes the draft immediately when administrator access is revoked', async () => {
  const screen = render(<SimulationDeviceWizard onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Continue')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.changeText(screen.getByLabelText('Device name'), '   ');
  expect(screen.getByLabelText('Continue').props.accessibilityState.disabled).toBe(true);
  act(() => { useHomeStore.setState({ household: [{ id: 'person', role: 'Guest', name: 'Person', status: 'home' }] }); });
  expect(screen.queryByTestId('simulation-device-wizard')).toBeNull();
  expect(register).not.toHaveBeenCalled();
});

test('excludes unconnected rooms and offers a clear route to connect a room', async () => {
  useHomeStore.setState({ rooms: [{ id: roomId, name: 'Unconnected room' }] });
  const screen = render(<SimulationDeviceWizard onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Connect a room first.')).toBeTruthy());
  expect(screen.queryByLabelText('Continue')).toBeNull();
});
