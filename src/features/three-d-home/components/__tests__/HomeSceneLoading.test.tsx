import React from 'react';
import { AccessibilityInfo, AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { act, cleanup, render } from '@testing-library/react-native';
import { cancelAnimation, withRepeat } from 'react-native-reanimated';
import HomeSceneLoading from '../HomeSceneLoading';

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

let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let removeAppListener: jest.Mock;
let removeMotionListener: jest.Mock;
let mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };

/** Resolve the platform motion preference without adding an artificial loading timer. */
async function settleMotion(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
  jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions').mockImplementation(() => mockDimensions);
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

test('announces real loading copy without inventing completion or progress', async () => {
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
  expect(screen.getByText('Preparing your home…')).toBeTruthy();
  expect(screen.getByText('Loading the furnished house and landscape.')).toBeTruthy();
  expect(screen.getByTestId('home-scene-loading').props.accessibilityLiveRegion).toBe('polite');
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByLabelText('VantaHome logo')).toBeNull();
});

test('cancels both orbital layers while covered and restarts only after uncovering', async () => {
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  screen.rerender(<HomeSceneLoading active={false} />);
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(withRepeat).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Preparing your home…')).toBeTruthy();
  screen.rerender(<HomeSceneLoading />);
  expect(withRepeat).toHaveBeenCalledTimes(2);
});

test('stops for app backgrounding and removes motion listeners on unmount', async () => {
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
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

test('stays still for reduced motion and responds to changes while loading', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
  expect(withRepeat).not.toHaveBeenCalled();
  expect(screen.getByText('Preparing your home…')).toBeTruthy();
  act(() => onMotionChange(false));
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  act(() => onMotionChange(true));
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
});

test('limits per-frame animation to transforms on separate decorative layers', async () => {
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
  for (const layer of ['home-loading-outer-orbit', 'home-loading-inner-orbit']) {
    const style = StyleSheet.flatten(screen.getByTestId(layer, { includeHiddenElements: true }).props.style);
    expect(style.transform).toBeDefined();
    expect(style.shadowRadius).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  }
});

test('uses compact artwork on short phones without reducing the loading text size', async () => {
  mockDimensions = { width: 320, height: 568, scale: 2, fontScale: 1 };
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
  const artwork = StyleSheet.flatten(screen.getByTestId('home-loading-artwork', { includeHiddenElements: true }).props.style);
  expect(artwork.width).toBe(144);
  expect(artwork.height).toBe(144);
  expect(StyleSheet.flatten(screen.getByText('Preparing your home…').props.style).fontSize).toBe(22);
  expect(screen.getByText('Loading the furnished house and landscape.')).toBeTruthy();
});

test('reclaims decorative space and cancels animation for larger accessibility text', async () => {
  const screen = render(<HomeSceneLoading />);
  await settleMotion();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const cancellations = jest.mocked(cancelAnimation).mock.calls.length;
  mockDimensions = { width: 320, height: 568, scale: 2, fontScale: 2 };
  screen.rerender(<HomeSceneLoading />);
  expect(screen.queryByTestId('home-loading-artwork', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText('VANTAHOME')).toBeNull();
  expect(screen.getByText('Preparing your home…')).toBeTruthy();
  expect(screen.getByText('Loading the furnished house and landscape.')).toBeTruthy();
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(cancellations);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});
