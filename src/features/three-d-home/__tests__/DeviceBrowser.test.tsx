import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DEVICES, getRoom } from '../../../../packages/home-scene/src/data';
import DeviceCollectionCard from '../../../components/DeviceCollectionCard';
import { deviceStatus, quickActionLabel } from '../../../../packages/home-scene/src/deviceCapabilities';
import DeviceBrowser from '../DeviceBrowser';
import { SimulationControlClient } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));

test('keeps quick actions separate from full controls and returns to the room directory', () => {
  const client = new SimulationControlClient();
  const toggle = jest.spyOn(client, 'toggle').mockImplementation(() => undefined);
  const snapshot = { ...client.getSnapshot(), ready: true, access: FULL_SCENE_ACCESS };
  const onSelect = jest.fn();
  const screen = render(<DeviceBrowser snapshot={snapshot} client={client} onSelect={onSelect} />);
  fireEvent(screen.getByTestId('device-browser-card-area'), 'layout', { nativeEvent: { layout: { width: 360, height: 440 } } });
  fireEvent.press(screen.getByLabelText(/Living room, \d+ devices/));
  const device = DEVICES.find((item) => item.roomId === 'living')!;
  const state = snapshot.state.deviceStates[device.id];
  fireEvent.press(screen.getByLabelText(`${quickActionLabel(device, state)}: ${device.name}`));
  expect(toggle).toHaveBeenCalledWith(device.id);
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`${device.name}, ${deviceStatus(device, state)}. Full controls`));
  expect(onSelect).toHaveBeenCalledWith(device.id);
  fireEvent.press(screen.getByLabelText('Browse all rooms'));
  expect(screen.getByLabelText(/Living room, \d+ devices/)).toBeTruthy();
});

test('prevents quick commands while saved controls are loading', () => {
  const client = new SimulationControlClient();
  const toggle = jest.spyOn(client, 'toggle').mockImplementation(() => undefined);
  const snapshot = client.getSnapshot();
  const screen = render(<DeviceBrowser snapshot={snapshot} client={client} onSelect={jest.fn()} />);
  fireEvent.press(screen.getByLabelText(/Living room, \d+ devices/));
  const device = DEVICES.find((item) => item.roomId === 'living')!;
  const button = screen.getByLabelText(`${quickActionLabel(device, snapshot.state.deviceStates[device.id])}: ${device.name}`);
  expect(button.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(button);
  expect(toggle).not.toHaveBeenCalled();
});

test('limits room counts and device choices to the route visibility scope', () => {
  const client = new SimulationControlClient();
  const snapshot = { ...client.getSnapshot(), ready: true, access: FULL_SCENE_ACCESS };
  const screen = render(<DeviceBrowser snapshot={snapshot} client={client} onSelect={jest.fn()} allowedDeviceIds={['living-light']} />);
  expect(screen.getByLabelText('Living room, 1 devices')).toBeTruthy();
  expect(screen.getAllByTestId(/^room-artwork-/, { includeHiddenElements: true })).toHaveLength(1);
  expect(screen.getByTestId('room-artwork-living', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByLabelText(/Primary suite,/)).toBeNull();
  fireEvent.press(screen.getByLabelText('Living room, 1 devices'));
  const device = DEVICES.find((item) => item.id === 'living-light')!;
  expect(screen.getByLabelText(`${device.name}, ${deviceStatus(device, snapshot.state.deviceStates[device.id])}. Full controls`)).toBeTruthy();
  expect(screen.queryByLabelText(/Living room speaker.*Full controls/)).toBeNull();
});

test.each(['smoke', 'camera', 'gate'] as const)('does not highlight %s monitoring, disarming or closed position as powered on', (kind) => {
  const client = new SimulationControlClient();
  const original = client.getSnapshot();
  const device = DEVICES.find((item) => item.kind === kind)!;
  const state = { ...original.state.deviceStates[device.id], on: kind !== 'camera', level: 0,
    settings: { ...original.state.deviceStates[device.id].settings, armed: false } };
  const snapshot = { ...original, ready: true, access: FULL_SCENE_ACCESS,
    state: { ...original.state, deviceStates: { ...original.state.deviceStates, [device.id]: state } } };
  const screen = render(<DeviceBrowser snapshot={snapshot} client={client} onSelect={jest.fn()} allowedDeviceIds={[device.id]} />);
  fireEvent.press(screen.getByLabelText(`${getRoom(device.roomId).name}, 1 devices`));
  expect(screen.UNSAFE_getByType(DeviceCollectionCard).props.active).toBe(false);
  expect(screen.getByLabelText(`${device.name}, ${deviceStatus(device, state)}. Full controls`)).toBeTruthy();
});

test('keeps a cleared but unreset smoke incident visibly marked for attention', () => {
  const client = new SimulationControlClient();
  const original = client.getSnapshot();
  const device = DEVICES.find((item) => item.kind === 'smoke')!;
  const state = { ...original.state.deviceStates[device.id], on: true,
    settings: { ...original.state.deviceStates[device.id].settings, smokeDetected: false, coDetected: false, fireIncidentActive: true } };
  const snapshot = { ...original, ready: true, access: FULL_SCENE_ACCESS,
    state: { ...original.state, deviceStates: { ...original.state.deviceStates, [device.id]: state } } };
  const screen = render(<DeviceBrowser snapshot={snapshot} client={client} onSelect={jest.fn()} allowedDeviceIds={[device.id]} />);
  fireEvent.press(screen.getByLabelText(`${getRoom(device.roomId).name}, 1 devices`));
  expect(screen.getByText('Reset pending')).toBeTruthy();
  expect(screen.UNSAFE_getByType(DeviceCollectionCard).props.statusTone).toBe('warning');
});
