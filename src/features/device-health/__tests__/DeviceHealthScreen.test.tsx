import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHomeStore } from '../../../store/useHomeStore';
import DeviceHealthScreen from '../DeviceHealthScreen';
import { DeviceHealthView } from '../DeviceHealthView';
import { DeviceHealthDetails } from '../DeviceHealthDetails';
import { healthFixture, healthSnapshot } from './healthFixtures';

jest.mock('../../../config/runtimeMode', () => ({ runtimePolicy: { mode: 'production' } }));
jest.mock('../../../services/supabaseClient', () => ({ supabase: null }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../../features/cinematic-artwork/CinematicCardArtwork', () => () => null);
jest.mock('../../../components/DeviceIcon', () => () => null);
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../../../components/ScrollableCardPages', () => ({ page, renderPage }: { page: number; renderPage: (page: number) => React.ReactNode }) => renderPage(page));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../three-d-home/useControllerFocused', () => ({ useControllerFocused: () => mockFocused }));
jest.mock('../../three-d-home/useSimulationControls', () => ({ useSimulationControls: () => mockSnapshot }));

let mockFocused = true;
const mockRetry = jest.fn();
let mockSnapshot = { state: healthSnapshot(), ready: true, status: 'saved', reconnect: mockRetry };
const seed = useHomeStore.getState();
const oldAppState = AppState.currentState;
const listeners = new Set<(state: AppStateStatus) => void>();
const navigation = { navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn(), canGoBack: () => true, isFocused: () => mockFocused };

/** Render the real scoped health session with read-only simulated delivery and no command client. */
function openHealth() { return render(<DeviceHealthScreen navigation={navigation as never} route={{ key: 'health', name: 'DeviceHealth' }} />); }

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockFocused = true; AppState.currentState = 'active'; listeners.clear();
  mockSnapshot = { state: healthSnapshot(), ready: true, status: 'saved', reconnect: mockRetry };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { listeners.add(listener); return { remove: () => { listeners.delete(listener); } }; });
  useHomeStore.setState(healthFixture(), true);
});
afterEach(() => { cleanup(); useHomeStore.setState(seed, true); AppState.currentState = oldAppState; jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('examples and details remain view-only and End examples restores the original samples', () => {
  const before = useHomeStore.getState(); const saved = JSON.stringify(mockSnapshot.state); const screen = openHealth();
  jest.mocked(AsyncStorage.setItem).mockClear();
  fireEvent.press(screen.getByLabelText('Try example alerts'));
  expect(screen.getByText('Example alerts are on. Your saved home is untouched.')).toBeTruthy();
  const view = screen.UNSAFE_getByType(DeviceHealthView);
  const sample = view.props.entries.find((entry: { source: string }) => entry.source === 'sample');
  act(() => view.props.onSelect(sample.id));
  expect(screen.getByText('EXAMPLE ALERT · LOCAL ONLY')).toBeTruthy();
  expect(screen.queryByLabelText('Open device controls')).toBeNull();
  fireEvent.press(screen.getByLabelText('Back to Device Health'));
  fireEvent.press(screen.getByLabelText('End example alerts'));
  expect(screen.UNSAFE_getByType(DeviceHealthView).props.entries.some((entry: { source: string }) => entry.source === 'sample')).toBe(false);
  expect(useHomeStore.getState()).toBe(before); expect(JSON.stringify(mockSnapshot.state)).toBe(saved);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled(); expect(navigation.navigate).not.toHaveBeenCalled();
});

test('search and filters change only the displayed collection', () => {
  const screen = openHealth();
  fireEvent.changeText(screen.getByLabelText('Search device health by device or room'), 'not-a-device');
  expect(screen.getByText('Nothing in this view')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Search device health by device or room'), 'vacuum');
  expect(screen.getByLabelText(/vacuum fixture.*View health details/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/vacuum fixture.*View health details/));
  expect(screen.getByText('80% · simulation sample')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Open device controls'));
  expect(navigation.navigate).toHaveBeenCalledWith('DeviceDetail', { deviceId: 'registry-vacuum' });
});

test.each([{ accountHomeId: 'other' }, { authenticatedUserId: null }, { membershipReady: false }, { authTaskBlockingHome: true }])('revocation %j hides details and rejects held callbacks', (patch) => {
  const screen = openHealth(); const oldView = screen.UNSAFE_getByType(DeviceHealthView).props;
  act(() => oldView.onSelect('registry-vacuum'));
  const held = screen.UNSAFE_getByType(DeviceHealthDetails).props.onOpen;
  act(() => { useHomeStore.setState(patch); held(); oldView.onExamples(); oldView.onSelect('registry-light'); });
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen.queryByText('vacuum fixture')).toBeNull();
  expect(screen.getByText('Device Health unavailable')).toBeTruthy();
});

test('same-user home change clears examples and detail selection instead of transferring them', () => {
  const screen = openHealth(); fireEvent.press(screen.getByLabelText('Try example alerts'));
  act(() => screen.UNSAFE_getByType(DeviceHealthView).props.onSelect('registry-vacuum'));
  act(() => { useHomeStore.setState({ accountHomeId: 'next-home', activeHomeId: 'next-home' }); });
  expect(screen.queryByText('EXAMPLE ALERT · LOCAL ONLY')).toBeNull();
  expect(screen.getByLabelText('Try example alerts')).toBeTruthy();
});

test('Guest expiry hides private cards without needing a store update', () => {
  const state = healthFixture('Guest'); state.roomMembers = [{ memberId: 'person', roomIds: [state.devices[0].roomId] }];
  state.household[0].accessExpiresAt = new Date(Date.now() + 1000).toISOString();
  useHomeStore.setState(state, true); const screen = openHealth();
  expect(screen.queryByText('Device Health unavailable')).toBeNull();
  act(() => jest.advanceTimersByTime(1001));
  expect(screen.getByText('Device Health unavailable')).toBeTruthy();
});

test('background and navigation blur discard examples and block remembered control navigation', () => {
  const screen = openHealth(); act(() => screen.UNSAFE_getByType(DeviceHealthView).props.onSelect('registry-vacuum'));
  const held = screen.UNSAFE_getByType(DeviceHealthDetails).props.onOpen;
  act(() => { AppState.currentState = 'background'; listeners.forEach((listener) => listener('background')); held(); });
  expect(screen.getByTestId('device-health-hidden')).toBeTruthy(); expect(navigation.navigate).not.toHaveBeenCalled();
  act(() => { AppState.currentState = 'active'; listeners.forEach((listener) => listener('active')); });
  expect(screen.queryByText('80% · simulation sample')).toBeNull();
  fireEvent.press(screen.getByLabelText('Try example alerts'));
  mockFocused = false; screen.rerender(<DeviceHealthScreen navigation={navigation as never} route={{ key: 'health', name: 'DeviceHealth' }} />);
  expect(screen.getByTestId('device-health-hidden')).toBeTruthy();
  mockFocused = true; screen.rerender(<DeviceHealthScreen navigation={navigation as never} route={{ key: 'health', name: 'DeviceHealth' }} />);
  expect(screen.getByLabelText('Try example alerts')).toBeTruthy();
});

test('loading and recovery do not populate invented health values', () => {
  mockSnapshot = { ...mockSnapshot, ready: false, status: 'loading' }; const screen = openHealth();
  expect(screen.getByText('Reading your model')).toBeTruthy(); expect(screen.queryByText('80% · simulation sample')).toBeNull();
  mockSnapshot = { ...mockSnapshot, status: 'corrupt' }; screen.rerender(<DeviceHealthScreen navigation={navigation as never} route={{ key: 'health', name: 'DeviceHealth' }} />);
  fireEvent.press(screen.getByLabelText('Retry health samples')); expect(mockRetry).toHaveBeenCalledTimes(1);
});
