import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { createDefaultDevicePlacement } from '../../../packages/home-scene/src/devicePlacement';
import { useHomeStore, type Device } from '../../store/useHomeStore';
import {
  loadPendingSimulationDeviceEdit, refreshSimulationDeviceForEdit, SimulationDeviceEditConflictError,
  SimulationDeviceEditValidationError, updateSimulationDevice, type SimulationDeviceEditResult,
} from '../../services/simulationDeviceEditing';
import SimulationDeviceEditor from './SimulationDeviceEditor';

jest.mock('../../services/simulationDeviceEditing', () => ({
  ...jest.requireActual('../../services/simulationDeviceEditing'),
  loadPendingSimulationDeviceEdit: jest.fn(async () => null),
  refreshSimulationDeviceForEdit: jest.fn(), updateSimulationDevice: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => require('react-native').View);
jest.mock('../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('./DevicePlacementPreview', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return ({ placement, onChange, excludeModelDeviceId }: import('./devicePlacementPreviewTypes').DevicePlacementPreviewProps) =>
    React.createElement(Pressable, { testID: excludeModelDeviceId, accessibilityLabel: 'Move model left',
      onPress: () => onChange({ ...placement, rotationY: placement.rotationY + 0.25, position: [placement.position[0] - 0.25, placement.position[1], placement.position[2]] }) }, React.createElement(Text, null, 'Placement canvas'));
});

const seed = useHomeStore.getState();
const deviceId = '33333333-3333-4333-8333-333333333333';
const roomId = '22222222-2222-4222-8222-222222222222';
const nextRoomId = '22222222-2222-4222-8222-222222222223';
const requestId = '11111111-1111-4111-8111-111111111111';
const secondRequestId = '11111111-1111-4111-8111-111111111112';
const original: Device = { id: deviceId, roomId, name: 'Reading lamp', kind: 'light', isOn: true, brightness: 68,
  modelDeviceId: `placed-${deviceId}`, simulationOnly: true, modelRevision: 4,
  modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living')! };
const update = jest.mocked(updateSimulationDevice);
const restore = jest.mocked(loadPendingSimulationDeviceEdit);
const refresh = jest.mocked(refreshSimulationDeviceForEdit);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(randomUUID).mockReturnValue(secondRequestId).mockReturnValueOnce(requestId);
  restore.mockResolvedValue(null);
  update.mockResolvedValue({ deviceId, status: 'updated', revision: 5 });
  refresh.mockResolvedValue(original);
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    authTaskBlockingHome: false, activeMemberId: 'person', household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: roomId, name: 'Living room', modelRoomId: 'living' }, { id: nextRoomId, name: 'Master bedroom', modelRoomId: 'master' }],
    devices: [original], memberPermissionOverrides: [], realtime: { ...seed.realtime, enabled: false, useMqtt: false },
  });
});
afterEach(() => useHomeStore.setState(seed));

/** Give a saved lamp a different name and preview pose without touching the store. */
async function reviewEdit(screen: ReturnType<typeof render>): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Device name')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Device name'), 'Evening lamp');
  fireEvent.press(screen.getByLabelText('Continue'));
  expect(screen.getByTestId(`placed-${deviceId}`)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Move model left'));
  fireEvent.press(screen.getByLabelText('Continue'));
}

/** The room picker pages complete touch targets even when test layout measurement is unavailable. */
function chooseMasterRoom(screen: ReturnType<typeof render>): void {
  if (!screen.queryByLabelText('Master bedroom')) fireEvent.press(screen.getByLabelText('Next rooms'));
  fireEvent.press(screen.getByLabelText('Master bedroom'));
}

