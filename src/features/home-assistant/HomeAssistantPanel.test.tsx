import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import HomeAssistantPanel from './HomeAssistantPanel';
import type { useHomeConcierge } from './useHomeConcierge';

const mockSpeechCancel = jest.fn();
const mockSpeechStart = jest.fn();
let mockTranscript: (phrase: string) => void;
let mockAssistant: ReturnType<typeof useHomeConcierge>;

jest.mock('./useHomeConcierge', () => ({ useHomeConcierge: () => mockAssistant }));
jest.mock('../home-voice/useVoiceRecognition', () => ({ useVoiceRecognition: (callback: (phrase: string) => void) => {
  mockTranscript = callback;
  return { listening: false, error: null, start: mockSpeechStart, stop: jest.fn(), cancel: mockSpeechCancel };
} }));
jest.mock('../home-voice/HomeVoicePanel', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ embedded }: { embedded: boolean }) => <Text>{embedded ? 'Embedded direct controls' : 'Standalone direct controls'}</Text> };
});
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAssistant = {
    context: { scope: 'home', fingerprint: 'scope', roomId: null, scopeLabel: 'My permitted rooms', availableRooms: [], capturedAt: Date.now(), expiresAt: null, available: true, reason: null, devices: [], canDraft: true,
      brief: { roomCount: 3, deviceCount: 8, onCount: 4, lightsOnCount: 2, climateOnCount: 1 }, requestContext: { mode: 'simulation', capturedAt: Date.now(), devices: [] } },
    status: 'ready', response: null, error: null, canAsk: true, canReview: false,
    ask: jest.fn(async () => undefined), cancel: jest.fn(), clear: jest.fn(), retryAvailability: jest.fn(), prepareReview: jest.fn(() => null),
    roomId: null, scopeLabel: 'My permitted rooms', availableRooms: [], proposalDevices: [], preparePreview: jest.fn(() => null),
  };
});

test('shows the local brief without sending data; a prompt fills the question until Send is pressed', () => {
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  expect(screen.getByText('On-device snapshot · Simulation')).toBeTruthy();
  expect(screen.getByText('rooms in view')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Home brief'));
  expect(mockAssistant.ask).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Question for Vanta assistant').props.value).toContain('permitted home simulation');
  fireEvent.press(screen.getByLabelText('Send assistant question'));
  expect(mockAssistant.ask).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Send shares your question, room\/device names and permitted simulation settings with OpenAI/)).toBeTruthy();
});

test('dictation only prepares text and never submits or executes a command', () => {
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Dictate assistant question'));
  expect(mockSpeechStart).toHaveBeenCalledTimes(1);
  act(() => mockTranscript('Make an evening scene'));
  expect(screen.getByLabelText('Question for Vanta assistant').props.value).toBe('Make an evening scene');
  expect(mockAssistant.ask).not.toHaveBeenCalled();
  expect(mockAssistant.prepareReview).not.toHaveBeenCalled();
});

test('switching to Controls cancels and clears cloud work, with one shared assistant heading', () => {
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Question for Vanta assistant'), 'An unsent question');
  fireEvent.press(screen.getByLabelText('Direct voice controls'));
  expect(mockSpeechCancel).toHaveBeenCalled();
  expect(mockAssistant.cancel).toHaveBeenCalled();
  expect(mockAssistant.clear).toHaveBeenCalled();
  expect(screen.getByText('Embedded direct controls')).toBeTruthy();
  expect(screen.queryByLabelText('Question for Vanta assistant')).toBeNull();
  fireEvent.press(screen.getByLabelText('Ask assistant'));
  expect(screen.getByLabelText('Question for Vanta assistant').props.value).toBe('');
});

