import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { AppFeedbackHost } from '../AppFeedback';
import { AppFeedback, dismissFeedback } from '../../services/appFeedback';

const mockState = { authenticatedUserId: 'owner', activeHomeId: 'home-a', activeMemberId: 'member-a', sessionEpoch: 1,
  membershipReady: true, household: [{ id: "member-a", role: "Owner", accessExpiresAt: undefined as string | undefined }], roomMembers: [], memberPermissionOverrides: [] };
const mockListeners = new Set<() => void>();
jest.mock('../../store/useHomeStore', () => ({ useHomeStore: {
  getState: () => mockState,
  subscribe: (listener: () => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); },
} }));
jest.mock('../ModalCard', () => {
  const { View } = require('react-native');
  return function Modal({ children }: { children: React.ReactNode }) { return <View>{children}</View>; };
});
const originalOS = Platform.OS;
beforeEach(() => { Platform.OS = 'web'; mockState.activeHomeId = 'home-a'; mockState.household = [{ id: 'member-a', role: 'Owner', accessExpiresAt: undefined }]; dismissFeedback(); });
afterEach(() => { dismissFeedback(); Platform.OS = originalOS; jest.restoreAllMocks(); });

test('web confirms a destructive action only after pressing its rendered button', () => {
  const action = jest.fn();
  const native = jest.spyOn(Alert, 'alert');
  const screen = render(<AppFeedbackHost />);
  act(() => AppFeedback.alert('Remove authorization?', 'Only the saved local record is removed.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: action },
  ]));
  expect(action).not.toHaveBeenCalled();
  expect(native).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Remove'));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Remove authorization?')).toBeNull();
});

test('web failures are visible and cancel never runs the destructive callback', () => {
  const action = jest.fn();
  const screen = render(<AppFeedbackHost />);
  act(() => AppFeedback.alert('Scene not completed', 'Check device status before retrying.'));
  expect(screen.getByText('Check device status before retrying.')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('OK'));
  act(() => AppFeedback.alert('Remove?', undefined, [{ text: 'Cancel' }, { text: 'Remove', onPress: action }]));
  fireEvent.press(screen.getByLabelText('Cancel'));
  expect(action).not.toHaveBeenCalled();
});

test('changing homes invalidates even an already captured confirmation handler', () => {
  const action = jest.fn();
  const screen = render(<AppFeedbackHost />);
  act(() => AppFeedback.alert('Remove?', undefined, [{ text: 'Remove', onPress: action }]));
  const staleButton = screen.getByLabelText('Remove');
  act(() => { mockState.activeHomeId = 'home-b'; mockListeners.forEach((listener) => listener()); });
  expect(screen.queryByText('Remove?')).toBeNull();
  fireEvent.press(staleButton);
  expect(action).not.toHaveBeenCalled();
});


test('a guest confirmation expires even before the app publishes an expiry update', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  mockState.household = [{ id: 'member-a', role: 'Guest', accessExpiresAt: new Date(1_000_001).toISOString() }];
  const action = jest.fn();
  const screen = render(<AppFeedbackHost />);
  act(() => AppFeedback.alert('Continue?', undefined, [{ text: 'Continue', onPress: action }]));
  const button = screen.getByLabelText('Continue');
  now.mockReturnValue(1_000_002);
  fireEvent.press(button);
  expect(action).not.toHaveBeenCalled();
});
