import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HouseholdSyncPanel } from './HouseholdSyncPanel';
import { useHouseholdSync } from './useHouseholdSync';

jest.mock('./useHouseholdSync', () => ({ useHouseholdSync: jest.fn() }), { virtual: true });
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

type SyncModel = ReturnType<typeof useHouseholdSync>;
let model: SyncModel;

/** Isolate presentation from the hook's separately verified authorization and network lifecycle. */
function localOwner(): SyncModel {
  return {
    scopeKey: 'owner:willow', available: true, owner: true, status: 'local',
    homeName: 'Willow House', deviceCount: 92, lastSyncedAt: null, error: null, busy: false, review: null,
    reviewEnable: jest.fn().mockResolvedValue(undefined), cancelReview: jest.fn(),
    enable: jest.fn().mockResolvedValue(undefined), refresh: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  model = localOwner();
  jest.mocked(useHouseholdSync).mockImplementation(() => model);
});

test('explains the local simulation boundary before the Owner reviews sharing', () => {
  render(<HouseholdSyncPanel />);
  expect(screen.getByText('Saved on this phone')).toBeTruthy();
  expect(screen.getByText('Willow House')).toBeTruthy();
  expect(screen.getByText('92 simulated devices on this phone')).toBeTruthy();
  expect(screen.getByText(/No hub or physical equipment is connected/)).toBeTruthy();
  expect(screen.getByText(/Scene, routine and profile definitions stay local/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Review sharing' }));
  expect(model.reviewEnable).toHaveBeenCalledTimes(1);
  expect(model.enable).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Enable sharing' })).toBeNull();
});

test('reviews the exact home and saved device count before the separate enable action', () => {
  model.review = { homeName: 'The long verified name of Willow House and Garden', deviceCount: 1 };
  render(<HouseholdSyncPanel />);
  expect(screen.getByText(model.review.homeName)).toBeTruthy();
  expect(screen.getByText('1 simulated device')).toBeTruthy();
  expect(screen.getByText('Start with the saved device state on this phone.')).toBeTruthy();
  expect(screen.getByText(/Other phones will adopt this shared state.*previous local caches are retained/)).toBeTruthy();
  expect(screen.getByText(/only if it is still disabled.*never replaced/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Enable sharing' }));
  expect(model.enable).toHaveBeenCalledTimes(1);
});

test('lets the Owner leave review without starting sharing', () => {
  model.review = { homeName: model.homeName, deviceCount: model.deviceCount };
  render(<HouseholdSyncPanel />);
  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  expect(model.cancelReview).toHaveBeenCalledTimes(1);
  expect(model.enable).not.toHaveBeenCalled();
});

test('offers other household members a refresh but no seeding action or retained review', () => {
  model.owner = false;
  model.review = { homeName: model.homeName, deviceCount: model.deviceCount };
  render(<HouseholdSyncPanel />);
  expect(screen.getByText(/Only the home’s Owner can enable sharing/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Review sharing' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable sharing' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Reconnect shared home' }));
  expect(model.refresh).toHaveBeenCalledTimes(1);
  expect(model.enable).not.toHaveBeenCalled();
});

test.each(['checking', 'connecting', 'live', 'syncing', 'offline', 'conflict', 'unavailable'] as const)(
  'never offers an initial baseline while status is %s', status => {
    model.status = status;
    render(<HouseholdSyncPanel />);
    expect(screen.queryByRole('button', { name: 'Review sharing' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enable sharing' })).toBeNull();
    expect(model.enable).not.toHaveBeenCalled();
  },
);

test.each(['checking', 'connecting', 'syncing'] as const)('disables refresh while %s', status => {
  model.status = status;
  render(<HouseholdSyncPanel />);
  expect(screen.getByRole('button', { name: 'Reconnect shared home' })).toBeDisabled();
});

test('shows a verified receipt for the live home without offering disable or reset', () => {
  model.status = 'live';
  model.lastSyncedAt = Date.parse('2026-11-04T16:30:00Z');
  render(<HouseholdSyncPanel />);
  expect(screen.getByText('Shared home is live')).toBeTruthy();
  expect(screen.getByText(/Last verified ·/)).not.toHaveTextContent('Not yet verified');
  expect(screen.queryByRole('button', { name: /disable|reset/i })).toBeNull();
});

test.each([null, Number.NaN, Number.POSITIVE_INFINITY, 9e99])('does not invent a receipt for invalid time %s', lastSyncedAt => {
  model.status = 'offline';
  model.lastSyncedAt = lastSyncedAt;
  render(<HouseholdSyncPanel />);
  expect(screen.getByText('Last verified · Not yet verified')).toBeTruthy();
});

test('keeps failures actionable through reconnect and clears stale live presentation', () => {
  model.status = 'offline';
  model.error = 'Could not verify the shared simulation. Please reconnect.';
  render(<HouseholdSyncPanel />);
  expect(screen.getByRole('alert')).toHaveTextContent(model.error);
  expect(screen.queryByText('Shared home is live')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Reconnect shared home' }));
  expect(model.refresh).toHaveBeenCalledTimes(1);
  expect(model.reviewEnable).not.toHaveBeenCalled();
});

test('blocks baseline review and confirmation after a verification error', () => {
  model.error = 'Refresh your household access before continuing.';
  model.review = { homeName: model.homeName, deviceCount: model.deviceCount };
  render(<HouseholdSyncPanel />);
  expect(screen.queryByRole('button', { name: 'Review sharing' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeDisabled();
});

test.each(['connecting', 'live', 'offline', 'conflict', 'unavailable'] as const)(
  'cannot confirm a retained local review after the shared home becomes %s', status => {
    model.review = { homeName: model.homeName, deviceCount: model.deviceCount };
    const view = render(<HouseholdSyncPanel />);
    model = { ...model, status };
    view.rerender(<HouseholdSyncPanel />);
    fireEvent.press(screen.getByRole('button', { name: 'Enable sharing' }));
    expect(screen.getByRole('button', { name: 'Enable sharing' })).toBeDisabled();
    expect(model.enable).not.toHaveBeenCalled();
  },
);

test('disables repeated mutations while an enable request is pending', () => {
  model.busy = true;
  model.review = { homeName: model.homeName, deviceCount: model.deviceCount };
  render(<HouseholdSyncPanel />);
  expect(screen.getByRole('button', { name: 'Enabling…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
});

test('immediately hides home identity, errors and retained review when account scope disappears', () => {
  model.review = { homeName: model.homeName, deviceCount: model.deviceCount };
  const view = render(<HouseholdSyncPanel />);
  model = { ...model, scopeKey: null, error: 'Private previous household error' };
  view.rerender(<HouseholdSyncPanel />);
  expect(screen.queryByText('Willow House')).toBeNull();
  expect(screen.queryByText(model.error!)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable sharing' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reconnect shared home' })).toBeNull();
  expect(screen.getByText('Shared home unavailable')).toBeTruthy();
});

test('explains connected-account availability without exposing local household details', () => {
  model.available = false;
  render(<HouseholdSyncPanel />);
  expect(screen.getByText('Connect your household account to share simulated device states.')).toBeTruthy();
  expect(screen.queryByText('Willow House')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Review sharing' })).toBeNull();
});
