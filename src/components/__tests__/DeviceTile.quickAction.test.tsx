import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../packages/home-scene/src/data';
import { quickActionLabel } from '../../../packages/home-scene/src/deviceCapabilities';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import DeviceTile from '../DeviceTile';
import type { Device } from '../../store/useHomeStore';

jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../DeviceIcon', () => require('react-native').View);
jest.mock('../../services/deviceClient', () => ({ deviceClient: { sendCommand: jest.fn() } }));
jest.mock('../../theme/layout', () => ({ useResponsive: () => ({ isTablet: false, isLandscape: false, scale: 1 }) }));

const snapshot = createDefaultSimulationSnapshot();

/** Keep the native tile fixture bound to the exact house-plan device being inspected. */
function nativeDevice(id: string): Device {
  const definition = getDevice(id)!;
  return { id, name: definition.name, roomId: definition.roomId, kind: definition.kind, isOn: snapshot.deviceStates[id].on };
}

test.each(['utility-gas-meter', 'kitchen-gas-leak', 'utility-energy'])(
  'describes the shared simulation quick action for %s and invokes only that action', (id) => {
    const definition = getDevice(id)!;
    const onToggle = jest.fn();
    const onPress = jest.fn();
    const label = quickActionLabel(definition, snapshot.deviceStates[id]);
    const screen = render(<DeviceTile device={nativeDevice(id)} onPress={onPress} onToggle={onToggle} toggleLabel={label} />);
    fireEvent.press(screen.getByLabelText(`${label}: ${definition.name}`), { stopPropagation: jest.fn() });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(`Open controls for ${definition.name}`)).toBeNull();
  },
);

test('preserves the full-controls shortcut for an ordinary native gas tile', () => {
  const device = nativeDevice('utility-gas-meter');
  const onPress = jest.fn();
  const screen = render(<DeviceTile device={device} onPress={onPress} />);
  fireEvent.press(screen.getByLabelText(`Open controls for ${device.name}`), { stopPropagation: jest.fn() });
  expect(onPress).toHaveBeenCalledTimes(1);
});
