import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ThreeDHomeScreen from '../../../screens/ThreeDHomeScreen';
import type { SceneSurfaceProps } from '../protocol';

const mockGoBack = jest.fn();
let mockFocused = true;
let mockStatus: SceneSurfaceProps['onStatus'];
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }), useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../SceneSurface', () => ({ __esModule: true, default: (props: SceneSurfaceProps) => {
  const Text = require('react-native').Text;
  mockStatus = props.onStatus;
  return <Text testID="scene-surface">Packaged scene</Text>;
} }));

beforeEach(() => { mockFocused = true; mockGoBack.mockClear(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('keeps the simulation label and dashboard exit available during load', () => {
  const screen = render(<ThreeDHomeScreen />);
  expect(screen.getByText('Simulation · no real device control')).toBeTruthy();
  expect(screen.getByText('Preparing your 3D home…')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to dashboard'));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
  act(() => mockStatus('ready'));
  expect(screen.queryByText('Preparing your 3D home…')).toBeNull();
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
  expect(remove).toHaveBeenCalledTimes(1);
});
