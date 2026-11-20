import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AssistantVoiceClarification from './AssistantVoiceClarification';

const choices = [
  { id: 'living', label: 'Living room', reply: 'The living room' },
  { id: 'suite', label: 'Primary suite', reply: 'The primary suite' },
] as const;

test('announces the question and sends the chosen reply without canceling', () => {
  const onChoose = jest.fn();
  const onCancel = jest.fn();
  const screen = render(<AssistantVoiceClarification question="Which room should I use?" choices={choices} onChoose={onChoose} onCancel={onCancel} />);

  expect(screen.getByRole('header', { name: 'Choose a room or device' })).toBeTruthy();
  expect(screen.getByText('Nothing changed')).toBeTruthy();
  expect(screen.getByText('Which room should I use?').props.accessibilityLiveRegion).toBe('polite');
  fireEvent.press(screen.getByRole('button', { name: 'Choose Primary suite' }));

  expect(onChoose).toHaveBeenCalledTimes(1);
  expect(onChoose).toHaveBeenCalledWith('The primary suite');
  expect(onCancel).not.toHaveBeenCalled();
});

test('disabled choices cannot answer while cancellation remains accessible', () => {
  const onChoose = jest.fn();
  const onCancel = jest.fn();
  const screen = render(<AssistantVoiceClarification question="Which room?" choices={choices} disabled onChoose={onChoose} onCancel={onCancel} />);

  for (const choice of choices) {
    const button = screen.getByRole('button', { name: `Choose ${choice.label}`, disabled: true });
    fireEvent.press(button);
  }
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel room choice', disabled: false }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('cancel dismisses the question without selecting a reply, including when choices are empty', () => {
  const onChoose = jest.fn();
  const onCancel = jest.fn();
  const screen = render(<AssistantVoiceClarification question="Choose another room." choices={[]} onChoose={onChoose} onCancel={onCancel} />);

  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel room choice' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onChoose).not.toHaveBeenCalled();
});
