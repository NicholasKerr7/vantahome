import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ThreeDHomeScreen from '../../../screens/ThreeDHomeScreen';
import type { SceneSurfaceProps } from '../protocol';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
let mockFocused = true;
let mockStatus: SceneSurfaceProps['onStatus'];
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate, dispatch: mockDispatch }), useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
// Decorative motion has separate lifecycle coverage; keep navigation tests synchronous.
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../SceneSurface', () => ({ __esModule: true, default: (props: SceneSurfaceProps) => {
  const Text = require('react-native').Text;
  mockStatus = props.onStatus;
  return <Text testID="scene-surface">Packaged scene</Text>;
} }));

beforeEach(() => { mockFocused = true; mockGoBack.mockClear(); mockNavigate.mockClear(); mockDispatch.mockClear(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('keeps the simulation boundary and main feature menu available during load', () => {
  const screen = render(<ThreeDHomeScreen />);
  expect(screen.getByText('Simulation · no real device control')).toBeTruthy();
  expect(screen.getByText('Preparing your home…')).toBeTruthy();
  expect(screen.queryByLabelText('Back to dashboard')).toBeNull();
  fireEvent.press(screen.getByLabelText('Scenes'));
  expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'NAVIGATE', payload: { name: 'Main', params: { screen: 'Scenes', pop: true }, pop: true } }));
  act(() => mockStatus('ready'));
  expect(screen.queryByText('Preparing your home…')).toBeNull();
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
  expect(mockNavigate).toHaveBeenCalledWith('Profile');
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
test('unmounts graphics when the app backgrounds or navigation leaves the scene', () => {
  let onStateChange: (state: string) => void = () => undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onStateChange = listener as (state: string) => void;
    return { remove };
  });
  const screen = render(<ThreeDHomeScreen />);
  act(() => onStateChange('inactive'));
  expect(screen.getByTestId('scene-surface')).toBeTruthy();
  act(() => onStateChange('background'));
  expect(screen.queryByTestId('scene-surface')).toBeNull();
  act(() => onStateChange('active'));
  expect(screen.getByTestId('scene-surface')).toBeTruthy();
  mockFocused = false;
  screen.rerender(<ThreeDHomeScreen />);
  expect(screen.queryByTestId('scene-surface')).toBeNull();
  screen.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});
