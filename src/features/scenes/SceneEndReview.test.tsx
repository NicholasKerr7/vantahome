import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SceneEndReview, type SceneEndReviewProps } from './SceneEndReviewDialog';
import type { SceneEndReviewModel } from './sceneEndReview';

jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

/** Represent one eligible light and one manually changed device without any executable commands. */
function review(): SceneEndReviewModel {
  return {
    sceneId: 'evening', sceneName: 'Evening calm', runId: 'run-1', revision: 5, canRestore: true,
    items: [
      { id: 'light', name: 'Pendant light', roomName: 'Living room', disposition: 'restore', changes: [{ label: 'Brightness', before: '80%', after: '20%' }] },
      { id: 'tv', name: 'Television', roomName: 'Family room', disposition: 'skip', reason: 'Changed since this scene ran. Your newer setting will stay.', changes: [{ label: 'Volume', before: '30%', after: '45%' }] },
    ],
  };
}

/** Each test owns callback spies so mere viewing can never be mistaken for an execution. */
function props(overrides: Partial<SceneEndReviewProps> = {}): SceneEndReviewProps {
  return { review: review(), loading: false, error: null, busy: false, onRetry: jest.fn(), onRestore: jest.fn(), onKeep: jest.fn(), onClose: jest.fn(), ...overrides };
}

test('shows exact previous settings and skips while review and paging make no device decision', () => {
  const callbacks = props();
  const screen = render(<SceneEndReview {...callbacks} />);
  expect(screen.getByText('20%')).toBeTruthy();
  expect(screen.getByText('80%')).toBeTruthy();
  expect(screen.getByText('1 to restore')).toBeTruthy();
  expect(screen.getByText('1 left unchanged')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Next device review'));
  expect(screen.getByText('Television')).toBeTruthy();
  expect(screen.getByText('Changed since this scene ran. Your newer setting will stay.')).toBeTruthy();
  expect(screen.getByText('UNCHANGED')).toBeTruthy();
  expect(callbacks.onRestore).not.toHaveBeenCalled();
  expect(callbacks.onKeep).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Close scene review'));
  expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  expect(callbacks.onRestore).not.toHaveBeenCalled();
});

test('exposes explicit independent Restore and Keep decisions', () => {
  const callbacks = props();
  const screen = render(<SceneEndReview {...callbacks} />);
  fireEvent.press(screen.getByLabelText('Restore previous settings'));
  expect(callbacks.onRestore).toHaveBeenCalledTimes(1);
  expect(callbacks.onKeep).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('End scene and keep current settings'));
  expect(callbacks.onKeep).toHaveBeenCalledTimes(1);
});

test('a previous run without receipt offers only truthful keep-current resolution', () => {
  const callbacks = props({ review: { ...review(), runId: null, revision: null, canRestore: false, items: [], unavailableReason: 'Previous settings were not saved for this earlier run.' } });
  const screen = render(<SceneEndReview {...callbacks} />);
  expect(screen.getByText('Previous settings were not saved for this earlier run.')).toBeTruthy();
  expect(screen.queryByLabelText('Restore previous settings')).toBeNull();
  fireEvent.press(screen.getByLabelText('End scene and keep current settings'));
  expect(callbacks.onKeep).toHaveBeenCalledTimes(1);
  expect(callbacks.onRestore).not.toHaveBeenCalled();
});

test('loading, errors and in-flight confirmation disable writes and keep refresh reachable', () => {
  const callbacks = props({ loading: true, review: null });
  const screen = render(<SceneEndReview {...callbacks} />);
  expect(screen.getByText('Checking this run')).toBeTruthy();
  expect(screen.getByLabelText('End scene and keep current settings').props.accessibilityState.disabled).toBe(true);
  screen.rerender(<SceneEndReview {...callbacks} review={review()} loading={false} error="Settings changed. Refresh the review before restoring." />);
  fireEvent.press(screen.getByLabelText('Refresh scene review'));
  expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Restore previous settings').props.accessibilityState.disabled).toBe(true);
  screen.rerender(<SceneEndReview {...callbacks} review={review()} loading={false} busy />);
  expect(screen.getByLabelText('Restore previous settings').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText('Close scene review').props.accessibilityState.disabled).toBe(true);
  expect(callbacks.onRestore).not.toHaveBeenCalled();
});

test('review choices retain 48-point targets', () => {
  const screen = render(<SceneEndReview {...props()} />);
  for (const label of ['Restore previous settings', 'End scene and keep current settings', 'Close scene review']) {
    expect(StyleSheet.flatten(screen.getByLabelText(label).props.style).minHeight).toBeGreaterThanOrEqual(48);
  }
});
