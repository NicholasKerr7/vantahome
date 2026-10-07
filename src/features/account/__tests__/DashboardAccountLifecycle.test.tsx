import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ThreeDHomeScreen from '../../../screens/ThreeDHomeScreen';
import type { SceneSurfaceProps } from '../../three-d-home/protocol';

let mockSceneProps: SceneSurfaceProps;
const mockNavigate = jest.fn();
const originalAppState = AppState.currentState;
// Jest's CommonJS VM cannot execute this import boundary; exercise the real sheet eagerly here.
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { ...actual, lazy: (loader: () => unknown) => loader.toString().includes('AccountSheet')
    ? require('../AccountSheet').default : actual.lazy(loader) };
});
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'), useIsFocused: () => true,
  useNavigation: () => ({ navigate: mockNavigate, dispatch: jest.fn() }),
}));
jest.mock('../../../services/supabaseClient', () => ({ supabase: null }));
jest.mock('../../../config/runtimeMode', () => ({ runtimePolicy: { allowUnauthenticatedDemo: true } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../../three-d-home/SceneSurface', () => ({ __esModule: true, default: (props: SceneSurfaceProps) => {
  mockSceneProps = props;
  const Text = require('react-native').Text;
  return <Text testID="scene-surface">Loaded house</Text>;
} }));

beforeEach(() => { AppState.currentState = 'active'; });
afterEach(() => { AppState.currentState = originalAppState; });

test('account controls pause the loaded property and resume it without a second load', async () => {
  const screen = render(<ThreeDHomeScreen />);
  act(() => mockSceneProps.onStatus('ready'));
  const scene = screen.getByTestId('scene-surface');
  fireEvent.press(screen.getByLabelText('Open account: Demo profile'));
  await waitFor(() => expect(screen.getByLabelText('Close account')).toBeTruthy());
  expect(mockSceneProps.suspended).toBe(true);
  expect(screen.getByText('Local preview · no account signed in')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close account'));
  expect(mockSceneProps.suspended).toBe(false);
  expect(screen.getByTestId('scene-surface')).toBe(scene);
  expect(screen.queryByText('Opening your property…')).toBeNull();
});