test('a missing provider keeps the local brief useful and offers recovery without invented AI answers', () => {
  mockAssistant.status = 'unavailable'; mockAssistant.canAsk = false;
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  expect(screen.getByTestId('assistant-local-brief')).toBeTruthy();
  expect(screen.getByText('AI is not connected yet')).toBeTruthy();
  expect(screen.queryByTestId('assistant-response')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Question for Vanta assistant'), 'How is my home?');
  fireEvent.press(screen.getByLabelText('Send assistant question'));
  expect(mockAssistant.ask).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Check assistant connection'));
  expect(mockAssistant.retryAvailability).toHaveBeenCalledTimes(1);
});

test('unavailable home access shows its actual reason and no zero-count household brief', () => {
  mockAssistant.status = 'unavailable'; mockAssistant.canAsk = false;
  mockAssistant.context = { ...mockAssistant.context, available: false, reason: 'Verify your home access to use the assistant.', canDraft: false };
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  expect(screen.getByText('Verify your home access to use the assistant.')).toBeTruthy();
  expect(screen.queryByTestId('assistant-local-brief')).toBeNull();
  expect(screen.queryByLabelText('Set a mood')).toBeNull();
});

test('availability errors retain the question and provide an explicit connection retry', () => {
  mockAssistant.status = 'error'; mockAssistant.canAsk = false; mockAssistant.error = 'Check your connection and try again.';
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Question for Vanta assistant'), 'Make my evening calmer');
  fireEvent.press(screen.getByLabelText('Check assistant connection'));
  expect(mockAssistant.retryAvailability).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Question for Vanta assistant').props.value).toBe('Make my evening calmer');
});

test('scene review requires a fresh handoff token and never saves or runs from the answer', () => {
  mockAssistant.response = { title: 'An evening to unwind', answer: 'Warm, low lighting can create a quieter mood.', deviceIds: ['lamp'], scene: { name: 'Quiet evening', explanation: 'One lamp softens the room.', actions: [{ deviceId: 'lamp', values: { brightness: 25 } }] } };
  mockAssistant.canReview = true;
  jest.mocked(mockAssistant.prepareReview).mockReturnValueOnce(null).mockReturnValueOnce('draft-token');
  const review = jest.fn();
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={review} />);
  expect(screen.getByText('1 device change · Nothing has run')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Review suggested scene'));
  expect(review).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Review suggested scene'));
  expect(review).toHaveBeenCalledWith('draft-token');
});

test('a stale draft reports the hook error even when the last answer remains visible', () => {
  mockAssistant.error = 'This suggestion is no longer current. Ask for a fresh scene.';
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  expect(screen.getByText('This suggestion is no longer current. Ask for a fresh scene.')).toBeTruthy();
});

test('closing cancels microphone and cloud work before dismissing the panel', () => {
  const close = jest.fn();
  const screen = render(<HomeAssistantPanel onClose={close} onReviewScene={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Close home assistant'));
  expect(mockSpeechCancel).toHaveBeenCalledTimes(1);
  expect(mockAssistant.cancel).toHaveBeenCalledTimes(1);
  expect(mockAssistant.clear).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

test('a changed home or grant clears unsent private text and cancels dictation', () => {
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Question for Vanta assistant'), 'Dim the private guest suite');
  mockAssistant.context = { ...mockAssistant.context, fingerprint: 'new-household' };
  screen.rerender(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  expect(screen.getByLabelText('Question for Vanta assistant').props.value).toBe('');
  expect(mockSpeechCancel).toHaveBeenCalledTimes(1);
});

test('typing reclaims header space while keeping dismissal, Send and full consent visible', () => {
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} />);
  const input = screen.getByLabelText('Question for Vanta assistant');
  fireEvent(input, 'focus');
  expect(screen.queryByLabelText('Direct voice controls')).toBeNull();
  expect(screen.getByLabelText('Close home assistant')).toBeTruthy();
  expect(screen.getByLabelText('Send assistant question')).toBeTruthy();
  expect(screen.getByText(/Camera feeds and account details are not added/)).toBeTruthy();
  fireEvent(input, 'blur');
  expect(screen.queryByLabelText('Direct voice controls')).toBeNull();
  fireEvent.press(screen.getByLabelText('Finish typing'));
  expect(screen.getByLabelText('Direct voice controls')).toBeTruthy();
});

/** A controllable foreground session lets UI tests exercise cancellation without a microphone. */
function voiceFixture() {
  return {
    supported: true, enabled: true, phase: 'waiting' as const, error: null,
    start: jest.fn(async () => undefined), stop: jest.fn(), pause: jest.fn(), resume: jest.fn(), speak: jest.fn(),
    readSessionToken: jest.fn(() => 7), isSessionCurrent: jest.fn((token: number | null) => token === 7),
  };
}

/** Delay one Ask response so tests can revoke consent before the answer arrives. */
function delayedAnswer() {
  let complete!: () => void;
  const promise = new Promise<void>((resolve) => { complete = resolve; });
  jest.mocked(mockAssistant.ask).mockReturnValue(promise);
  return complete;
}

const spokenRequest = () => ({ id: 1, question: 'Make this room calm', roomId: null, sessionToken: 7, expiresAt: Date.now() + 15_000 });

test('a wake question submits once and retains visible Stop when its text fills the composer', async () => {
  const voice = voiceFixture();
  mockAssistant.response = { title: 'Calm', answer: 'A softer light.', deviceIds: [], scene: null };
  const request = spokenRequest();
  const consumed = jest.fn();
  const props = { onClose: jest.fn(), onReviewScene: jest.fn(), voice, voiceRequest: request, onVoiceRequestConsumed: consumed };
  const screen = render(<HomeAssistantPanel {...props} />);
  await act(async () => {});
  screen.rerender(<HomeAssistantPanel {...props} />);
  expect(mockAssistant.ask).toHaveBeenCalledTimes(1);
  expect(voice.speak).toHaveBeenCalledWith('A softer light.');
  expect(consumed).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Stop hands-free listening')).toBeTruthy();
  expect(mockAssistant.prepareReview).not.toHaveBeenCalled();
});

test.each(['stopped', 'expired', 'other-room'] as const)('a %s queued wake request never submits', async (reason) => {
  const voice = voiceFixture();
  const request = spokenRequest();
  if (reason === 'stopped') voice.isSessionCurrent.mockReturnValue(false);
  if (reason === 'expired') request.expiresAt = Date.now() - 1;
  if (reason === 'other-room') Object.assign(request, { roomId: 'bedroom' });
  render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} voice={voice} voiceRequest={request} />);
  await act(async () => {});
  expect(mockAssistant.ask).not.toHaveBeenCalled();
  expect(voice.speak).not.toHaveBeenCalled();
});

test.each(['cancel', 'stop', 'close'] as const)('%s prevents a late answer from starting speech', async (action) => {
  const voice = voiceFixture();
  const complete = delayedAnswer();
  mockAssistant.status = 'asking';
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} voice={voice} voiceRequest={spokenRequest()} />);
  fireEvent.press(screen.getByLabelText(action === 'cancel' ? 'Cancel assistant request' : action === 'stop' ? 'Stop hands-free listening' : 'Close home assistant'));
  mockAssistant.status = 'ready';
  mockAssistant.response = { title: 'Calm', answer: 'Do not read this late answer.', deviceIds: [], scene: null };
  await act(async () => { complete(); });
  expect(voice.speak).not.toHaveBeenCalled();
});

