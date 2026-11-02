import React from 'react';
import { AppState, Modal, type AppStateStatus } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import IntegrationsScreen from '../../../screens/IntegrationsScreen';
import { useHomeStore } from '../../../store/useHomeStore';
import { HubPreparation } from '../../integrations/HubPreparation';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../../services/supabaseClient', () => ({ supabase: null }));
jest.mock('../../../config/runtimeMode', () => ({ runtimePolicy: { mode: 'demo', allowUnauthenticatedDemo: true, allowDirectMqtt: false } }));
jest.mock('../../integrations/voiceLinkService', () => ({ getVoiceLinkConfiguration: () => null, linkVoiceAccount: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

const originalState = useHomeStore.getState();
const originalApplicationState = AppState.currentState;
let applicationStateChanged: (state: AppStateStatus) => void;

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    applicationStateChanged = listener;
    return { remove: jest.fn() };
  });
  useHomeStore.setState({ ...originalState,
    accountUserId: 'preview-owner', authenticatedUserId: 'preview-owner', accountHomeId: 'preview-home', activeHomeId: 'preview-home',
    activeMemberId: 'preview-owner', membershipReady: true, authTaskBlockingHome: false,
    household: [{ id: 'preview-owner', userId: 'preview-owner', name: 'Preview owner', role: 'Owner', status: 'home' }],
    memberPermissionOverrides: [], realtime: { ...originalState.realtime, enabled: false, useMqtt: false },
  }, true);
  jest.mocked(AsyncStorage.setItem).mockClear();
});

