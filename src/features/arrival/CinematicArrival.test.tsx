import React from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import CinematicArrival, { ARRIVAL_FADE_MS, ARRIVAL_SLOW_MS } from './CinematicArrival';
import ArrivalFilm from './ArrivalFilm';

type MockPlayer = {
  play: jest.Mock;
  pause: jest.Mock;
  replaceAsync: jest.Mock;
  addListener: jest.Mock;
  emit: (name: string, payload?: unknown) => void;
  loop: boolean;
  muted: boolean;
  volume: number;
  allowsExternalPlayback: boolean;
  staysActiveInBackground: boolean;
  showNowPlayingNotification: boolean;
  keepScreenOnWhilePlaying: boolean;
  audioMixingMode: string;
};
const mockPlayers: MockPlayer[] = [];
const OPENING_POSTER = require('../../../assets/brand/motion/vantahome-arrival-poster.png');
const COMPLETED_POSTER = require('../../../assets/brand/motion/vantahome-arrival-hold.png');
const mockRevealCallbacks: Array<(finished: boolean) => void> = [];
const mockTiming = jest.fn((value: number, _config: unknown, complete?: (finished: boolean) => void) => {
  if (complete) mockRevealCallbacks.push(complete);
  return value;
});

jest.mock('expo-video', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    VideoView: View,
    useVideoPlayer: (_source: unknown, setup: (player: MockPlayer) => void) => {
      const reference = React.useRef<MockPlayer | null>(null);
      if (!reference.current) {
        const listeners = new Map<string, Set<(event?: unknown) => void>>();
        reference.current = {
          play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn().mockResolvedValue(undefined),
          loop: false, muted: false, volume: 1, allowsExternalPlayback: true, staysActiveInBackground: true,
          showNowPlayingNotification: true, keepScreenOnWhilePlaying: true, audioMixingMode: '',
          addListener: jest.fn((name: string, callback: (event?: unknown) => void) => {
            const group = listeners.get(name) ?? new Set();
            group.add(callback); listeners.set(name, group);
            return { remove: () => group.delete(callback) };
          }),
          emit: (name, payload) => { for (const callback of listeners.get(name) ?? []) callback(payload); },
        };
        setup(reference.current);
        mockPlayers.push(reference.current);
      }
      return reference.current;
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...mock,
    useSharedValue: (value: number) => React.useRef({ value }).current,
    withTiming: (...args: Parameters<typeof mockTiming>) => mockTiming(...args),
    cancelAnimation: jest.fn(),
    runOnJS: (callback: (revision: number) => void) => callback,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 34, left: 0 }) };
});

let onAppChange: (state: AppStateStatus) => void;
let onMotionChange: (enabled: boolean) => void;
let dimensions = { width: 430, height: 932, scale: 3, fontScale: 1 };