test('renames, moves and rotates the same device only after authoritative save confirmation', async () => {
  let confirm!: (value: SimulationDeviceEditResult) => void;
  update.mockImplementation(() => new Promise((resolve) => { confirm = resolve; }));
  const onSaved = jest.fn();
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={onSaved} />);
  await reviewEdit(screen);
  expect(useHomeStore.getState().devices[0]).toEqual(original);
  fireEvent.press(screen.getByLabelText('Save changes'));
  fireEvent.press(screen.getByLabelText('Saving changes…'));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(update).toHaveBeenCalledWith({ requestId, deviceId, expectedRevision: 4, name: 'Evening lamp', roomId,
    placement: { ...original.modelPlacement!, rotationY: original.modelPlacement!.rotationY + 0.25,
      position: [original.modelPlacement!.position[0] - 0.25, original.modelPlacement!.position[1], original.modelPlacement!.position[2]] } });
  expect(screen.queryByText('Right where you want it.')).toBeNull();
  await act(async () => { confirm({ deviceId, status: 'updated', revision: 5 }); });
  expect(screen.getByText('Right where you want it.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Open full controls'));
  expect(onSaved).toHaveBeenCalledWith(deviceId);
  expect(useHomeStore.getState().devices[0]).toMatchObject({ id: deviceId, isOn: true, brightness: 68 });
});

test('room change uses its valid pose and destination permissions; cancellation never writes', async () => {
  const onClose = jest.fn();
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={onClose} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Device name')).toBeTruthy());
  chooseMasterRoom(screen);
  fireEvent.changeText(screen.getByLabelText('Device name'), 'Bedside lamp');
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Continue'));
  expect(screen.getByText('Moving from Living room changes access to the destination room’s permissions.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Previous step'));
  fireEvent.press(screen.getByLabelText('Previous step'));
  fireEvent.press(screen.getByLabelText('Cancel device edit'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(update).not.toHaveBeenCalled();
  expect(useHomeStore.getState().devices[0]).toEqual(original);
});

test('commits the room and compatible default position together without passing control settings', async () => {
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Device name')).toBeTruthy());
  chooseMasterRoom(screen);
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ requestId, deviceId, expectedRevision: 4, name: original.name, roomId: nextRoomId,
    placement: createDefaultDevicePlacement('master-bedside-left', 'master') }));
});

test('restores an uncertain edit and retries the exact payload with no route to change it', async () => {
  const draft = { requestId: secondRequestId, deviceId, expectedRevision: 3, name: 'Recovered lamp', roomId, placement: original.modelPlacement! };
  restore.mockResolvedValue(draft);
  update.mockRejectedValueOnce(new Error('Reconnect and retry to confirm the same edit.'));
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Retry save')).toBeTruthy());
  expect(screen.queryByLabelText('Device name')).toBeNull();
  expect(screen.queryByLabelText('Previous step')).toBeNull();
  fireEvent.press(screen.getByLabelText('Retry save'));
  await waitFor(() => expect(screen.getByText('Reconnect and retry to confirm the same edit.')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Retry save'));
  await waitFor(() => expect(screen.getByText('Right where you want it.')).toBeTruthy());
  expect(update).toHaveBeenNthCalledWith(1, draft);
  expect(update).toHaveBeenNthCalledWith(2, draft);
});

test('requires deliberate reload after a conflict and uses the latest revision for a fresh draft', async () => {
  const latest = { ...original, name: 'Changed elsewhere', modelRevision: 8 };
  update.mockRejectedValueOnce(new SimulationDeviceEditConflictError(latest));
  refresh.mockResolvedValue(latest);
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await reviewEdit(screen);
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(screen.getByLabelText('Load latest device')).toBeTruthy());
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Retry save')).toBeNull();
  fireEvent.press(screen.getByLabelText('Load latest device'));
  await waitFor(() => expect(screen.getByLabelText('Device name').props.value).toBe('Changed elsewhere'));
  fireEvent.changeText(screen.getByLabelText('Device name'), 'My updated lamp');
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId, expectedRevision: 8, requestId: secondRequestId, name: 'My updated lamp' })));
});

