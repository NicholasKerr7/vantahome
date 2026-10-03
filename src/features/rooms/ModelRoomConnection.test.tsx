import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { DEVICES, ROOMS } from '../../../packages/home-scene/src/data';
import { useHomeStore } from '../../store/useHomeStore';
import { saveModelRoomBinding } from '../../services/modelRoomBinding';
import ModelRoomConnection from './ModelRoomConnection';

jest.mock('../../services/modelRoomBinding', () => ({ saveModelRoomBinding: jest.fn(async () => undefined) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);

const seed = useHomeStore.getState();
const target = DEVICES.find((device) => device.kind === 'light')!;
const targetRoom = ROOMS.find((room) => room.id === target.roomId)!;
const save = jest.mocked(saveModelRoomBinding);

beforeEach(() => {
  jest.clearAllMocks();
  save.mockResolvedValue(undefined);
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    activeMemberId: 'person', household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'cloud-room', name: 'Guest suite', modelRoomId: targetRoom.id }],
    devices: [{ id: 'cloud-lamp', name: 'Bedside lamp', roomId: 'cloud-room', kind: 'light', isOn: false }], memberPermissionOverrides: [],
  });
});
afterEach(() => useHomeStore.setState(seed));

test('requires an explicit device match, shows only same-kind targets, and saves the cloud IDs', async () => {
  const onClose = jest.fn();
  const screen = render(<ModelRoomConnection roomId="cloud-room" onClose={onClose} />);
  fireEvent.press(screen.getByLabelText('Match devices'));
  expect(screen.getByRole('radio', { name: 'No model device' }).props.accessibilityState.checked).toBe(true);
  const nonLight = DEVICES.find((device) => device.roomId === targetRoom.id && device.kind !== 'light');
  if (nonLight) expect(screen.queryByRole('radio', { name: nonLight.name })).toBeNull();
  for (let page = 0; page < 10 && !screen.queryByRole('radio', { name: target.name }); page += 1) fireEvent.press(screen.getByLabelText('Next model devices'));
  fireEvent.press(screen.getByRole('radio', { name: target.name }));
  fireEvent.press(screen.getByLabelText('Save connection'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith('cloud-room', targetRoom.id, [{ deviceId: 'cloud-lamp', modelDeviceId: target.id }]);
});

test('keeps the selected bindings and displays the error when the server rejects a save', async () => {
  save.mockRejectedValue(new Error('This room connection is already in use.'));
  useHomeStore.setState({ devices: [{ ...useHomeStore.getState().devices[0], modelDeviceId: target.id }] });
  const onClose = jest.fn();
  const screen = render(<ModelRoomConnection roomId="cloud-room" onClose={onClose} />);
  fireEvent.press(screen.getByLabelText('Match devices'));
  fireEvent.press(screen.getByLabelText('Save connection'));
  await waitFor(() => expect(screen.getByText('This room connection is already in use.')).toBeTruthy());
  expect(onClose).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledWith('cloud-room', targetRoom.id, [{ deviceId: 'cloud-lamp', modelDeviceId: target.id }]);
});

test('clears device mappings only after explicitly selecting no room connection', async () => {
  useHomeStore.setState({ devices: [{ ...useHomeStore.getState().devices[0], modelDeviceId: target.id }] });
  const screen = render(<ModelRoomConnection roomId="cloud-room" onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Not connected' }));
  fireEvent.press(screen.getByLabelText('Save connection'));
  await waitFor(() => expect(save).toHaveBeenCalledWith('cloud-room', null, []));
});

test('revoked administrators and changed identities cannot retain the connection form', () => {
  const screen = render(<ModelRoomConnection roomId="cloud-room" onClose={jest.fn()} />);
  expect(screen.getByLabelText('Match devices')).toBeTruthy();
  act(() => { useHomeStore.setState({ household: [{ id: 'person', role: 'Tenant', name: 'Person', status: 'home' }] }); });
  expect(screen.queryByLabelText('Match devices')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
