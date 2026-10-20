import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { VACUUM_MODE_OPTIONS } from '../../../../packages/home-scene/src/vacuumController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { VacuumController } from '../VacuumController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => jest.restoreAllMocks());

/** Keep the real projection while making every requested command observable. */
function setup() {
  const device = getDevice('living-vacuum')!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, settings: { status: 'docked' } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, onMore: jest.fn() };
  return { screen: render(<VacuumController {...props} />), props, client };
}

/** Use the production inspector's hydration, current-access and keyed navigation boundaries. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'living-vacuum', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('compact and large-text controls retain touch targets and contained scroll recovery', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<VacuumController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(screen.getByTestId('vacuum-preview-model', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByLabelText('Next controls page')).toBeNull();
  }
});

test.each([
  [false, 'docked', 'Start cleaning', 'vacuum-start', true],
  [false, 'paused', 'Resume cleaning', 'vacuum-start', false],
  [true, 'cleaning', 'Pause cleaning', 'vacuum-pause', false],
  [false, 'cleaning', 'Start cleaning', 'vacuum-start', false],
] as const)('activity %s/%s exposes the correct explicit cleaning command', (on, status, label, action, dockDisabled) => {
  const { screen, props, client } = setup();
  screen.rerender(<VacuumController {...props} state={{ ...props.state, on, settings: { status } }} />);
  fireEvent.press(screen.getByLabelText(label));
  expect(client.runAction).toHaveBeenCalledWith('living-vacuum', action);
  const dock = screen.getByLabelText('Dock vacuum');
  expect(dock.props.accessibilityState.disabled).toBe(dockDisabled);
  fireEvent.press(dock);
  if (!dockDisabled) expect(client.runAction).toHaveBeenLastCalledWith('living-vacuum', 'vacuum-dock');
  else expect(client.runAction).toHaveBeenCalledTimes(1);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
});

test('mode, suction, mop and quiet preferences preserve docked activity and independent samples', () => {
  const { screen, props, client } = setup();
  expect(screen.getByLabelText('Battery sample: 86%')).toBeTruthy();
  for (const option of VACUUM_MODE_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `Vacuum mode: ${option.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('living-vacuum', 'vacuumMode', option.value);
  }
  for (const [label, action] of [['Increase vacuum suction', 'vacuum-suction-up'], ['Decrease vacuum suction', 'vacuum-suction-down']]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['living-vacuum', action], ['living-vacuum', action]]);
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Vacuum mop preference' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('living-vacuum', 'vacuumMop', true);
  fireEvent.press(screen.getByRole('switch', { name: 'Vacuum quiet preference' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('living-vacuum', 'vacuumQuietMode', true);
  expect(screen.getByRole('radio', { name: 'Vacuum mode: Auto' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Start cleaning')).toBeTruthy();
  expect(screen.getByText('Local activity preview · Preferences saved\nNo route or cleaning progress is measured')).toBeTruthy();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(props.state.settings).toEqual({ status: 'docked' });
});

test.each([[0, 'Decrease'], [100, 'Increase']] as const)('suction %s preserves a disabled boundary without changing activity', (vacuumSuction, direction) => {
  const { screen, props, client } = setup();
  screen.rerender(<VacuumController {...props} state={{ ...props.state, settings: { status: 'paused', vacuumSuction } }} />);
  const button = screen.getByLabelText(`${direction} vacuum suction`);
  expect(button.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(button);
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Resume cleaning')).toBeTruthy();
});

test('unknown battery stays distinct from zero and sample care warnings do not invent progress', () => {
  const { screen, props } = setup();
  screen.rerender(<VacuumController {...props} state={{ ...props.state, settings: { battery: 0, vacuumBinFull: true, vacuumBrushDirty: true, vacuumFilterLife: 7 } }} />);
  expect(screen.getByLabelText('Battery sample: 0%')).toBeTruthy();
  expect(screen.getByText('Care sample · Empty bin · Clean brush · Check filter')).toBeTruthy();
  screen.rerender(<VacuumController {...props} state={{ ...props.state, settings: { battery: Number.NaN } }} />);
  expect(screen.getByLabelText('Battery sample: Unavailable')).toBeTruthy();
  expect(screen.queryByText('NaN')).toBeNull();
  expect(screen.queryByText(/charging|returning|estimated|remaining/i)).toBeNull();
});

test('read-only state disables every write while leaving More available', () => {
  const { screen, props, client } = setup();
  screen.rerender(<VacuumController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More vacuum controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More vacuum controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('a deferred native cleaning command rechecks current household access', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'living', name: 'Living', modelRoomId: 'living' }],
    devices: [{ id: 'saved-vacuum', modelDeviceId: 'living-vacuum', name: 'Vacuum', roomId: 'living', kind: 'vacuum', isOn: false }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<VacuumController device={getDevice('living-vacuum')!} state={{ on: false, level: 70, settings: { status: 'docked' } }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Start cleaning'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Start cleaning' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More preserves the original inspector and device switches reset the controller', () => {
  const { screen, props } = renderInspector();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More vacuum controls'));
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to vacuum controller'));
  expect(screen.getByTestId('vacuum-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More vacuum controls'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="utility-water-heater" />);
  expect(screen.getByTestId('water-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('vacuum-tactile-controller')).toBeTruthy();
});

test('unread saved state and revoked grants do not reveal writable defaults', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('vacuum-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Start cleaning'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('vacuum-tactile-controller')).toBeNull();
});