/** Settle motion policy and queued local media replacement independently of animation duration. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPlayers.length = 0;
  mockRevealCallbacks.length = 0;
  AppState.currentState = 'active';
  dimensions = { width: 430, height: 932, scale: 3, fontScale: 1 };
  jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions').mockImplementation(() => dimensions);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onAppChange = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, listener) => {
    onMotionChange = listener as unknown as (enabled: boolean) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('keeps one silent player across account, access, and rendering, then loops its hold', async () => {
  const screen = render(<CinematicArrival status="preparing" />);
  await settle();
  const player = mockPlayers[0];
  expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  expect(player).toMatchObject({ muted: true, volume: 0, allowsExternalPlayback: false, staysActiveInBackground: false, showNowPlayingNotification: false, keepScreenOnWhilePlaying: false });
  screen.rerender(<CinematicArrival status="checking" />);
  screen.rerender(<CinematicArrival status="rendering" />);
  await settle();
  expect(mockPlayers).toHaveLength(1);
  expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button')).toBeNull();
  act(() => player.emit('playToEnd'));
  await settle();
  expect(player.replaceAsync).toHaveBeenCalledTimes(2);
  expect(player.loop).toBe(true);
  act(() => player.emit('playToEnd'));
  await settle();
  expect(player.replaceAsync).toHaveBeenCalledTimes(2);
});

test.each(['enter', 'hold'] as const)('readiness fades the current %s without switching clips or waiting for its ending', async (segment) => {
  const covered = jest.fn();
  const screen = render(<CinematicArrival status="rendering" onCoveredChange={covered} />);
  await settle();
  const player = mockPlayers[0];
  if (segment === 'hold') {
    act(() => player.emit('playToEnd'));
    await settle();
  }
  const replacements = player.replaceAsync.mock.calls.length;
  screen.rerender(<CinematicArrival status="ready" onCoveredChange={covered} />);
  expect(mockTiming).toHaveBeenLastCalledWith(0, expect.objectContaining({ duration: ARRIVAL_FADE_MS }), expect.any(Function));
  await settle();
  expect(player.replaceAsync).toHaveBeenCalledTimes(replacements);
  expect(screen.getByTestId('cinematic-arrival')).toBeTruthy();
  expect(covered).toHaveBeenLastCalledWith(true);
  act(() => mockRevealCallbacks.at(-1)?.(true));
  expect(screen.queryByTestId('cinematic-arrival')).toBeNull();
  expect(covered).toHaveBeenLastCalledWith(false);
});

test('a new access check cancels an in-flight reveal and remains fully opaque', async () => {
  const covered = jest.fn();
  const screen = render(<CinematicArrival status="rendering" onCoveredChange={covered} />);
  await settle();
  screen.rerender(<CinematicArrival status="ready" onCoveredChange={covered} />);
  const staleCompletion = mockRevealCallbacks.at(-1);
  screen.rerender(<CinematicArrival status="checking" onCoveredChange={covered} />);
  act(() => staleCompletion?.(true));
  expect(screen.getByTestId('cinematic-arrival')).toHaveStyle({ backgroundColor: '#050612', opacity: 1 });
  expect(covered).toHaveBeenLastCalledWith(true);
});

test('warm returns use a static poster and never replay or delay the introduction', async () => {
  const covered = jest.fn();
  const screen = render(<CinematicArrival status="checking" returning onCoveredChange={covered} />);
  await settle();
  expect(screen.getByText('Welcome back.')).toBeTruthy();
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true }).props.source).toEqual(COMPLETED_POSTER);
  expect(mockPlayers).toHaveLength(0);
  screen.rerender(<CinematicArrival status="ready" onCoveredChange={covered} />);
  expect(screen.queryByTestId('cinematic-arrival')).toBeNull();
  expect(mockTiming).not.toHaveBeenCalled();
  expect(covered).toHaveBeenLastCalledWith(false);
});

test('pauses in background and for reduced motion, without restarting the asset', async () => {
  const screen = render(<CinematicArrival status="checking" />);
  await settle();
  const player = mockPlayers[0];
  player.play.mockClear(); player.pause.mockClear();
  act(() => onAppChange('background'));
  expect(player.pause).toHaveBeenCalled();
  act(() => onAppChange('active'));
  expect(player.play).toHaveBeenCalledTimes(1);
  act(() => onMotionChange(true));
  expect(player.pause).toHaveBeenCalledTimes(2);
  expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  screen.rerender(<CinematicArrival status="ready" />);
  expect(screen.queryByTestId('cinematic-arrival')).toBeNull();
});

test('initial reduced motion keeps the film still and never imposes a reveal delay', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const screen = render(<CinematicArrival status="checking" />);
  await settle();
  expect(mockPlayers).toHaveLength(0);
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true }).props.source).toEqual(COMPLETED_POSTER);
  screen.rerender(<CinematicArrival status="ready" />);
  expect(screen.queryByTestId('cinematic-arrival')).toBeNull();
  expect(mockTiming).not.toHaveBeenCalled();
});

test('keeps the shell while motion policy is unknown, then honors a newer reduced-motion preference', async () => {
  let resolveInitialPreference: ((reduced: boolean) => void) | undefined;
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => new Promise<boolean>((resolve) => { resolveInitialPreference = resolve; }));
  const screen = render(<CinematicArrival status="checking" />);
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true }).props.source).toEqual(OPENING_POSTER);
  expect(mockPlayers).toHaveLength(0);
  act(() => onMotionChange(true));
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true }).props.source).toEqual(COMPLETED_POSTER);
  await act(async () => { resolveInitialPreference?.(false); });
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true }).props.source).toEqual(COMPLETED_POSTER);
  expect(mockPlayers).toHaveLength(0);
});

test('slow context spans loading phases and never offers controls before verified rendering', async () => {
  const showControls = jest.fn();
  const screen = render(<CinematicArrival status="preparing" onShowControls={showControls} />);
  await settle();
  act(() => jest.advanceTimersByTime(5_000));
  screen.rerender(<CinematicArrival status="checking" onShowControls={showControls} />);
  act(() => jest.advanceTimersByTime(ARRIVAL_SLOW_MS - 5_000));
  expect(screen.getByText('Verifying home access…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open device controls' })).toBeNull();
  screen.rerender(<CinematicArrival status="rendering" onShowControls={showControls} />);
  fireEvent.press(screen.getByRole('button', { name: 'Open device controls' }));
  expect(showControls).toHaveBeenCalledTimes(1);
});

test('failures show truthful recovery and disable duplicate actions while signing out', async () => {
  const retry = jest.fn();
  const signOut = jest.fn();
  const screen = render(<CinematicArrival status="unavailable" onRetry={retry} onSignOut={signOut} statusMessage="Unable to prepare this device." statusDescription="Try preparing your account again." />);
  await settle();
  expect(screen.getByText('Unable to prepare this device.')).toBeTruthy();
  expect(screen.getByText('Try preparing your account again.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledTimes(1);
  screen.rerender(<CinematicArrival status="unavailable" onRetry={retry} onSignOut={signOut} signingOut signOutError="Please try signing out again." />);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Please try signing out again.');
  expect(mockPlayers).toHaveLength(0);
});

test('a video error falls back to still artwork and cannot trap a ready app', async () => {
  const screen = render(<CinematicArrival status="rendering" />);
  await settle();
  const player = mockPlayers[0];
  act(() => player.emit('statusChange', { status: 'error' }));
  expect(player.pause).toHaveBeenCalled();
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByTestId('arrival-completed-poster', { includeHiddenElements: true }).props.source).toEqual(COMPLETED_POSTER);
  screen.rerender(<CinematicArrival status="ready" />);
  act(() => mockRevealCallbacks.at(-1)?.(true));
  expect(screen.queryByTestId('cinematic-arrival')).toBeNull();
});

test('poster load, error, inactive fast-path and timeout all release the native splash once', async () => {
  const ready = jest.fn();
  const screen = render(<CinematicArrival status="preparing" onPosterReady={ready} />);
  await settle();
  fireEvent(screen.getByTestId('arrival-poster', { includeHiddenElements: true }), 'load');
  fireEvent(screen.getByTestId('arrival-poster', { includeHiddenElements: true }), 'error');
  act(() => jest.advanceTimersByTime(1_500));
  expect(ready).toHaveBeenCalledTimes(1);
  screen.unmount();
  const inactiveReady = jest.fn();
  render(<CinematicArrival status="inactive" onPosterReady={inactiveReady} />);
  await settle();
  expect(inactiveReady).toHaveBeenCalledTimes(1);
  const timeoutReady = jest.fn();
  render(<CinematicArrival status="checking" onPosterReady={timeoutReady} />);
  await settle();
  act(() => jest.advanceTimersByTime(1_500));
  expect(timeoutReady).toHaveBeenCalledTimes(1);
});

test('native first-frame can arrive before source replacement resolves without hiding the film forever', async () => {
  const screen = render(<ArrivalFilm motionAllowed />);
  let completeReplacement: (() => void) | undefined;
  mockPlayers[0].replaceAsync.mockImplementation(() => new Promise<void>((resolve) => { completeReplacement = resolve; }));
  await settle();
  const video = screen.getByTestId('arrival-video', { includeHiddenElements: true });
  fireEvent(video, 'firstFrameRender');
  expect(screen.getByTestId('arrival-video', { includeHiddenElements: true })).not.toHaveStyle({ opacity: 0 });
  await act(async () => { completeReplacement?.(); });
  expect(mockPlayers[0].play).toHaveBeenCalled();
});

test('preloads the completed still and shows it until the hold clip renders its own first frame', async () => {
  const screen = render(<ArrivalFilm motionAllowed />);
  await settle();
  expect(screen.getByTestId('arrival-completed-poster', { includeHiddenElements: true })).toHaveStyle({ opacity: 0 });
  fireEvent(screen.getByTestId('arrival-video', { includeHiddenElements: true }), 'firstFrameRender');
  expect(screen.getByTestId('arrival-video', { includeHiddenElements: true })).not.toHaveStyle({ opacity: 0 });
  act(() => mockPlayers[0].emit('playToEnd'));
  await settle();
  expect(mockPlayers[0].replaceAsync).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('arrival-completed-poster', { includeHiddenElements: true })).not.toHaveStyle({ opacity: 0 });
  expect(screen.getByTestId('arrival-video', { includeHiddenElements: true })).toHaveStyle({ opacity: 0 });
  fireEvent(screen.getByTestId('arrival-video', { includeHiddenElements: true }), 'firstFrameRender');
  expect(screen.getByTestId('arrival-video', { includeHiddenElements: true })).not.toHaveStyle({ opacity: 0 });
});

test.each([{ width: 320, height: 568, fontScale: 2 }, { width: 1180, height: 820, fontScale: 1 }])('keeps recovery reachable with layout %p', async (viewport) => {
  dimensions = { ...dimensions, ...viewport };
  const screen = render(<CinematicArrival status="unavailable" onRetry={jest.fn()} onSignOut={jest.fn()} />);
  await settle();
  expect(screen.getByRole('button', { name: 'Retry' })).toHaveStyle({ minHeight: 48 });
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  expect(screen.getByTestId('arrival-poster', { includeHiddenElements: true }).props.resizeMode).toBe('contain');
});
