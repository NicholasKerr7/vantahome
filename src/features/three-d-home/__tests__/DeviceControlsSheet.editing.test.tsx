import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createDefaultDevicePlacement, replaceRuntimeDevices } from '../../../../packages/home-scene/src/devicePlacement';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type Device, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  // Resolve only the tested lazy boundary; Jest does not execute Metro's dynamic-import transform.
  return { ...actual, lazy: (loader: () => unknown) => loader.toString().includes('SimulationDeviceEditor')
    ? require('../../devices/SimulationDeviceEditor').default : actual.lazy(loader as Parameters<typeof actual.lazy>[0]) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
jest.mock('../../devices/SimulationDeviceEditor', () => ({ __esModule: true,
  default: ({ deviceId, onClose, onSaved }: { deviceId: string; onClose: () => void; onSaved: (deviceId: string) => void }) => {
    const { View, Text, Pressable } = require('react-native');
    return <View testID="device-editor"><Text>{deviceId}</Text>
      <Pressable accessibilityLabel="Cancel device edit" onPress={onClose} />
      <Pressable accessibilityLabel="Return to controls" onPress={() => onSaved(deviceId)} />
    </View>;
  },
}));

const seed = useHomeStore.getState();
const deviceId = '33333333-3333-4333-8333-333333333333';
const modelDeviceId = `placed-${deviceId}`;
const original: Device = { id: deviceId, modelDeviceId, name: 'Reading lamp', roomId: 'room-a', kind: 'light', isOn: true, brightness: 68,
  simulationOnly: true, modelRevision: 4, modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living')! };

beforeEach(() => {
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    sessionEpoch: 12, membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'room-a', name: 'Living room', modelRoomId: 'living' }, { id: 'room-b', name: 'Primary suite', modelRoomId: 'master' }],
    roomMembers: [{ memberId: 'person', roomIds: ['room-a'] }], memberPermissionOverrides: [], devices: [original],
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
  });
});
afterEach(() => { useHomeStore.setState(seed, true); replaceRuntimeDevices([]); });

/** Render the actual native inspector with local simulation settings and observable action handlers. */
function renderControls(options: { ready?: boolean; id?: string } = {}) {
  const client = { toggle: jest.fn(), setLevel: jest.fn(), setPower: jest.fn(), setSetting: jest.fn(), runAction: jest.fn() };
  const state = createDefaultSimulationSnapshot();
  state.deviceStates[modelDeviceId] = { on: true, level: 68, settings: { color: '#FF9AA2', lightColorMode: 'color' } };
  const snapshot: ControlSnapshot = { state, ready: options.ready ?? true, status: 'saved',
    access: { fullHome: false, roomIds: ['living', 'master'], deviceIds: [modelDeviceId], controllableDeviceIds: [modelDeviceId] } };
  const onClose = jest.fn();
  const props = { deviceId: options.id ?? modelDeviceId, client, snapshot, motionAllowed: false, onClose, onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), client, props, onClose };
}

/** Resolve React.lazy before examining the current editor rather than its loading fallback. */
async function openEditor(screen: ReturnType<typeof render>): Promise<void> {
  fireEvent.press(screen.getByLabelText('Edit device'));
  await waitFor(() => expect(screen.getByTestId('device-editor')).toBeTruthy());
}

