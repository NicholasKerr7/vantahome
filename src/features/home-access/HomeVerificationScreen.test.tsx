import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { cancelAnimation, withRepeat } from 'react-native-reanimated';
import HomeVerificationScreen from './HomeVerificationScreen';

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
