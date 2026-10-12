import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import NotificationsScreen from '../NotificationsScreen';
import type { CurrentReport } from '../../features/activity/currentReports';

const mockAcknowledge = jest.fn();
const mockReports: CurrentReport[] = [{ id: 'condition:water:leak', deviceName: 'Water meter', title: 'Leak flagged in last report',
  detail: 'Current physical condition is not confirmed.', simulated: false, age: 'unknown', timeLabel: 'Device report time unknown', warning: true }];
const mockItems = [{ id: 'command', revision: 'revision', title: 'Light', body: 'No physical state confirmed.', status: 'Submitted',
  timestamp: 1_800_000_000_000, category: 'device', simulated: false, unread: false }];

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useNavigation: () => ({ canGoBack: () => false, dispatch: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../features/activity/useCurrentReports', () => ({ useCurrentReports: () => ({ reports: mockReports, loading: false }) }));
jest.mock('../../features/activity/ActivityInboxProvider', () => ({ useActivityInbox: () => ({ items: mockItems, ready: true, storageError: false, acknowledge: mockAcknowledge }) }));
jest.mock('../../components/deep/DeepScreen', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    DeepScreen: ({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) => <View>{actions}{children}</View>,
    DeepCard: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    DeepPager: () => null,
    DeepTabs: ({ items, onSelect }: { items: Array<{ id: string; label: string }>; onSelect: (id: string) => void }) =>
      <View>{items.map((item) => <Pressable key={item.id} accessibilityLabel={item.label} onPress={() => onSelect(item.id)}><Text>{item.label}</Text></Pressable>)}</View>,
  };
});

/** Continuing reports have no dismissal/read action and survive dismissal of unrelated historical activity. */
test('keeps Current reports outside all activity read and dismissal operations', () => {
  const screen = render(<NotificationsScreen />);
  fireEvent.press(screen.getByLabelText('Dismiss all'));
  expect(mockAcknowledge).toHaveBeenCalledWith(mockItems, true);
  mockAcknowledge.mockClear();
  fireEvent.press(screen.getByLabelText('Current reports'));
  expect(screen.getByText('Leak flagged in last report')).toBeTruthy();
  expect(screen.getByText('Device report time unknown')).toBeTruthy();
  expect(screen.queryByLabelText('Dismiss all')).toBeNull();
  expect(screen.queryByLabelText('Dismiss Water meter')).toBeNull();
  expect(mockAcknowledge).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Activity'));
  fireEvent.press(screen.getByLabelText('Current reports'));
  expect(screen.getByText('Leak flagged in last report')).toBeTruthy();
});
