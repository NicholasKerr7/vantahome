import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeMenu from './HomeMenu';

let mockDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));

test.each([
  { height: 562, fontScale: 1, expectedPages: 2 },
  { height: 844, fontScale: 2, expectedPages: 4 },
])('keeps all destinations reachable at height $height and font scale $fontScale', ({ height, fontScale, expectedPages }) => {
  mockDimensions = { width: 320, height, scale: 1, fontScale };
  const onSelect = jest.fn();
  const screen = render(<HomeMenu onClose={jest.fn()} onSelect={onSelect} rendererAvailable activityAvailable />);
  const destinations: string[] = [];
  for (let page = 0; page < expectedPages; page += 1) {
    for (const title of ['Scenes', 'Automations', 'Cameras', 'Notifications']) {
      const destination = screen.queryByLabelText(title);
      if (destination) { destinations.push(title); fireEvent.press(destination); }
    }
    if (page < expectedPages - 1) fireEvent.press(screen.getByLabelText('Next menu destinations'));
  }
  expect(destinations).toEqual(['Scenes', 'Automations', 'Cameras', 'Notifications']);
  expect(onSelect.mock.calls.map(([destination]) => destination)).toEqual(['scenes', 'automations', 'cameras', 'notifications']);
  fireEvent.press(screen.getByText('Manage'));
  expect(screen.getByLabelText('Rooms')).toBeTruthy();
  expect(screen.getByLabelText('Previous menu destinations').props.accessibilityState.disabled).toBe(true);
});