test.each(['Owner', 'Admin'] as const)('%s can open and cancel the saved device editor without changing controls', async (role) => {
  useHomeStore.setState({ household: [{ id: 'person', name: 'Person', role, status: 'home' }] });
  const { screen, props, client, onClose } = renderControls();
  const initialState = props.snapshot.state.deviceStates[modelDeviceId];
  await openEditor(screen);
  expect(screen.getByText(deviceId)).toBeTruthy();
  expect(screen.queryByLabelText('Close device controls')).toBeNull();
  fireEvent.press(screen.getByLabelText('Cancel device edit'));
  expect(screen.queryByTestId('device-editor')).toBeNull();
  expect(screen.getByRole('header', { name: 'Reading lamp' })).toBeTruthy();
  expect(props.snapshot.state.deviceStates[modelDeviceId]).toEqual(initialState);
  expect(useHomeStore.getState().devices[0]).toEqual(original);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('saving returns to the renamed device in its new room with the same identity and control state', async () => {
  const { screen, props, onClose } = renderControls();
  await openEditor(screen);
  const moved = { ...original, name: 'Primary reading lamp', roomId: 'room-b', modelRevision: 5,
    modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'master')! };
  await act(async () => { useHomeStore.setState({ devices: [moved] }); });
  fireEvent.press(screen.getByLabelText('Return to controls'));
  expect(screen.queryByTestId('device-editor')).toBeNull();
  expect(screen.getByRole('header', { name: moved.name })).toBeTruthy();
  expect(screen.getByText('PRIMARY SUITE')).toBeTruthy();
  expect(props.snapshot.state.deviceStates[modelDeviceId]).toEqual({ on: true, level: 68, settings: { color: '#FF9AA2', lightColorMode: 'color' } });
  expect(useHomeStore.getState().devices).toEqual([moved]);
  expect(onClose).not.toHaveBeenCalled();
});

test('a removed device keeps its already open editor available to show the confirmed removal outcome', async () => {
  const { screen } = renderControls();
  await openEditor(screen);
  await act(async () => { useHomeStore.setState({ devices: [] }); });
  expect(screen.getByTestId('device-editor')).toBeTruthy();
  expect(screen.getByText(deviceId)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Cancel device edit'));
  expect(screen.queryByTestId('device-editor')).toBeNull();
  expect(screen.queryByLabelText('Edit device')).toBeNull();
  expect(useHomeStore.getState().devices).toEqual([]);
});

test.each<HouseholdMember['role']>(['Member', 'Guest', 'Tenant'])('%s cannot open metadata editing despite having device visibility', (role) => {
  useHomeStore.setState({ household: [{ id: 'person', name: 'Person', role, status: 'home' }] });
  const { screen } = renderControls();
  expect(screen.queryByLabelText('Edit device')).toBeNull();
});

test.each([
  { name: 'missing revision', device: { ...original, modelRevision: undefined }, ready: true, id: modelDeviceId },
  { name: 'unread saved controls', device: original, ready: false, id: modelDeviceId },
  { name: 'authored fixture', device: original, ready: true, id: 'living-light' },
])('$name has no edit entry', ({ device, ready, id }) => {
  useHomeStore.setState({ devices: [device] });
  const { screen } = renderControls({ ready, id });
  expect(screen.queryByLabelText('Edit device')).toBeNull();
});

test.each<{ name: string; patch: Partial<HomeState> }>([
  { name: 'role loss', patch: { household: [{ id: 'person', name: 'Person', role: 'Guest', status: 'home' }] } },
  { name: 'session replacement', patch: { sessionEpoch: 13 } },
  { name: 'home replacement', patch: { accountHomeId: 'another-home', activeHomeId: 'another-home' } },
  { name: 'membership recheck', patch: { membershipReady: false } },
])('$name closes the native editor and restoring access does not reopen the old draft', async ({ patch }) => {
  const { screen } = renderControls();
  await openEditor(screen);
  const before = useHomeStore.getState();
  await act(async () => { useHomeStore.setState(patch); });
  expect(screen.queryByTestId('device-editor')).toBeNull();
  await act(async () => { useHomeStore.setState(before, true); });
  expect(screen.queryByTestId('device-editor')).toBeNull();
});

test('a previously rendered Edit callback cannot open the old device in a replacement household', async () => {
  const { screen } = renderControls();
  const deferredEdit = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Edit device'
    && typeof node.props.onPress === 'function')[0].props.onPress as () => void;
  await act(async () => { useHomeStore.setState({ accountHomeId: 'another-home', activeHomeId: 'another-home' }); });
  await act(async () => { deferredEdit(); });
  expect(screen.queryByTestId('device-editor')).toBeNull();
  // The fresh callback remains available to the current administrator and current registry.
  await openEditor(screen);
  expect(screen.getByTestId('device-editor')).toBeTruthy();
});
