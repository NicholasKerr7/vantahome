import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import HomeVoicePanel from './HomeVoicePanel';
import { executeVoiceCommand } from './executeVoiceCommand';

const mockClient = {};
const mockCancel = jest.fn();
const mockExecuteVoiceCommand = jest.mocked(executeVoiceCommand);
// Background decoration is covered separately from command execution.
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));

jest.mock('../three-d-home/useSimulationControls', () => ({ useSimulationControls: () => ({ client: mockClient, ready: true, status: 'saved' }) }));
jest.mock('./useVoiceRecognition', () => ({ useVoiceRecognition: () => ({ listening: false, error: null, start: jest.fn(), stop: jest.fn(), cancel: mockCancel }) }));
jest.mock('./executeVoiceCommand');
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteVoiceCommand.mockReturnValue({ status: 'completed' });
});

test('runs an explicit typed command through shared controls and reports simulation status without a scroll view', () => {
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'turn off southeast suite lights');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(mockExecuteVoiceCommand).toHaveBeenCalledWith(mockClient, { type: 'power', deviceIds: ['bedroom-4-light', 'bedroom-4-bedside-left', 'bedroom-4-bedside-right'], on: false });
  expect(screen.getByText('3 devices turned off. Simulation updated.')).toBeTruthy();
});

test('ambiguous commands do not run and closing immediately cancels the microphone', () => {
  const close = jest.fn(); const screen = render(<HomeVoicePanel onClose={close} />);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'turn off lights');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(mockExecuteVoiceCommand).not.toHaveBeenCalled();
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

test('keeps typed controls stationary on blur until Run completes', () => {
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  const input = screen.getByLabelText('Home voice command');
  fireEvent(input, 'focus');
  fireEvent.changeText(input, 'turn off kitchen lights');
  fireEvent(input, 'blur');
  expect(screen.queryByLabelText('Start speaking')).toBeNull();
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(screen.getByText('2 devices turned off. Simulation updated.')).toBeTruthy();
  expect(screen.getByLabelText('Start speaking')).toBeTruthy();
});

test('reports fire-held lights instead of claiming all lights turned off', () => {
  mockExecuteVoiceCommand.mockReturnValue({ status: 'limited', completedCount: 27, requestedCount: 37, fireHeldLightCount: 10 });
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'turn all lights off');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(screen.getByText('27 of 37 devices match your command. 10 lights remain on at full brightness until the fire preview is cleared and reset.')).toBeTruthy();
  expect(screen.queryByText('37 devices turned off. Simulation updated.')).toBeNull();
});

test('explains a single held light and incomplete commands without an invented cause', () => {
  mockExecuteVoiceCommand.mockReturnValueOnce({ status: 'limited', completedCount: 0, requestedCount: 1, fireHeldLightCount: 1 });
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'set living light to 20 percent');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(screen.getByText('0 of 1 devices match your command. 1 light remains on at full brightness until the fire preview is cleared and reset.')).toBeTruthy();
  mockExecuteVoiceCommand.mockReturnValueOnce({ status: 'limited', completedCount: 0, requestedCount: 1, fireHeldLightCount: 0 });
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'close entry gate');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(screen.getByText('0 of 1 devices match your command. Review the device controls and try again.')).toBeTruthy();
});

test('reports accepted gate motion as started rather than already closed', () => {
  mockExecuteVoiceCommand.mockReturnValue({ status: 'pending' });
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'close entry gate');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(screen.getByText('Command started. Check device controls for movement progress.')).toBeTruthy();
});

test('retains reconnect feedback and typed input when readiness changes before execution', () => {
  mockExecuteVoiceCommand.mockReturnValue({ status: 'reconnecting' });
  const screen = render(<HomeVoicePanel onClose={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Home voice command'), 'turn all lights off');
  fireEvent.press(screen.getByLabelText('Run typed command'));
  expect(screen.getByText('Controls are reconnecting. Close and reopen voice control.')).toBeTruthy();
  expect(screen.getByLabelText('Home voice command').props.value).toBe('turn all lights off');
});
