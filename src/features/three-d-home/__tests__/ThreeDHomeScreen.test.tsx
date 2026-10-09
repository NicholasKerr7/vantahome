import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ThreeDHomeScreen from '../../../screens/ThreeDHomeScreen';
import type { SceneSurfaceProps } from '../protocol';
import { CommandActivityContext } from '../../../components/command-feedback/CommandActivityContext';
import { SCENE_RETENTION_MS } from '../useRetainedScene';
import { useHomeStore } from '../../../store/useHomeStore';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
let mockFocused = true;
let mockStatus: SceneSurfaceProps['onStatus'];
let mockSceneProps: SceneSurfaceProps;
const originalAppState = AppState.currentState;
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate, dispatch: mockDispatch }), useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
// Decorative motion has separate lifecycle coverage; keep navigation tests synchronous.
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../SceneSurface', () => ({ __esModule: true, default: (props: SceneSurfaceProps) => {
  const Text = require('react-native').Text;
  mockStatus = props.onStatus;
  mockSceneProps = props;
  return <Text testID="scene-surface">Packaged scene</Text>;
} }));

beforeEach(() => { AppState.currentState = 'active'; mockFocused = true; mockGoBack.mockClear(); mockNavigate.mockClear(); mockDispatch.mockClear(); jest.useFakeTimers(); });
afterEach(() => { AppState.currentState = originalAppState; jest.useRealTimers(); jest.restoreAllMocks(); });

test('keeps the simulation boundary and main feature menu available during load', () => {
  const screen = render(<ThreeDHomeScreen />);
  expect(screen.getByLabelText('VantaHome. Simulation, no real device control')).toBeTruthy();
  expect(screen.getByText('Opening your property…')).toBeTruthy();
  expect(screen.queryByLabelText('Back to dashboard')).toBeNull();
  fireEvent.press(screen.getByLabelText('Scenes'));
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'NAVIGATE', payload: { name: 'Main', params: { screen: 'Scenes', pop: true }, pop: true } }));
  act(() => mockStatus('ready'));
  expect(screen.queryByText('Opening your property…')).toBeNull();
});

test('keeps one header and sends weather actions only after the current scene is ready', () => {
  const screen = render(<ThreeDHomeScreen />);
  expect(screen.getAllByTestId('unified-home-header')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText(/Property time and weather:/));
  expect(mockSceneProps.chromeCommand).toBeUndefined();
  act(() => mockStatus('ready'));
  act(() => mockSceneProps.onChromeSnapshot?.({ locationName: 'Property', localTime: '12:05 PM', tempC: 25, weatherCode: 0, weatherStatus: 'live',
    isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: true, preferenceError: false }));
  fireEvent.press(screen.getByLabelText(/Property time and weather:/));
  expect(mockSceneProps.chromeCommand).toMatchObject({ id: 1, command: { type: 'open-environment' } });
  act(() => mockStatus('error'));
  fireEvent.press(screen.getByLabelText('Retry 3D Home'));
  expect(mockSceneProps.chromeCommand).toBeUndefined();
  expect(screen.getByLabelText('Open voice control')).toBeTruthy();
  expect(screen.getByLabelText(/Open account:/)).toBeTruthy();
});

