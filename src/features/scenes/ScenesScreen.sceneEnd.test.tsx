import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ScenesScreen from '../../screens/ScenesScreen';
import { useHomeStore, type Scene } from '../../store/useHomeStore';
import { virtualSceneHome } from './sceneTestFixtures';

const mockOpenReview = jest.fn();
const mockEndReview = { open: mockOpenReview, close: jest.fn(), shown: false, review: null, loading: false, error: null, busy: false, retry: jest.fn(), restore: jest.fn(), keep: jest.fn() };
jest.mock('./useSceneEndReview', () => ({ useSceneEndReview: () => mockEndReview }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => require('react-native').View);
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../theme/layout', () => ({ useResponsive: () => ({ width: 390, height: 844, isLandscape: false, isTablet: false, contentWidth: 390, gutter: 22, topPad: 56, scale: 1 }) }));

const scene: Scene = { id: 'evening', name: 'Evening calm', roomId: 'registry-room:living', scope: 'room', actions: [{ type: 'patch', deviceId: 'registry-device:living-light', patch: { isOn: true, brightness: 20 } }] };

beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState(virtualSceneHome({ scenes: [scene], activeSceneId: scene.id }));
});

test('the latest card and header open a review without rerunning or clearing anything', () => {
  const before = useHomeStore.getState();
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('End Evening calm'));
  fireEvent.press(screen.getByLabelText('End last-used scene'));
  expect(mockOpenReview.mock.calls).toEqual([['evening'], ['evening']]);
  expect(useHomeStore.getState().activeSceneId).toBe(before.activeSceneId);
  expect(useHomeStore.getState().devices).toBe(before.devices);
  expect(screen.queryByLabelText('Run Evening calm')).toBeNull();
});

test('details retain explicit Run while allowing the newest scene to open its End review', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Details for Evening calm'));
  expect(screen.getByText('Run scene')).toBeTruthy();
  fireEvent.press(screen.getAllByLabelText('End Evening calm').at(-1)!);
  expect(mockOpenReview).toHaveBeenCalledWith('evening');
  expect(screen.queryByText('Run scene')).toBeNull();
});

test('consumes a dashboard End request once and allows a later new navigation request', () => {
  const handled = jest.fn();
  const screen = render(<ScenesScreen embedded sceneEndId="evening" onSceneEndHandled={handled} />);
  expect(mockOpenReview).toHaveBeenCalledTimes(1);
  expect(handled).toHaveBeenCalledTimes(1);
  screen.rerender(<ScenesScreen embedded sceneEndId="evening" onSceneEndHandled={() => handled()} />);
  expect(mockOpenReview).toHaveBeenCalledTimes(1);
  screen.rerender(<ScenesScreen embedded onSceneEndHandled={handled} />);
  screen.rerender(<ScenesScreen embedded sceneEndId="evening" onSceneEndHandled={handled} />);
  expect(mockOpenReview).toHaveBeenCalledTimes(2);
});

test('an invisible last-used scene does not expose an End shortcut', () => {
  useHomeStore.setState({ activeSceneId: 'private-scene' });
  const screen = render(<ScenesScreen embedded />);
  expect(screen.queryByLabelText('End last-used scene')).toBeNull();
  expect(screen.getByLabelText('Run Evening calm')).toBeTruthy();
});
