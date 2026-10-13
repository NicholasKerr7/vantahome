import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import LiveVideoPlayer from '../LiveVideoPlayer';

const handlers: Record<string, ((event: never) => void)[]> = {};
const player = {
  status: 'loading', playing: false, play: jest.fn(), pause: jest.fn(),
  addListener: jest.fn((name: string, callback: (event: never) => void) => {
    (handlers[name] ??= []).push(callback);
    return { remove: jest.fn(() => { handlers[name] = handlers[name].filter((item) => item !== callback); }) };
  }),
};
/** Deliver installed expo-video events without fetching private media. */
function emit(name: string, event: unknown) { act(() => handlers[name]?.forEach((handler) => handler(event as never))); }
beforeEach(() => {
  jest.useFakeTimers();
  Object.keys(handlers).forEach((key) => delete handlers[key]);
  jest.mocked(useVideoPlayer).mockReturnValue(player as unknown as ReturnType<typeof useVideoPlayer>);
  player.pause.mockClear();
  player.play.mockClear();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('only shows playback after readiness, playing, and an actual frame', () => {
  const screen = render(<LiveVideoPlayer sourceUri="https://example.com/camera" />);
  expect(screen.getByText('Connecting to camera')).toBeTruthy();
  emit('statusChange', { status: 'readyToPlay' });
  emit('playingChange', { isPlaying: true });
  expect(screen.queryByText('Playing feed')).toBeNull();
  fireEvent(screen.UNSAFE_getByType(VideoView), 'firstFrameRender');
  expect(screen.getByText('Playing feed')).toBeTruthy();
  emit('statusChange', { status: 'error', error: { message: 'private URL must never be displayed' } });
  expect(screen.getByText('Live feed unavailable')).toBeTruthy();
  expect(screen.queryByText('Playing feed')).toBeNull();
  expect(screen.queryByText(/private URL/)).toBeNull();
  fireEvent.press(screen.getByLabelText('Retry camera feed'));
  expect(screen.getByText('Connecting to camera')).toBeTruthy();
});

test('a hung stream stops and offers retry rather than spinning forever', () => {
  const screen = render(<LiveVideoPlayer sourceUri="https://example.com/camera" />);
  act(() => jest.advanceTimersByTime(20_000));
  expect(player.pause).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Retry camera feed')).toBeTruthy();
});

test('backgrounding releases the private player and its listeners', () => {
  let lifecycle: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, listener) => {
    lifecycle = listener; return { remove: jest.fn() };
  });
  const screen = render(<LiveVideoPlayer sourceUri="https://example.com/camera" />);
  act(() => lifecycle('background'));
  expect(screen.queryByLabelText('Expand camera feed')).toBeNull();
  expect(handlers.statusChange).toHaveLength(0);
  expect(player.pause).toHaveBeenCalledTimes(1);
});

test('starts playback after the media view mounts and pauses before releasing it', () => {
  let renderedView = false;
  const originalRender = jest.mocked(VideoView).prototype.render;
  const mountedPlayStates: boolean[] = [];
  jest.spyOn(jest.mocked(VideoView).prototype, 'render').mockImplementation(function (this: VideoView) {
    renderedView = true;
    return originalRender.call(this);
  });
  player.play.mockImplementation(() => { mountedPlayStates.push(renderedView); });
  jest.mocked(useVideoPlayer).mockImplementation((_source, setup) => {
    const instance = player as unknown as ReturnType<typeof useVideoPlayer>;
    setup?.(instance);
    return instance;
  });
  const screen = render(<LiveVideoPlayer sourceUri="https://example.com/camera" />);
  expect(mountedPlayStates).toEqual([true]);
  screen.unmount();
  expect(player.pause).toHaveBeenCalledTimes(1);
});

test('does not offer inert expansion and retains an explicitly labelled picture-in-picture action', () => {
  const screen = render(<LiveVideoPlayer sourceUri="https://example.com/camera" enableFullscreen={false} />);
  expect(screen.queryByLabelText('Expand camera feed')).toBeNull();
  expect(screen.getByLabelText('Open picture in picture')).toBeTruthy();
  screen.rerender(<LiveVideoPlayer sourceUri="https://example.com/camera" enableFullscreen={false} enablePiP={false} />);
  expect(screen.queryByLabelText('Expand camera feed')).toBeNull();
  expect(screen.queryByLabelText('Open picture in picture')).toBeNull();
});

test('a routed expansion remains available when native fullscreen is disabled', () => {
  const expand = jest.fn();
  const screen = render(<LiveVideoPlayer sourceUri="https://example.com/camera" enableFullscreen={false} onFullscreen={expand} />);
  fireEvent.press(screen.getByLabelText('Expand camera feed'));
  expect(expand).toHaveBeenCalledTimes(1);
});
