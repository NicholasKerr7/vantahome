import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import OwnershipTransferScreen from './OwnershipTransferScreen';
import { useOwnershipTransfer } from './useOwnershipTransfer';
import { useControllerFocused } from '../three-d-home/useControllerFocused';

jest.mock('./useOwnershipTransfer', () => ({ useOwnershipTransfer: jest.fn() }));
jest.mock('../three-d-home/useControllerFocused', () => ({ useControllerFocused: jest.fn() }));
jest.mock('../../components/CinematicSurface', () => require('react-native').View);
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('../../components/ScrollableCardPages', () => (
  { page, renderPage }: { page: number; renderPage: (value: number) => React.ReactNode }
) => renderPage(page));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

type Model = ReturnType<typeof useOwnershipTransfer>;
const send = jest.fn();
const respond = jest.fn();
const refresh = jest.fn();
const model: Model = {
  scopeKey: 'owner-home-a',
  role: 'Owner',
  candidates: [
    { id: 'first', name: 'first@example.com', role: 'Member', homeName: 'Test house' },
    { id: 'second', name: 'second@example.com', role: 'Admin', homeName: 'Test house' },
  ],
  offer: null,
  loading: false,
  busy: false,
  error: null,
  notice: null,
  send, respond, refresh,
};
const offer: NonNullable<Model['offer']> = {
  id: 'offer-1', fromName: 'The current Owner', toName: 'second@example.com', homeName: 'Test house',
  expiresAt: '2090-05-01T20:00:00Z', direction: 'incoming',
};
const screenProps = {
  route: { name: 'OwnershipTransfer', key: 'transfer' },
  navigation: { canGoBack: () => true, goBack: jest.fn(), dispatch: jest.fn() },
} as unknown as React.ComponentProps<typeof OwnershipTransferScreen>;

/** Render the production route with explicit verified responses and no external account mutation. */
function openScreen(changes: Partial<Model> = {}) {
  jest.mocked(useOwnershipTransfer).mockReturnValue({ ...model, ...changes });
  return render(<OwnershipTransferScreen {...screenProps} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useControllerFocused).mockReturnValue(true);
});

test('review binds to the displayed account and sending is a separate action', () => {
  const screen = openScreen();
  fireEvent.press(screen.getByLabelText('Next eligible people'));
  fireEvent.press(screen.getByLabelText('Review offer'));
  expect(screen.getByText('Test house')).toBeTruthy();
  expect(screen.getByText('second@example.com · Owner')).toBeTruthy();
  expect(screen.getByText('You · Admin')).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Send ownership offer'));
  expect(send.mock.calls).toEqual([['second']]);
});

test('a changing roster or household discards the previous review', () => {
  const screen = openScreen();
  fireEvent.press(screen.getByLabelText('Review offer'));
  jest.mocked(useOwnershipTransfer).mockReturnValue({ ...model, candidates: [model.candidates[1]] });
  screen.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(screen.queryByLabelText('Send ownership offer')).toBeNull();
  fireEvent.press(screen.getByLabelText('Review offer'));
  jest.mocked(useOwnershipTransfer).mockReturnValue({ ...model, scopeKey: 'owner-home-b' });
  screen.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(screen.queryByLabelText('Send ownership offer')).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

test('the recipient reviews the home and both roles before accepting', () => {
  const result = openScreen({ role: 'Member', candidates: [], offer });
  expect(result.queryByLabelText('Review offer')).toBeNull();
  fireEvent.press(result.getByLabelText('Review ownership'));
  expect(result.getByText('Test house')).toBeTruthy();
  expect(result.getByText('You · Owner')).toBeTruthy();
  expect(result.getByText('The current Owner · Admin')).toBeTruthy();
  expect(respond).not.toHaveBeenCalled();
  fireEvent.press(result.getByLabelText('Accept ownership'));
  expect(respond.mock.calls).toEqual([['offer-1', 'accept']]);
});

test.each([
  ['incoming', 'Member', 'Decline offer', 'Confirm decline', 'decline'],
  ['outgoing', 'Owner', 'Cancel offer', 'Confirm cancellation', 'cancel'],
] as const)('a pending %s offer can be kept or closed deliberately', (direction, role, begin, confirm, decision) => {
  const result = openScreen({ role, offer: { ...offer, direction }, candidates: [] });
  fireEvent.press(result.getByLabelText(begin));
  fireEvent.press(result.getByLabelText('Back to offer'));
  expect(respond).not.toHaveBeenCalled();
  fireEvent.press(result.getByLabelText(begin));
  fireEvent.press(result.getByLabelText(confirm));
  expect(respond.mock.calls).toEqual([['offer-1', decision]]);
});

test('a new offer and loss of focus discard an acceptance review', () => {
  const result = openScreen({ role: 'Admin', offer, candidates: [] });
  fireEvent.press(result.getByLabelText('Review ownership'));
  jest.mocked(useOwnershipTransfer).mockReturnValue({ ...model, role: 'Admin', offer: { ...offer, id: 'next' } });
  result.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(result.queryByLabelText('Accept ownership')).toBeNull();
  fireEvent.press(result.getByLabelText('Review ownership'));
  jest.mocked(useControllerFocused).mockReturnValue(false);
  result.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(result.queryByText('Test house')).toBeNull();
  jest.mocked(useControllerFocused).mockReturnValue(true);
  result.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(result.queryByLabelText('Accept ownership')).toBeNull();
});

test('expired offers and failed reads hide action buttons and retain refresh', () => {
  const result = openScreen({ role: 'Admin', offer: { ...offer, expiresAt: '2020-01-01T00:00:00Z' } });
  expect(result.queryByLabelText('Review ownership')).toBeNull();
  expect(result.getByText('This offer has expired')).toBeTruthy();
  const error = 'Sign out and sign back in with your password.';
  jest.mocked(useOwnershipTransfer).mockReturnValue({ ...model, error });
  result.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(result.getByText(error)).toBeTruthy();
  expect(result.queryByLabelText('Review offer')).toBeNull();
  fireEvent.press(result.getByLabelText('Refresh status'));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('a mismatched offer or missing identity cannot display recipient details or actions', () => {
  const screen = openScreen({ role: 'Member', offer: { ...offer, direction: 'outgoing' } });
  expect(screen.getByText('Ownership has changed')).toBeTruthy();
  expect(screen.queryByText(offer.homeName)).toBeNull();
  expect(screen.queryByLabelText('Cancel offer')).toBeNull();
  jest.mocked(useOwnershipTransfer).mockReturnValue({ ...model, scopeKey: null, offer, notice: 'Private status' });
  screen.rerender(<OwnershipTransferScreen {...screenProps} />);
  expect(screen.getByText('Ownership unavailable')).toBeTruthy();
  expect(screen.queryByText('Private status')).toBeNull();
  expect(screen.queryByLabelText('Refresh status')).toBeNull();
  expect(screen.queryByLabelText('Review ownership')).toBeNull();
});
