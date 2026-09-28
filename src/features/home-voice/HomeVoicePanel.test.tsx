import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import HomeVoicePanel from './HomeVoicePanel';

const mockClient = { getSnapshot: jest.fn(() => ({ ready: true })), setPower: jest.fn(), setLevel: jest.fn(), setSetting: jest.fn() };
const mockCancel = jest.fn();
jest.mock('../three-d-home/useSimulationControls', () => ({ useSimulationControls: () => ({ client: mockClient, ready: true, status: 'saved' }) }));
jest.mock('./useVoiceRecognition', () => ({ useVoiceRecognition: () => ({ listening: false, error: null, start: jest.fn(), stop: jest.fn(), cancel: mockCancel }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

beforeEach(() => jest.clearAllMocks());

test('runs an explicit typed command through shared controls and reports simulation status without a scroll view', () => {
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'turn off southeast suite lights');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(mockClient.setPower).toHaveBeenCalledWith(['bedroom-4-light', 'bedroom-4-bedside-left', 'bedroom-4-bedside-right'], false);
  expect(screen.getByText('3 devices turned off. Simulation updated.')).toBeTruthy();
});

test('ambiguous commands do not run and closing immediately cancels the microphone', () => {
  const close = jest.fn(); const screen = render(<HomeVoicePanel onClose={close} />);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'turn off lights');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(mockClient.setPower).not.toHaveBeenCalled();
  expect(screen.getByText(/That name matches more than one device/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close voice control'));
  expect(mockCancel).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});

test('typing compacts the panel so the keyboard does not compete with microphone controls', () => {
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  expect(screen.getByLabelText('Start speaking')).toBeTruthy();
  fireEvent(screen.getByLabelText('Home voice command'), 'focus');
  expect(screen.queryByLabelText('Start speaking')).toBeNull();
  fireEvent(screen.getByLabelText('Home voice command'), 'blur');
  expect(screen.getByLabelText('Start speaking')).toBeTruthy();
});