afterEach(() => {
  cleanup();
  useHomeStore.setState(originalState, true);
  AppState.currentState = originalApplicationState;
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Open the real preparation entry so lifecycle tests include its conditional mounting and return path. */
function openSample() {
  const screen = render(<HubPreparation onClose={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Try a sample light connection'));
  return screen;
}

/** Change one sample fixture through More and return through the actual console navigation. */
function selectSampleOption(screen: ReturnType<typeof render>, label: string): void {
  fireEvent.press(screen.getByLabelText('More lighting controls'));
  fireEvent.press(screen.getByLabelText(label));
  fireEvent.press(screen.getByLabelText('Back to sample light'));
}

/** Advance bounded sample delivery while flushing the subscribed React presentation. */
function advance(milliseconds: number): void {
  act(() => { jest.advanceTimersByTime(milliseconds); });
}

/** Verify artwork opacity across the real rehearsal-to-shared-view adapter boundary. */
function emission(screen: ReturnType<typeof render>): unknown {
  return screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) =>
    node.props.testID === 'lighting-preview-emission' && Object.hasOwn(node.props, 'opacity'))[0].props.opacity;
}

test('the Integrations → Vanta Bridge → preparation path rehearses a command without writing home, device, scene or persistent state', () => {
  const before = useHomeStore.getState();
  const savedData = JSON.stringify({ devices: before.devices, scenes: before.scenes, rules: before.rules, flows: before.flows, integrations: before.integrations });
  const changed = jest.fn();
  const unsubscribe = useHomeStore.subscribe(changed);
  const navigation = { navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
  const screen = render(<IntegrationsScreen navigation={navigation as never} route={{ key: 'integrations', name: 'Integrations' }} />);
  try {
    fireEvent.press(screen.getByLabelText('Vanta Bridge'));
    fireEvent.press(screen.getByLabelText('Prepare home hub'));
    fireEvent.press(screen.getByLabelText('Try a sample light connection'));
    expect(screen.getByText('Try a sample light')).toBeTruthy();
    expect(screen.getByText('Dimmable sample · No hub connected · Your home stays unchanged')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Turn light on'));
    expect(screen.getByText('Sending sample command')).toBeTruthy();
    expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
    expect(emission(screen)).toBe(0);
    advance(200);
    expect(screen.getByText('Waiting for a sample report')).toBeTruthy();
    expect(screen.getByLabelText('Turn light on').props.accessibilityState.disabled).toBe(true);
    expect(emission(screen)).toBe(0);
    advance(800);
    expect(screen.getByText('Sample state confirmed')).toBeTruthy();
    expect(screen.getByLabelText('Brightness 50 percent. Light on')).toBeTruthy();
    expect(emission(screen)).toBe(0.5);
    fireEvent.press(screen.getByLabelText('Close sample light'));
    expect(screen.getByText('Your preview is ready')).toBeTruthy();
    expect(useHomeStore.getState()).toBe(before);
    expect(JSON.stringify({ devices: before.devices, scenes: before.scenes, rules: before.rules, flows: before.flows, integrations: before.integrations })).toBe(savedData);
    expect(changed).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});

test('profile changes hide unsupported controls, retain More/Back, filter white presets, and scale power-only emission correctly', () => {
  const screen = openSample();
  expect(screen.getByLabelText('Dim light by 5 percent')).toBeTruthy();
  expect(screen.queryByLabelText('Light mode')).toBeNull();
  selectSampleOption(screen, 'Power only');
  expect(screen.getByText('Off')).toBeTruthy();
  expect(screen.queryByLabelText('Dim light by 5 percent')).toBeNull();
  expect(screen.queryByLabelText('White temperature presets')).toBeNull();
  expect(screen.queryByLabelText('Light color presets')).toBeNull();
  fireEvent.press(screen.getByLabelText('Turn light on'));
  advance(1000);
  expect(screen.getByText('On')).toBeTruthy();
  expect(screen.queryByText('100%')).toBeNull();
  expect(emission(screen)).toBe(1);
  selectSampleOption(screen, 'Full color');
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  expect(screen.getByLabelText('Light mode')).toBeTruthy();
  expect(screen.queryByLabelText('Warm white: 2400 kelvin')).toBeNull();
  expect(screen.getByLabelText('Soft white: 3000 kelvin')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Color light mode'));
  advance(1000);
  expect(screen.getByLabelText('Lavender light color')).toBeTruthy();
  expect(screen.queryByLabelText('White temperature presets')).toBeNull();
  selectSampleOption(screen, 'Dimmable');
  expect(screen.getByLabelText('Brighten light by 5 percent')).toBeTruthy();
  expect(screen.queryByLabelText('Light mode')).toBeNull();
  expect(screen.queryByLabelText('Light color presets')).toBeNull();
});

test.each(['close button', 'system dismissal'] as const)('closing a pending sample via %s cancels it and reopening starts fresh', (method) => {
  const screen = openSample();
  selectSampleOption(screen, 'Slow reply');
  fireEvent.press(screen.getByLabelText('Turn light on'));
  advance(200);
  expect(screen.getByText('Waiting for a sample report')).toBeTruthy();
  if (method === 'close button') fireEvent.press(screen.getByLabelText('Close sample light'));
  else act(() => { screen.UNSAFE_getByType(Modal).props.onRequestClose(); });
  expect(screen.getByText('Your preview is ready')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Try a sample light connection'));
  expect(screen.getByText('Ready to try')).toBeTruthy();
  advance(10000);
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  expect(screen.getByText('Ready to try')).toBeTruthy();
  expect(emission(screen)).toBe(0);
  fireEvent.press(screen.getByLabelText('More lighting controls'));
  expect(screen.getByLabelText('Normal').props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Dimmable').props.accessibilityState.checked).toBe(true);
});

test.each(['Owner', 'Admin', 'Member', 'Guest', 'Tenant'] as const)('only current administrator role %s receives the preparation sample entry', (role) => {
  useHomeStore.setState({ household: useHomeStore.getState().household.map((member) => ({ ...member, role })) });
  const screen = render(<HubPreparation onClose={jest.fn()} />);
  const entry = screen.queryByLabelText('Try a sample light connection');
  if (role === 'Owner' || role === 'Admin') {
    expect(entry).toBeTruthy();
    fireEvent.press(entry!);
    expect(screen.getByTestId('lighting-tactile-controller')).toBeTruthy();
  } else expect(entry).toBeNull();
});

test('demo administration is allowed only when runtime mode explicitly identifies the unbound demo', () => {
  useHomeStore.setState({ accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null });
  const screen = openSample();
  expect(screen.getByTestId('lighting-tactile-controller')).toBeTruthy();
});

test('membership loss dismisses pending work and restoring access does not reopen the previous session', () => {
  const screen = openSample();
  fireEvent.press(screen.getByLabelText('Turn light on'));
  advance(200);
  act(() => { useHomeStore.setState({ membershipReady: false }); });
  expect(screen.queryByTestId('lighting-tactile-controller')).toBeNull();
  expect(screen.getByText('Your preview is ready')).toBeTruthy();
  expect(screen.queryByLabelText('Try a sample light connection')).toBeNull();
  act(() => { useHomeStore.setState({ membershipReady: true }); });
  expect(screen.queryByTestId('lighting-tactile-controller')).toBeNull();
  fireEvent.press(screen.getByLabelText('Try a sample light connection'));
  advance(10000);
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  expect(screen.getByText('Ready to try')).toBeTruthy();
});

test('an authorized household change replaces the active rehearsal and ignores the previous pending report', () => {
  const screen = openSample();
  fireEvent.press(screen.getByLabelText('Turn light on'));
  advance(200);
  act(() => { useHomeStore.setState({ accountHomeId: 'next-home', activeHomeId: 'next-home' }); });
  expect(screen.getByText('Ready to try')).toBeTruthy();
  advance(10000);
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  expect(emission(screen)).toBe(0);
});

test('the mounted lifecycle cancels a pending report in the background and resumes without replaying it', () => {
  const screen = openSample();
  fireEvent.press(screen.getByLabelText('Turn light on'));
  advance(200);
  act(() => { applicationStateChanged('background'); });
  expect(screen.getByLabelText('Brightness unavailable. Light unavailable')).toBeTruthy();
  advance(10000);
  act(() => { applicationStateChanged('active'); });
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  expect(screen.getByText('Ready to try')).toBeTruthy();
  expect(emission(screen)).toBe(0);
});
