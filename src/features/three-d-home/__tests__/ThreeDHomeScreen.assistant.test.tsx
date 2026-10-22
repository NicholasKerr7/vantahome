import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ThreeDHomeScreen from '../../../screens/ThreeDHomeScreen';
import { useHomeStore } from '../../../store/useHomeStore';
import type { SceneSurfaceProps } from '../protocol';
import type HomeAssistantPanel from '../../home-assistant/HomeAssistantPanel';
import type { useForegroundAssistantVoice } from '../../home-voice/useForegroundAssistantVoice';

let mockSurface: SceneSurfaceProps;
let mockPanel: React.ComponentProps<typeof HomeAssistantPanel>;
let mockVoiceOptions: Parameters<typeof useForegroundAssistantVoice>[0];
const mockStop = jest.fn();
const seed = useHomeStore.getState();
const originalAppState = AppState.currentState;
jest.mock('../../home-voice/useForegroundAssistantVoice', () => ({ useForegroundAssistantVoice: (options: typeof mockVoiceOptions) => {
  mockVoiceOptions = options;
  return { enabled: false, stop: mockStop };
} }));
jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  return { ...actual, lazy: (loader: () => unknown) => loader.toString().includes('HomeAssistantPanel')
    ? require('../../home-assistant/HomeAssistantPanel').default : actual.lazy(loader as Parameters<typeof actual.lazy>[0]) };
});
jest.mock('../../home-assistant/HomeAssistantPanel', () => ({ __esModule: true, default: (props: typeof mockPanel) => {
  mockPanel = props;
  return require('react').createElement(require('react-native').Text, { testID: 'assistant' }, props.previewing ? 'Preview open' : 'Ask visible');
} }));
jest.mock('../../home-assistant/assistantPreviewCommand', () => ({ assistantPreviewCommand: (_proposal: unknown, id: number) => ({ channel: 'vantahome-scene-preview', version: 1, type: 'set', id, preview: { title: 'Evening', expiresAt: Date.now() + 60_000, actions: [] } }) }));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ dispatch: jest.fn(), navigate: jest.fn() }), useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../SceneSurface', () => ({ __esModule: true, default: (props: SceneSurfaceProps) => {
  mockSurface = props;
  return require('react').createElement(require('react-native').Text, {}, 'Property');
} }));

beforeEach(() => {
  jest.useFakeTimers(); mockStop.mockClear(); AppState.currentState = 'active';
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    authTaskBlockingHome: false, activeMemberId: 'person', household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'registered-living', name: 'Living room', modelRoomId: 'living' }],
    devices: [{ id: 'lamp', modelDeviceId: 'living-light', name: 'Pendant', kind: 'light', roomId: 'registered-living', simulationOnly: true, isOn: false }],
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
  });
});
afterEach(() => { useHomeStore.setState(seed, true); AppState.currentState = originalAppState; jest.useRealTimers(); });

/** Open the real host panel boundary with renderer readiness explicitly acknowledged. */
function openAssistant() {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockSurface.onStatus('ready'));
  fireEvent.press(screen.getByLabelText('Open home assistant'));
  return screen;
}
/** The payload validator is tested separately; exercise the host lifecycle using a validated sentinel. */
function preview() { act(() => mockPanel.onPreview?.({} as Parameters<NonNullable<typeof mockPanel.onPreview>>[0])); }
/** Deliver a report from the already source-checked current scene. */
function report(id: number, status: 'active' | 'closed') {
  act(() => mockSurface.onPreviewReport?.({ channel: 'vantahome-scene-preview', version: 1, type: 'status', id, status }));
}

test('keeps Ask mounted while preview runs and returns to the same panel on Exit without store writes', () => {
  const screen = openAssistant();
  const panel = screen.getByTestId('assistant');
  expect(mockSurface.suspended).toBe(true);
  const changed = jest.fn(); const unsubscribe = useHomeStore.subscribe(changed);
  preview(); const id = mockSurface.previewCommand!.id;
  expect(mockPanel.previewing).toBe(true);
  expect(mockSurface.suspended).toBe(false);
  report(id, 'active'); report(id, 'closed');
  expect(screen.getByTestId('assistant')).toBe(panel);
  expect(mockPanel.previewing).toBe(false);
  expect(mockSurface.suspended).toBe(true);
  expect(changed).not.toHaveBeenCalled(); unsubscribe();
});

test('ignores unrelated preview reports and restores Ask if the current preview is not acknowledged', () => {
  openAssistant(); preview();
  const id = mockSurface.previewCommand!.id;
  report(id + 100, 'closed');
  expect(mockPanel.previewing).toBe(true);
  expect(mockPanel.previewNotice).toBeNull();
  act(() => jest.advanceTimersByTime(5000));
  expect(mockPanel.previewing).toBe(false);
  expect(mockSurface.previewCommand?.type).toBe('clear');
  expect(mockPanel.previewNotice).toContain('could not open');
});

test('a renderer error retires an acknowledged preview instead of leaving Ask permanently hidden', () => {
  const screen = openAssistant(); preview(); report(mockSurface.previewCommand!.id, 'active');
  act(() => mockSurface.onStatus('error'));
  expect(mockPanel.previewing).toBe(false);
  fireEvent.press(screen.getByLabelText('Retry 3D Home'));
  expect(mockSurface.previewCommand).toBeUndefined();
});

test('selected model rooms resolve to registered Ask scope and wake questions carry that same room and session', () => {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockSurface.onStatus('ready'));
  act(() => mockSurface.onPreviewReport?.({ channel: 'vantahome-scene-preview', version: 1, type: 'selection', modelRoomId: 'living' }));
  act(() => { void mockVoiceOptions.onQuestion('Make it calm', 17); });
  expect(screen.getByTestId('assistant')).toBeTruthy();
  expect(mockPanel.initialRoomId).toBe('registered-living');
  expect(mockPanel.voiceRequest).toMatchObject({ question: 'Make it calm', roomId: 'registered-living', sessionToken: 17 });
  act(() => mockPanel.onRoomChange?.(null));
  expect(mockStop).toHaveBeenCalled();
  expect(mockPanel.voiceRequest).toBeNull();
  expect(mockPanel.initialRoomId).toBeNull();
});