test('a confirmed removed device has no retry or recreate action', async () => {
  update.mockRejectedValueOnce(new SimulationDeviceEditConflictError(null));
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await reviewEdit(screen);
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(screen.getByText('This device was removed.')).toBeTruthy());
  expect(screen.queryByLabelText('Retry save')).toBeNull();
  expect(screen.queryByLabelText('Load latest device')).toBeNull();
});

test('an acknowledged invalid destination allows correcting the draft with a fresh receipt', async () => {
  update.mockRejectedValueOnce(new SimulationDeviceEditValidationError('Choose a compatible room.'));
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await reviewEdit(screen);
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(screen.getByLabelText('Previous step')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Previous step'));
  fireEvent.press(screen.getByLabelText('Previous step'));
  chooseMasterRoom(screen);
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ requestId: secondRequestId, roomId: nextRoomId })));
});

test('blocks empty names and unchanged saves, and immediately hides after role loss', async () => {
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Device name')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Device name'), '  ');
  expect(screen.getByLabelText('Continue').props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Device name'), original.name);
  fireEvent.press(screen.getByLabelText('Continue'));
  fireEvent.press(screen.getByLabelText('Continue'));
  expect(screen.getByLabelText('Save changes').props.accessibilityState.disabled).toBe(true);
  await act(async () => { useHomeStore.setState({ household: [{ id: 'person', role: 'Guest', name: 'Person', status: 'home' }] }); });
  expect(screen.queryByTestId('simulation-device-editor')).toBeNull();
  expect(update).not.toHaveBeenCalled();
});

test('a late save cannot show success or open controls in another account session', async () => {
  let confirm!: (value: SimulationDeviceEditResult) => void;
  update.mockImplementation(() => new Promise((resolve) => { confirm = resolve; }));
  const onSaved = jest.fn();
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={onSaved} />);
  await reviewEdit(screen);
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(update).toHaveBeenCalled());
  await act(async () => { useHomeStore.setState({ sessionEpoch: seed.sessionEpoch + 1 }); confirm({ deviceId, status: 'updated', revision: 5 }); });
  expect(screen.queryByTestId('simulation-device-editor')).toBeNull();
  expect(onSaved).not.toHaveBeenCalled();
});

test('an unreadable pending journal offers recovery before allowing new edits', async () => {
  restore.mockRejectedValueOnce(new Error('Unavailable storage'));
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Resume edit')).toBeTruthy());
  expect(screen.queryByLabelText('Continue')).toBeNull();
  fireEvent.press(screen.getByLabelText('Resume edit'));
  await waitFor(() => expect(screen.getByLabelText('Device name')).toBeTruthy());
  expect(update).not.toHaveBeenCalled();
});

test('cancelling protected confirmation before writing leaves the draft editable', async () => {
  update.mockRejectedValueOnce(new SimulationDeviceEditValidationError('Confirmation cancelled.'));
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await reviewEdit(screen);
  fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(screen.getByText('Confirmation cancelled.')).toBeTruthy());
  expect(screen.queryByLabelText('Retry save')).toBeNull();
  fireEvent.press(screen.getByLabelText('Previous step'));
  fireEvent.press(screen.getByLabelText('Previous step'));
  fireEvent.changeText(screen.getByLabelText('Device name'), 'Another name');
  expect(screen.getByLabelText('Device name').props.value).toBe('Another name');
  expect(useHomeStore.getState().devices[0]).toEqual(original);
});

test('removing the saved record while editing presents a clear exit without recreating it', async () => {
  const screen = render(<SimulationDeviceEditor deviceId={deviceId} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText('Device name')).toBeTruthy());
  await act(async () => { useHomeStore.setState({ devices: [] }); });
  expect(screen.getByText('This device was removed.')).toBeTruthy();
  expect(screen.getByLabelText('Back to devices')).toBeTruthy();
  expect(screen.queryByLabelText('Continue')).toBeNull();
  expect(update).not.toHaveBeenCalled();
});
