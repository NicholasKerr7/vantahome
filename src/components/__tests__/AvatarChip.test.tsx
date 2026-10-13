import React from 'react';
import { Image } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AvatarChip from '../AvatarChip';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///current-sandbox/' }));

test('failed portraits fall back to initials and a replacement source can load', () => {
  const screen = render(<AvatarChip name="Alice Smith" uri="file:///missing.jpg" />);
  expect(screen.getByLabelText('Alice Smith portrait')).toBeTruthy();
  fireEvent(screen.UNSAFE_getByType(Image), 'error');
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  expect(screen.getByText('AS')).toBeTruthy();
  screen.rerender(<AvatarChip name="Alice Smith" uri="file:///replacement.jpg" />);
  expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: 'file:///replacement.jpg' });
  expect(screen.queryByText('AS')).toBeNull();
});

test('removal restores initials without retaining another account image', () => {
  const screen = render(<AvatarChip name="Alice Smith" uri="file:///alice.jpg" />);
  screen.rerender(<AvatarChip name="Bob Jones" uri="" />);
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  expect(screen.getByText('BJ')).toBeTruthy();
});

test('decorative portraits do not duplicate the containing account button label', () => {
  const screen = render(<AvatarChip name="Alice Smith" uri="file:///alice.jpg" decorative />);
  expect(screen.queryByLabelText('Alice Smith portrait')).toBeNull();
});

test('empty names retain a useful fallback', () => {
  const screen = render(<AvatarChip name=" " />);
  expect(screen.getByText('VH')).toBeTruthy();
});


test('saved portrait tokens resolve inside the current native container', () => {
  const screen = render(<AvatarChip name="Alice Smith" uri="vantahome-portrait:11111111-1111-4111-8111-111111111111.jpg" />);
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe('file:///current-sandbox/portraits/11111111-1111-4111-8111-111111111111.jpg');
  screen.rerender(<AvatarChip name="Alice Smith" uri="vantahome-portrait:../other.jpg" />);
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  expect(screen.getByText('AS')).toBeTruthy();
});
