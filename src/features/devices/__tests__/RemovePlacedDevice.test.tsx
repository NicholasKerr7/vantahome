import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createDefaultDevicePlacement } from '../../../../packages/home-scene/src/devicePlacement';
import { useHomeStore } from '../../../store/useHomeStore';
import RemovePlacedDevice from '../RemovePlacedDevice';

const mockRemove = jest.fn();
jest.mock('../../../services/simulationDeviceRegistration', () => ({ canManageSimulationDevices: (state: { activeMemberId: string }) => state.activeMemberId === 'owner', removeSimulationDevice: (...args: unknown[]) => mockRemove(...args) }));
const initial = useHomeStore.getState();
const id = '17500000-0000-4000-8000-000000000001';
beforeEach(() => { mockRemove.mockReset(); useHomeStore.setState({ activeMemberId: 'owner', devices: [{ id, modelDeviceId: `placed-${id}`, modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living'), simulationOnly: true, name: 'Reading lamp', kind: 'light', roomId: 'living', isOn: false }] }); });
afterEach(() => useHomeStore.setState(initial, true));

test('requires deliberate confirmation and waits for the authoritative delete', async () => {
  let finish!: () => void;
  mockRemove.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const onRemoved = jest.fn();
  const screen = render(<RemovePlacedDevice modelDeviceId={`placed-${id}`} onRemoved={onRemoved} />);
  fireEvent.press(screen.getByLabelText('Remove added device'));
  expect(mockRemove).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Confirm remove added device'));
  fireEvent.press(screen.getByLabelText('Confirm remove added device'));
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(onRemoved).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(onRemoved).toHaveBeenCalledTimes(1);
});

test('keeps the saved device available on failure and removes the action on role loss', async () => {
  mockRemove.mockRejectedValue(new Error('Reconnect to remove this device.'));
  const onRemoved = jest.fn();
  const screen = render(<RemovePlacedDevice modelDeviceId={`placed-${id}`} onRemoved={onRemoved} />);
  fireEvent.press(screen.getByLabelText('Remove added device'));
  fireEvent.press(screen.getByLabelText('Confirm remove added device'));
  await waitFor(() => expect(screen.getByText('Reconnect to remove this device.')).toBeTruthy());
  expect(onRemoved).not.toHaveBeenCalled();
  expect(useHomeStore.getState().devices).toHaveLength(1);
  await act(async () => { useHomeStore.setState({ activeMemberId: 'guest' }); });
  expect(screen.queryByLabelText('Confirm remove added device')).toBeNull();
});