test('opens integrations and household tools from the home menu', () => {
  const screen = render(<ThreeDHomeScreen />);
  fireEvent.press(screen.getByLabelText('Open home menu'));
  fireEvent.press(screen.getByText('Connections'));
  fireEvent.press(screen.getByLabelText('Integrations'));
  expect(mockNavigate).toHaveBeenCalledWith('Integrations');
  fireEvent.press(screen.getByLabelText('Open home menu'));
  fireEvent.press(screen.getByText('House'));
  for (let page = 0; page < 3 && !screen.queryByLabelText('Household'); page += 1) {
    fireEvent.press(screen.getByLabelText('Next menu destinations'));
  }
  fireEvent.press(screen.getByLabelText('Household'));
  expect(mockNavigate).toHaveBeenCalledWith('Profile', { section: 'household' });
});
test('ignores late header and status callbacks from a replaced renderer', () => {
  const screen = render(<ThreeDHomeScreen />);
  const oldSurface = mockSceneProps;
  act(() => mockStatus('error'));
  fireEvent.press(screen.getByLabelText('Retry 3D Home'));
  act(() => mockStatus('ready'));
  const snapshot = { locationName: 'Current property', localTime: '12:05 PM', tempC: 25, weatherCode: 0, weatherStatus: 'live' as const,
    isNight: false, motionDisabled: false, systemReducedMotion: false, idleEnabled: true, preferenceError: false };
  act(() => mockSceneProps.onChromeSnapshot?.(snapshot));
  act(() => {
    oldSurface.onChromeSnapshot?.({ ...snapshot, locationName: 'Old property' });
    oldSurface.onStatus('error');
  });
  expect(screen.getByText('Current property')).toBeTruthy();
  expect(screen.queryByText('Old property')).toBeNull();
  fireEvent.press(screen.getByLabelText(/Property time and weather:/));
  expect(mockSceneProps.chromeCommand?.command).toEqual({ type: 'open-environment' });
});
test('pauses covered graphics without replacing the loaded scene and resumes on dismissal', () => {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockStatus('ready'));
  const loadedSurface = screen.getByTestId('scene-surface');
  expect(mockSceneProps.suspended).toBe(false);
  fireEvent.press(screen.getByLabelText('Open home menu'));
  expect(mockSceneProps.suspended).toBe(true);
  expect(screen.getByTestId('scene-surface')).toBe(loadedSurface);
  fireEvent.press(screen.getByLabelText('Close home menu'));
  expect(mockSceneProps.suspended).toBe(false);
  expect(screen.queryByText('Opening your property…')).toBeNull();
});
test('keeps the loaded scene paused until the global command activity dialog closes', () => {
  const launcher = { open: jest.fn(), count: 0, visible: false };
  const screen = render(<CommandActivityContext.Provider value={launcher}><ThreeDHomeScreen /></CommandActivityContext.Provider>);
  act(() => mockStatus('ready'));
  const loadedSurface = screen.getByTestId('scene-surface');
  screen.rerender(<CommandActivityContext.Provider value={{ ...launcher, visible: true }}><ThreeDHomeScreen /></CommandActivityContext.Provider>);
  expect(mockSceneProps.suspended).toBe(true);
  expect(screen.getByTestId('scene-surface')).toBe(loadedSurface);
  screen.rerender(<CommandActivityContext.Provider value={launcher}><ThreeDHomeScreen /></CommandActivityContext.Provider>);
  expect(mockSceneProps.suspended).toBe(false);
  expect(screen.getByTestId('scene-surface')).toBe(loadedSurface);
  expect(screen.queryByText('Opening your property…')).toBeNull();
});
test('recovers from renderer errors and slow loads with a fresh scene', () => {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockStatus('error'));
  expect(screen.queryByTestId('scene-surface')).toBeNull();
  fireEvent.press(screen.getByLabelText('Retry 3D Home'));
  expect(screen.getByTestId('scene-surface')).toBeTruthy();
  act(() => jest.advanceTimersByTime(90_000));
  expect(screen.getByText('The 3D view couldn’t load')).toBeTruthy();
});
test('preserves a paused scene during short background visits and releases graphics after a bounded absence', () => {
  const listeners: ((state: string) => void)[] = [];
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') listeners.push(listener as (state: string) => void);
    return { remove };
  });
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockStatus('ready'));
  const scene = screen.getByTestId('scene-surface');
  act(() => listeners.forEach((listener) => listener('inactive')));
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  act(() => listeners.forEach((listener) => listener('background')));
  expect(mockSceneProps.suspended).toBe(true);
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  act(() => listeners.forEach((listener) => listener('active')));
  expect(mockSceneProps.suspended).toBe(false);
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  expect(screen.queryByText('Opening your property…')).toBeNull();
  mockFocused = false;
  screen.rerender(<ThreeDHomeScreen />);
  expect(mockSceneProps.suspended).toBe(true);
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  act(() => jest.advanceTimersByTime(SCENE_RETENTION_MS));
  expect(screen.queryByTestId('scene-surface')).toBeNull();
  screen.unmount();
  expect(remove).toHaveBeenCalledTimes(3);
});

test('a same-account recheck retains paused graphics and closes the native menu until fresh verification', () => {
  const original = useHomeStore.getState();
  const verified = { ...original, accountUserId: 'warm-person', authenticatedUserId: 'warm-person', accountHomeId: 'warm-home',
    activeHomeId: 'warm-home', activeMemberId: 'warm-person', membershipReady: true,
    household: [{ id: 'warm-person', name: 'Person', role: 'Owner' as const, status: 'home' as const }] };
  useHomeStore.setState(verified);
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockStatus('ready'));
  const scene = screen.getByTestId('scene-surface');
  fireEvent.press(screen.getByLabelText('Open home menu'));
  expect(screen.getByLabelText('Close home menu')).toBeTruthy();
  act(() => { useHomeStore.setState({ membershipReady: false, household: [], activeMemberId: '', activeHomeId: null }); });
  expect(screen.queryByLabelText('Close home menu')).toBeNull();
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  expect(mockSceneProps.suspended).toBe(true);
  act(() => { useHomeStore.setState(verified); });
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  expect(mockSceneProps.suspended).toBe(false);
  expect(screen.queryByText('Opening your property…')).toBeNull();
  screen.unmount();
  useHomeStore.setState(original, true);
});
