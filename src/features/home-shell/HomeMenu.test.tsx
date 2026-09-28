import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeMenu, { getMenuPageSize } from './HomeMenu';

let mockDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));

beforeEach(() => { mockDimensions = { width: 390, height: 844, scale: 1, fontScale: 1 }; });

test.each([
  { height: 562, fontScale: 1, expectedPages: 2 },
  { height: 562, fontScale: 2, expectedPages: 4 },
  { height: 844, fontScale: 2, expectedPages: 2 },
])('keeps every house utility reachable at height $height and font scale $fontScale', ({ height, fontScale, expectedPages }) => {
  mockDimensions = { width: 320, height, scale: 1, fontScale };
  const onSelect = jest.fn();
  const screen = render(<HomeMenu onClose={jest.fn()} onSelect={onSelect} rendererAvailable activityAvailable />);
  const destinations: string[] = [];
  for (let page = 0; page < expectedPages; page += 1) {
    expect(screen.getByText(`Page ${page + 1} of ${expectedPages}`)).toBeTruthy();
    for (const title of ['Rooms', 'Cameras', 'Household', 'Settings']) {
      const destination = screen.queryByLabelText(title);
      if (destination) { destinations.push(title); fireEvent.press(destination); }
    }
    if (page < expectedPages - 1) fireEvent.press(screen.getByLabelText('Next menu destinations'));
  }
  expect(destinations).toEqual(['Rooms', 'Cameras', 'Household', 'Settings']);
  expect(onSelect.mock.calls.map(([destination]) => destination)).toEqual(['rooms', 'cameras', 'household', 'settings']);
  expect(screen.getByLabelText('Next menu destinations').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('tab', { name: 'Connections' }));
  expect(screen.getByLabelText('Integrations')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: 'House' }));
  expect(screen.getByLabelText('Rooms')).toBeTruthy();
  expect(screen.getByLabelText('Previous menu destinations').props.accessibilityState.disabled).toBe(true);
});

test('groups utilities by purpose and leaves the primary destinations to the persistent dock', () => {
  const onSelect = jest.fn();
  const screen = render(<HomeMenu onClose={jest.fn()} onSelect={onSelect} rendererAvailable activityAvailable />);
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  for (const title of ['House', 'Connections', 'Activity']) expect(screen.getByRole('tab', { name: title })).toBeTruthy();
  for (const title of ['Scenes', 'Automations', 'Home devices', 'Devices']) expect(screen.queryByLabelText(title)).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Connections' }));
  fireEvent.press(screen.getByLabelText('Integrations'));
  fireEvent.press(screen.getByLabelText('Renderer preview'));
  fireEvent.press(screen.getByRole('tab', { name: 'Activity' }));
  fireEvent.press(screen.getByLabelText('Notifications'));
  fireEvent.press(screen.getByLabelText('Command activity'));
  fireEvent.press(screen.getByLabelText('History'));
  expect(onSelect.mock.calls.map(([destination]) => destination)).toEqual(['integrations', 'renderer', 'notifications', 'activity', 'audit']);
});

test('removes unavailable tools and clamps the current page when a capability disappears', () => {
  mockDimensions = { width: 320, height: 562, scale: 1, fontScale: 2 };
  const onClose = jest.fn();
  const onSelect = jest.fn();
  const screen = render(<HomeMenu onClose={onClose} onSelect={onSelect} rendererAvailable activityAvailable />);
  fireEvent.press(screen.getByRole('tab', { name: 'Connections' }));
  fireEvent.press(screen.getByLabelText('Next menu destinations'));
  expect(screen.getByLabelText('Renderer preview')).toBeTruthy();
  screen.rerender(<HomeMenu onClose={onClose} onSelect={onSelect} rendererAvailable={false} activityAvailable={false} />);
  expect(screen.queryByLabelText('Renderer preview')).toBeNull();
  expect(screen.getByLabelText('Integrations')).toBeTruthy();
  expect(screen.queryByLabelText('Next menu destinations')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Activity' }));
  expect(screen.getByLabelText('Notifications')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Next menu destinations'));
  expect(screen.getByLabelText('History')).toBeTruthy();
  expect(screen.queryByLabelText('Command activity')).toBeNull();
  fireEvent.press(screen.getByLabelText('Close home menu'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('reduces row count using usable height and font scale instead of clipping content', () => {
  expect(getMenuPageSize(739, 1)).toBe(4);
  expect(getMenuPageSize(457, 1)).toBe(2);
  expect(getMenuPageSize(457, 2)).toBe(1);
  expect(getMenuPageSize(739, 2)).toBe(2);
});
