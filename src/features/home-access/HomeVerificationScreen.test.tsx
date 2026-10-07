import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { cancelAnimation, withRepeat } from 'react-native-reanimated';
import HomeVerificationScreen from './HomeVerificationScreen';
import PropertyArrival from './PropertyArrival';

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...mock,
    useSharedValue: (value: number) => React.useRef({ value }).current,
    withTiming: jest.fn((value: number) => value),
    withRepeat: jest.fn((value: number) => value),
    cancelAnimation: jest.fn(),
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 34, left: 0 }) };
});

let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let removeAppListener: jest.Mock;
let removeMotionListener: jest.Mock;
let dimensions = { width: 430, height: 932, scale: 3, fontScale: 1 };
const onRetry = jest.fn();
const onSignOut = jest.fn();

/** Settle the asynchronous system motion preference without waiting on decoration. */
async function settleMotion(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  dimensions = { width: 430, height: 932, scale: 3, fontScale: 1 };
  jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions').mockImplementation(() => dimensions);
  removeAppListener = jest.fn();
  removeMotionListener = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onAppChange = listener;
    return { remove: removeAppListener };
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    onMotionChange = listener as unknown as (enabled: boolean) => void;
    return { remove: removeMotionListener } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => { cleanup(); jest.restoreAllMocks(); });

test('account preparation continues into verification without restarting the shared artwork', async () => {
  const screen = render(<HomeVerificationScreen status="preparing" />);
  await settleMotion();
  expect(screen.getByText('Preparing your account…')).toBeTruthy();
  expect(screen.getByText('Preparing this device before checking your home access.')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText('VERIFYING ACCESS')).toBeNull();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  screen.rerender(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  expect(screen.getByText('Verifying your home…')).toBeTruthy();
  expect(screen.queryByText('Preparing your account…')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  expect(removeAppListener).not.toHaveBeenCalled();
});

test('startup failures can explain their real cause without offering an unavailable sign-out action', async () => {
  const screen = render(<HomeVerificationScreen
    status="unavailable"
    statusMessage="Unable to prepare your account on this device."
    statusDescription="Try preparing your account again."
    onRetry={onRetry}
  />);
  await settleMotion();
  expect(screen.getByText('Unable to prepare your account on this device.')).toBeTruthy();
  expect(screen.getByText('Try preparing your account again.')).toBeTruthy();
  expect(screen.queryByText('Unable to verify home access.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(withRepeat).not.toHaveBeenCalled();
});

test('a returning account keeps an opaque verification surface without repeating the full introduction', async () => {
  const screen = render(<HomeVerificationScreen status="checking" variant="returning" onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  expect(screen.getByText('Returning to your home…')).toBeTruthy();
  expect(screen.getByText('Verifying your home…')).toBeTruthy();
  expect(screen.queryByText('Your world.\nWithin reach.')).toBeNull();
  expect(screen.queryByText('A MOMENT FROM HOME')).toBeNull();
  expect(screen.getByTestId('home-verification-screen')).toHaveStyle({ backgroundColor: '#2B0A73' });
  expect(screen.getByTestId('home-verification-screen').props.accessibilityViewIsModal).toBe(true);
});

test('property preparation stays inside the scene without a modal gate or fabricated progress', async () => {
  const screen = render(<PropertyArrival />);
  await settleMotion();
  expect(screen.getByText('Opening your property…')).toBeTruthy();
  expect(screen.getByText('Your controls are ready while the view opens.')).toBeTruthy();
  expect(screen.getByTestId('property-arrival').props.accessibilityViewIsModal).not.toBe(true);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByTestId('home-verification-screen')).toBeNull();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  screen.rerender(<PropertyArrival active={false} />);
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test('property preparation frees decorative space and stops motion for larger accessibility text', async () => {
  const screen = render(<PropertyArrival />);
  await settleMotion();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  dimensions = { width: 320, height: 568, scale: 2, fontScale: 2 };
  screen.rerender(<PropertyArrival />);
  expect(screen.queryByTestId('verification-architecture', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByText('Opening your property…')).toBeTruthy();
  expect(screen.getByText('Your controls are ready while the view opens.')).toBeTruthy();
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test('shows real verification status with accessible recovery actions and no fabricated progress', async () => {
  const screen = render(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  expect(screen.getByText('Verifying your home…')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByTestId('home-verification-screen').props.accessibilityViewIsModal).toBe(true);
  expect(screen.queryByTestId('verification-architecture')).toBeNull();
  expect(screen.getByTestId('verification-architecture', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test('an unavailable check stops motion and explains how to recover without declaring the user offline', async () => {
  const screen = render(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  screen.rerender(<HomeVerificationScreen status="unavailable" onRetry={onRetry} onSignOut={onSignOut} />);
  expect(screen.getByText('Unable to verify home access.')).toBeTruthy();
  expect(screen.getByText('Check your connection, then retry. Your controls will return once access is verified.')).toBeTruthy();
  expect(screen.queryByText('Verifying your home…')).toBeNull();
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test('sign-out progress disables both actions and exposes a failed attempt for recovery', async () => {
  const screen = render(<HomeVerificationScreen status="unavailable" onRetry={onRetry} onSignOut={onSignOut} signingOut />);
  await settleMotion();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.press(screen.getByRole('button', { name: 'Signing out…' }));
  expect(onRetry).not.toHaveBeenCalled();
  expect(onSignOut).not.toHaveBeenCalled();
  screen.rerender(<HomeVerificationScreen status="unavailable" onRetry={onRetry} onSignOut={onSignOut} signOutError="Please try signing out again." />);
  expect(screen.getByRole('alert').props.children).toBe('Please try signing out again.');
  expect(screen.getByRole('button', { name: 'Sign out' })).not.toBeDisabled();
});

test('keeps artwork still when Reduce Motion is enabled and responds to preference changes', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  render(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  expect(withRepeat).not.toHaveBeenCalled();
  act(() => onMotionChange(false));
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  act(() => onMotionChange(true));
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test('stops in the background and removes animation subscriptions on unmount', async () => {
  const screen = render(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  act(() => onAppChange('background'));
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(withRepeat).toHaveBeenCalledTimes(1);
  act(() => onAppChange('active'));
  expect(withRepeat).toHaveBeenCalledTimes(2);
  screen.unmount();
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
});

test('reclaims artwork space for large text while keeping status and actions available', async () => {
  const screen = render(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  dimensions = { width: 320, height: 568, scale: 2, fontScale: 2 };
  screen.rerender(<HomeVerificationScreen status="checking" onRetry={onRetry} onSignOut={onSignOut} />);
  expect(screen.queryByTestId('verification-architecture', { includeHiddenElements: true })).toBeNull();
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(removeMotionListener).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Verifying your home…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
});


test('account retry cannot claim sign-out is running and disables duplicate recovery actions', async () => {
  const screen = render(<HomeVerificationScreen status="preparing" retrying onRetry={onRetry} onSignOut={onSignOut} />);
  await settleMotion();
  expect(screen.getByText('Retrying…')).toBeTruthy();
  expect(screen.getByText('Sign out')).toBeTruthy();
  expect(screen.queryByText('Signing out…')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(onRetry).not.toHaveBeenCalled();
  expect(onSignOut).not.toHaveBeenCalled();
});
