import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { HomeChromeSnapshot } from '../../../../packages/home-scene/src/homeChromeProtocol';
import { useHomeStore } from '../../../store/useHomeStore';
import Pressable from '../../../components/Pressable';
import AccountPreferences from '../AccountPreferences';
import type { AccountIdentity, AccountScope } from '../accountIdentity';

const scope: AccountScope = {
  authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a',
  accountHomeId: 'home-a', sessionEpoch: 2, membershipReady: true,
};
let mockIdentity: AccountIdentity;
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../useAccountIdentity', () => ({ useAccountIdentity: () => ({ identity: mockIdentity, scope }) }));

const initial = useHomeStore.getState();
const scene: HomeChromeSnapshot = {
  locationName: 'Your property', localTime: '09:40', tempC: 23, weatherCode: 0,
  weatherStatus: 'live', isNight: false, motionDisabled: false, systemReducedMotion: false,
  idleEnabled: true, preferenceError: false,
};
beforeEach(() => {
  useHomeStore.setState({ ...scope, profile: { name: 'Alice', tempUnit: 'C', timeFormat: '12h' }, preferences: { haptics: true, notifications: true } });
  mockIdentity = { mode: 'account', name: 'Alice', firstName: 'Alice', initials: 'A', role: 'Guest', homeId: 'home-a' };
});
afterEach(() => useHomeStore.setState(initial, true));

test('sends explicit renderer settings and follows confirmed snapshots instead of optimistic local state', () => {
  const command = jest.fn();
  const close = jest.fn();
  const screen = render(<AccountPreferences onClose={close} scene={scene} onSceneCommand={command} />);
  expect(screen.getAllByRole('switch')).toHaveLength(2);
  fireEvent.press(screen.getByLabelText('Scene motion'));
  expect(command).toHaveBeenLastCalledWith({ type: 'set-motion', disabled: true });
  expect(screen.getByLabelText('Scene motion').props.accessibilityState.checked).toBe(true);
  screen.rerender(<AccountPreferences onClose={close} scene={{ ...scene, motionDisabled: true }} onSceneCommand={command} />);
  expect(screen.getByLabelText('Scene motion').props.accessibilityState.checked).toBe(false);
  expect(screen.getByText('Paused while motion is reduced.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Automatic cinematic tour'));
  expect(command).toHaveBeenLastCalledWith({ type: 'set-tour', enabled: false });
});

test('honors system reduced motion and shows a truthful scene persistence error', () => {
  const command = jest.fn();
  const screen = render(<AccountPreferences onClose={jest.fn()} scene={{ ...scene, systemReducedMotion: true, preferenceError: true }} onSceneCommand={command} />);
  expect(screen.getByLabelText('Scene motion').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText('Scene motion').props.accessibilityState.checked).toBe(false);
  expect(screen.getByText('Reduce Motion is enabled in device settings.')).toBeTruthy();
  expect(screen.getByText('This preference could not be saved. Please try again.')).toBeTruthy();
});

test('keeps local preferences available while the property is not ready', () => {
  const command = jest.fn();
  const screen = render(<AccountPreferences onClose={jest.fn()} scene={null} onSceneCommand={command} />);
  expect(screen.getByLabelText('Scene motion').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('3D help and reset'));
  expect(command).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Comfort'));
  fireEvent.press(screen.getByLabelText('Haptics'));
  fireEvent.press(screen.getByLabelText('Notifications'));
  expect(useHomeStore.getState().preferences).toEqual({ haptics: false, notifications: false });
  screen.unmount();
  const reopened = render(<AccountPreferences onClose={jest.fn()} scene={null} onSceneCommand={command} />);
  fireEvent.press(reopened.getByLabelText('Comfort'));
  expect(reopened.getByLabelText('Haptics').props.accessibilityState.checked).toBe(false);
});

test('updates units and time through existing profile patches without overwriting changed identity', () => {
  const screen = render(<AccountPreferences onClose={jest.fn()} scene={scene} onSceneCommand={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Display'));
  act(() => { useHomeStore.getState().setProfile({ name: 'Updated name', timezone: 'America/New_York' }); });
  fireEvent.press(screen.getByLabelText('Fahrenheit'));
  fireEvent.press(screen.getByLabelText('24-hour'));
  expect(useHomeStore.getState().profile).toMatchObject({ name: 'Updated name', timezone: 'America/New_York', tempUnit: 'F', timeFormat: '24h' });
  expect(screen.getByLabelText('Fahrenheit').props.accessibilityState.selected).toBe(true);
});

test('retained handlers cannot modify another session or issue scene commands after unmount', () => {
  const command = jest.fn();
  const screen = render(<AccountPreferences onClose={jest.fn()} scene={scene} onSceneCommand={command} />);
  const retainedMotion = screen.UNSAFE_getAllByType(Pressable).find((control) => control.props.accessibilityLabel === 'Scene motion')?.props.onPress;
  fireEvent.press(screen.getByLabelText('Comfort'));
  const retainedHaptics = screen.UNSAFE_getAllByType(Pressable).find((control) => control.props.accessibilityLabel === 'Haptics')?.props.onPress;
  expect(retainedMotion).toEqual(expect.any(Function));
  expect(retainedHaptics).toEqual(expect.any(Function));
  act(() => { useHomeStore.setState({ sessionEpoch: 3 }); });
  act(() => { retainedHaptics(); retainedMotion(); });
  expect(useHomeStore.getState().preferences.haptics).toBe(true);
  expect(command).not.toHaveBeenCalled();
  act(() => { useHomeStore.setState(scope); });
  screen.unmount();
  act(() => { retainedHaptics(); retainedMotion(); });
  expect(useHomeStore.getState().preferences.haptics).toBe(true);
  expect(command).not.toHaveBeenCalled();
});

test('closes native preferences before opening existing help and keeps account navigation explicit', () => {
  const calls: string[] = [];
  const back = jest.fn();
  const screen = render(<AccountPreferences onClose={() => calls.push('close')} onBack={back} scene={scene} onSceneCommand={(command) => calls.push(command.type)} />);
  fireEvent.press(screen.getByLabelText('Back to account'));
  expect(back).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText('3D help and reset'));
  expect(calls).toEqual(['close', 'open-preferences']);
});

test('unavailable identity cannot alter personal preferences', () => {
  mockIdentity = { mode: 'unavailable', name: 'Account unavailable', firstName: 'Account', initials: '?', role: null, homeId: null };
  const screen = render(<AccountPreferences onClose={jest.fn()} scene={scene} onSceneCommand={jest.fn()} />);
  expect(screen.getByText('Reopen your account to change preferences.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Display'));
  fireEvent.press(screen.getByLabelText('Fahrenheit'));
  expect(useHomeStore.getState().profile.tempUnit).toBe('C');
});
