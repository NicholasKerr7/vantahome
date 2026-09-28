import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, render } from '@testing-library/react-native';
import { cancelAnimation, withRepeat } from 'react-native-reanimated';
import CinematicSurface from '../CinematicSurface';

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  const React = jest.requireActual<typeof import('react')>('react');
  return { ...mock, useSharedValue: (value: number) => React.useRef({ value }).current,
    withTiming: jest.fn((value: number) => value), withRepeat: jest.fn((value: number) => value), cancelAnimation: jest.fn() };
});
let appChange: (state: AppStateStatus) => void;
let motionChange: (enabled: boolean) => void;

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appChange = listener; return { remove: jest.fn() };
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    motionChange = listener as unknown as (enabled: boolean) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

/** Settle the asynchronous system preference without running any animation timers. */
async function settle() { await act(async () => { await Promise.resolve(); }); }

test('retained quiet surfaces remain still and active orbital decoration stops on blur', async () => {
  const screen = render(<CinematicSurface active />);
  await settle();
  expect(withRepeat).not.toHaveBeenCalled();
  screen.rerender(<CinematicSurface variant="orbit" active />);
  await settle();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  const before = jest.mocked(cancelAnimation).mock.calls.length;
  screen.rerender(<CinematicSurface variant="orbit" active={false} />);
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThan(before);
  expect(withRepeat).toHaveBeenCalledTimes(1);
});

test('backgrounding and live reduced-motion preferences stop the active animation', async () => {
  render(<CinematicSurface variant="orbit" active />);
  await settle();
  expect(withRepeat).toHaveBeenCalledTimes(1);
  act(() => appChange('background'));
  const stopped = jest.mocked(cancelAnimation).mock.calls.length;
  act(() => motionChange(true));
  act(() => appChange('active'));
  expect(withRepeat).toHaveBeenCalledTimes(1);
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThanOrEqual(stopped);
  act(() => motionChange(false));
  expect(withRepeat).toHaveBeenCalledTimes(2);
});