test('session expiry during Ask prevents automatic narration even if a new session starts', async () => {
  const voice = voiceFixture();
  const complete = delayedAnswer();
  render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} voice={voice} voiceRequest={spokenRequest()} />);
  voice.isSessionCurrent.mockReturnValue(false);
  mockAssistant.response = { title: 'Late', answer: 'Private old response.', deviceIds: [], scene: null };
  await act(async () => { complete(); });
  expect(voice.speak).not.toHaveBeenCalled();
});

test('an unavailable wake question is consumed instead of executing later after connection recovery', async () => {
  const voice = voiceFixture();
  const request = spokenRequest();
  mockAssistant.canAsk = false;
  mockAssistant.status = 'checking';
  const props = { onClose: jest.fn(), onReviewScene: jest.fn(), voice, voiceRequest: request };
  const screen = render(<HomeAssistantPanel {...props} />);
  mockAssistant.canAsk = true; mockAssistant.status = 'ready';
  screen.rerender(<HomeAssistantPanel {...props} />);
  await act(async () => {});
  expect(mockAssistant.ask).not.toHaveBeenCalled();
  expect(voice.speak).toHaveBeenCalledTimes(1);
});

test('room selection cancels old work and informs the foreground voice scope', () => {
  mockAssistant.availableRooms = [{ id: 'living', name: 'Living room' }];
  const room = jest.fn();
  const voice = voiceFixture();
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} onRoomChange={room} voice={voice} />);
  fireEvent.press(screen.getByText('Living room'));
  expect(room).toHaveBeenCalledWith('living');
  expect(voice.stop).toHaveBeenCalled();
  expect(mockAssistant.clear).toHaveBeenCalled();
});

test('Preview uses a validated proposal without consuming Review or changing the scene', () => {
  const scene = { name: 'Evening', explanation: 'Dim one light.', actions: [{ deviceId: 'lamp', values: { brightness: 20 } }] };
  mockAssistant.response = { title: 'Evening', answer: 'A warm atmosphere.', deviceIds: ['lamp'], scene };
  mockAssistant.canReview = true;
  const preview = jest.fn();
  // preparePreview owns the complete validated snapshot; this UI must pass it through unchanged.
  const proposal = { marker: 'validated' } as unknown as NonNullable<ReturnType<typeof mockAssistant.preparePreview>>;
  jest.mocked(mockAssistant.preparePreview).mockReturnValue(proposal);
  const screen = render(<HomeAssistantPanel onClose={jest.fn()} onReviewScene={jest.fn()} onPreview={preview} />);
  fireEvent.press(screen.getByLabelText('Preview suggested scene in 3D'));
  expect(preview).toHaveBeenCalledWith(proposal);
  expect(mockAssistant.prepareReview).not.toHaveBeenCalled();
  expect(mockAssistant.ask).not.toHaveBeenCalled();
});
