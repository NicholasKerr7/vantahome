import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AccountSecurityScreen from './AccountSecurityScreen';

jest.mock('../features/account/AccountSecurityPage', () => ({
  AccountSecurityPage: () => require('react').createElement(require('react-native').Text, null, 'Account controls'),
}));
jest.mock('../components/CinematicSurface', () => ({ __esModule: true, default: require('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

test('shows the bounded account-only workspace with an explicit way back', () => {
  const back = jest.fn();
  const screen = render(<AccountSecurityScreen onBack={back} />);
  expect(screen.getByText('Security & sessions')).toBeTruthy();
  expect(screen.getByText('Account controls')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Go back'));
  expect(back).toHaveBeenCalledTimes(1);
});

test('Android system back leaves the standalone account route instead of exiting the app', () => {
  const previous = Platform.OS;
  Platform.OS = 'android';
  const back = jest.fn();
  const remove = jest.fn();
  let hardwareBack = () => false;
  const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, callback) => {
    hardwareBack = callback as () => boolean;
    return { remove };
  });
  try {
    const screen = render(<AccountSecurityScreen onBack={back} />);
    expect(hardwareBack()).toBe(true);
    expect(back).toHaveBeenCalledTimes(1);
    screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  } finally { listener.mockRestore(); Platform.OS = previous; }
});
