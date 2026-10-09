import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import AccountSheet from '../AccountSheet';
import DashboardAccountButton from '../DashboardAccountButton';
import type { AccountIdentity, AccountScope } from '../accountIdentity';

const mockNavigate = jest.fn();
const mockSignOut = jest.fn();
const mockDetails = { email: 'alice@example.com', emailConfirmed: true, loading: false, homeName: 'Hopewell', error: null, retry: jest.fn() };
const scope: AccountScope = { authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a', accountHomeId: 'home-a', sessionEpoch: 2, membershipReady: true };
let mockIdentity: AccountIdentity;
let mockDimensions = { width: 393, height: 852, fontScale: 1, scale: 1 };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../useAccountIdentity', () => ({ useAccountIdentity: () => ({ identity: mockIdentity, scope }) }));
jest.mock('../useAccountDetails', () => ({ useAccountDetails: () => mockDetails }));
jest.mock('../accountSession', () => ({ signOutAccount: (...args: unknown[]) => mockSignOut(...args) }));

const initial = useHomeStore.getState();
beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState(scope);
  mockIdentity = { mode: 'account', name: 'Alice Smith', firstName: 'Alice', initials: 'AS', role: 'Guest', homeId: 'home-a' };
  mockDimensions = { width: 393, height: 852, fontScale: 1, scale: 1 };
  mockSignOut.mockResolvedValue(true);
});
afterEach(() => useHomeStore.setState(initial, true));

test('keeps mobile identity compact and reveals first name and role on tablet', () => {
  const screen = render(<DashboardAccountButton onPress={jest.fn()} />);
  expect(screen.getByLabelText('Open account: Alice Smith')).toBeTruthy();
  expect(screen.queryByText('Alice')).toBeNull();
  mockDimensions = { ...mockDimensions, width: 1024, height: 768 };
  screen.rerender(<DashboardAccountButton onPress={jest.fn()} />);
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(screen.getByText('Guest')).toBeTruthy();
});

test('demo has a visible label and preview routes without account or owner claims', () => {
  mockIdentity = { mode: 'demo', name: 'Demo profile', firstName: 'Demo', initials: 'VH', role: null, homeId: null };
  const close = jest.fn();
  const screen = render(<><DashboardAccountButton onPress={jest.fn()} /><AccountSheet onClose={close} /></>);
  expect(screen.getByText('Demo')).toBeTruthy();
  expect(screen.getByText('Local preview · no account signed in')).toBeTruthy();
  expect(screen.queryByText('alice@example.com')).toBeNull();
  expect(screen.queryByLabelText('Sign out')).toBeNull();
  expect(screen.queryByLabelText('Household')).toBeNull();
  fireEvent.press(screen.getByLabelText('Preferences'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('Profile', { section: 'preferences' });
  fireEvent.press(screen.getByLabelText('Preview account access'));
  expect(mockNavigate).toHaveBeenCalledWith('AccountEntry');
});

test('opens the focused preferences panel without routing through profile identity', () => {
  const close = jest.fn();
  const preferences = jest.fn();
  const screen = render(<AccountSheet onClose={close} onPreferences={preferences} />);
  fireEvent.press(screen.getByLabelText('Preferences'));
  expect(preferences).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Profile'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('Profile', { section: 'identity' });
});

test('shows the current home and routes household access after closing the sheet', () => {
  const close = jest.fn();
  const screen = render(<AccountSheet onClose={close} />);
  expect(screen.getByText('alice@example.com')).toBeTruthy();
  expect(screen.getByText('Hopewell')).toBeTruthy();
  expect(screen.getByText('Guest')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Household'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('Profile', { section: 'household' });
});

test('requires confirmation before sign-out and reports failure without closing', async () => {
  mockSignOut.mockRejectedValueOnce(new Error('offline'));
  const close = jest.fn();
  const screen = render(<AccountSheet onClose={close} />);
  fireEvent.press(screen.getByLabelText('Sign out'));
  expect(mockSignOut).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByLabelText('Confirm sign out on this device')).toBeNull();
  fireEvent.press(screen.getByLabelText('Sign out'));
  await act(async () => fireEvent.press(screen.getByLabelText('Confirm sign out on this device')));
  expect(screen.getByText('Sign-out could not finish. Please try again.')).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByLabelText('Confirm sign out on this device')));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
