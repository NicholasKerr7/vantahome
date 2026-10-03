import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useHomeStore } from '../../../../store/useHomeStore';

const mockPrepare = jest.fn();
jest.mock('../../../../services/modelSimulationSetup', () => ({
  ...jest.requireActual('../../../../services/modelSimulationSetup'),
  prepareModelSimulation: () => mockPrepare(),
}));
jest.mock('../../../../components/CinematicSurface', () => ({ __esModule: true, default: require('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
import ModelSimulationSetup from '../ModelSimulationSetup';

const initial = useHomeStore.getInitialState();
const owner = { id: 'owner', name: 'Owner', role: 'Owner' as const, status: 'home' as const };
beforeEach(() => {
  jest.clearAllMocks();
  mockPrepare.mockResolvedValue(undefined);
  useHomeStore.setState({ ...initial, authenticatedUserId: 'owner', accountUserId: 'owner', activeHomeId: 'home', accountHomeId: 'home',
    membershipReady: true, sessionEpoch: 4, activeMemberId: 'owner', household: [owner], devices: [], rooms: [] });
});
afterEach(() => { useHomeStore.setState(initial); jest.restoreAllMocks(); });

test('owner sees an explicit simulation introduction without automatic seeding', () => {
  const screen = render(<ModelSimulationSetup />);
  expect(screen.getByText('Your home, in 3D')).toBeTruthy();
  expect(screen.getByText('20 modeled spaces')).toBeTruthy();
  expect(screen.getByText('92 virtual devices')).toBeTruthy();
  expect(screen.getByText(/^Simulation only/)).toBeTruthy();
  expect(mockPrepare).not.toHaveBeenCalled();
});

test.each(['Admin', 'Member', 'Guest', 'Tenant'] as const)('does not expose owner setup to %s', (role) => {
  useHomeStore.setState({ household: [{ ...owner, role }] });
  const screen = render(<ModelSimulationSetup />);
  expect(screen.queryByLabelText('Prepare my 3D simulation')).toBeNull();
  expect(mockPrepare).not.toHaveBeenCalled();
});

test('prevents repeated taps while creating and then yields to the ready scene', async () => {
  let complete!: () => void;
  mockPrepare.mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
  const screen = render(<ModelSimulationSetup />);
  const button = screen.getByLabelText('Prepare my 3D simulation');
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockPrepare).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.getByText('Preparing your home…')).toBeTruthy();
  await act(async () => {
    useHomeStore.setState({ rooms: [{ id: 'cloud-room', name: 'Living room', modelRoomId: 'living' }] });
    complete();
  });
  expect(screen.queryByLabelText('Prepare my 3D simulation')).toBeNull();
});

test('keeps failure visible and offers an explicit safe retry', async () => {
  mockPrepare.mockRejectedValueOnce(new Error('The home connection was interrupted.'));
  const screen = render(<ModelSimulationSetup />);
  fireEvent.press(screen.getByLabelText('Prepare my 3D simulation'));
  await waitFor(() => expect(screen.getByText('The home connection was interrupted.')).toBeTruthy());
  expect(screen.getByText('Retry setup')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Prepare my 3D simulation'));
  await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('The home connection was interrupted.')).toBeNull());
});

test('discards a prior login error after a same-account session changes', async () => {
  let fail!: (error: Error) => void;
  mockPrepare.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
  const screen = render(<ModelSimulationSetup />);
  fireEvent.press(screen.getByLabelText('Prepare my 3D simulation'));
  await act(async () => {
    useHomeStore.setState({ sessionEpoch: 5 });
    fail(new Error('Previous session failure'));
  });
  expect(screen.queryByText('Previous session failure')).toBeNull();
  expect(screen.getByLabelText('Prepare my 3D simulation')).not.toBeDisabled();
});


test.each([{ width: 375, height: 667, titleSize: 22 }, { width: 393, height: 852, titleSize: 24 }])(
  'keeps readable compact typography at $width by $height without constraining enlarged text', ({ width, height, titleSize }) => {
    jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions')
      .mockReturnValue({ width, height, scale: 2, fontScale: 1 });
    const screen = render(<ModelSimulationSetup />);
    expect(screen.getByText('Your home, in 3D')).toHaveStyle({ fontSize: titleSize });
    expect(screen.getByLabelText('Prepare my 3D simulation')).toHaveStyle({ minHeight: 50 });
    expect(screen.getByText('Your home, in 3D').props.numberOfLines).toBeUndefined();
  },
);
