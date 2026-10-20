import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { FAN_DIRECTION_OPTIONS, FAN_SPEED_PRESETS } from '../../../../packages/home-scene/src/fanController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { FanController } from '../FanController';
import { FanControllerArtwork } from '../FanControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => jest.restoreAllMocks());

/** Keep shared state projection real while capturing each scoped command. */
function setup() {
  const device = getDevice('living-fan')!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, level: 60,
    settings: { speed: 60, fanDirection: 'forward', fanSleepMode: false } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<FanController {...props} />), props, client };
}

/** Exercise the real inspector's hydration, motion policy, access and keyed navigation boundaries. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'living-fan', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('regular, compact and large-text controls keep 44-point targets and contained scrolling', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<FanController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch'), ...screen.getAllByRole('radio')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(screen.queryByLabelText('Next controls page')).toBeNull();
    expect(screen.queryByLabelText(/oscillation|integrated light/i)).toBeNull();
  }
});

test('power and rapid relative speed commands use the guarded client without eager visual changes', () => {
  const { screen, client } = setup();
  fireEvent.press(screen.getByRole('switch', { name: 'Fan power' }));
  expect(client.toggle).toHaveBeenCalledWith('living-fan');
  expect(screen.getByRole('switch', { name: 'Fan power' }).props.accessibilityState.checked).toBe(false);
  for (const [label, action] of [['Increase fan speed', 'fan-speed-up'], ['Decrease fan speed', 'fan-speed-down']]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['living-fan', action], ['living-fan', action]]);
  }
  expect(screen.getByLabelText('Saved fan speed: 60%')).toBeTruthy();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
});

test('presets, direction and Sleep change only the selected setting while off', () => {
  const { screen, props, client } = setup();
  for (const preset of FAN_SPEED_PRESETS) {
    fireEvent.press(screen.getByRole('radio', { name: `${preset.label} fan speed: ${preset.value}%` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('living-fan', 'speed', preset.value);
  }
  expect(screen.getByRole('radio', { name: 'Balanced fan speed: 60%' }).props.accessibilityState.checked).toBe(true);
  for (const direction of FAN_DIRECTION_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `Fan direction: ${direction.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('living-fan', 'fanDirection', direction.value);
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Fan Sleep speed limit' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('living-fan', 'fanSleepMode', true);
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(props.state.on).toBe(false);
  expect(screen.getByText('Off · 0% effective')).toBeTruthy();
});

test.each([[0, 'Decrease'], [100, 'Increase']] as const)('saved speed %s keeps its exhausted adjustment disabled', (speed, direction) => {
  const { screen, props, client } = setup();
  screen.rerender(<FanController {...props} state={{ ...props.state, level: speed, settings: { ...props.state.settings, speed } }} />);
  const control = screen.getByLabelText(`${direction} fan speed`);
  expect(control.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(control);
  expect(client.runAction).not.toHaveBeenCalled();
});

test.each([
  [false, 100, true, 'forward', 0, 'Off'],
  [true, 0, false, 'forward', 0, 'Stopped at 0%'],
  [true, 100, true, 'forward', 4.55, 'Sleep preview'],
  [true, 60, false, 'reverse', -7.8, 'Running preview'],
] as const)('on %s speed %s Sleep %s direction %s keeps saved speed separate from effective motion', (on, speed, fanSleepMode, fanDirection, velocity, status) => {
  const { screen, props } = setup();
  screen.rerender(<FanController {...props} state={{ on, level: speed, settings: { speed, fanSleepMode, fanDirection } }} />);
  expect(screen.getByLabelText(`Saved fan speed: ${speed}%`)).toBeTruthy();
  expect(screen.getByText(new RegExp(`^${status} ·`))).toBeTruthy();
  expect(screen.UNSAFE_getByType(FanControllerArtwork).props.velocity).toBeCloseTo(velocity);
  expect(screen.getByRole('switch', { name: 'Fan Sleep speed limit' }).props.accessibilityState.checked).toBe(fanSleepMode);
});

test('read-only state blocks every write while retaining More', () => {
  const { screen, props, client } = setup();
  screen.rerender(<FanController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More fan controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More fan controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('a deferred native fan action rechecks current household access', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'living', name: 'Living', modelRoomId: 'living' }],
    devices: [{ id: 'saved-fan', modelDeviceId: 'living-fan', name: 'Fan', roomId: 'living', kind: 'fan', isOn: false }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<FanController device={getDevice('living-fan')!} state={{ on: false, level: 60 }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} motionAllowed={false} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Increase fan speed'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Increase fan speed' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More removes animated artwork and returns to the console; device switches reset navigation', () => {
  const { screen, props } = renderInspector();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More fan controls'));
  expect(screen.UNSAFE_queryByType(FanControllerArtwork)).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to fan controller'));
  expect(screen.getByTestId('fan-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More fan controls'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="living-speaker" />);
  expect(screen.getByTestId('speaker-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('fan-tactile-controller')).toBeTruthy();
});

test('saved motion-disabled policy reaches artwork independently of system allowance', () => {
  const { screen, props } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: false } }} />);
  expect(screen.UNSAFE_getByType(FanControllerArtwork).props.motionAllowed).toBe(true);
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: true } }} />);
  expect(screen.UNSAFE_getByType(FanControllerArtwork).props.motionAllowed).toBe(false);
});

test('unread saved state and revoked grants never expose writable defaults', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('fan-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Increase fan speed'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('fan-tactile-controller')).toBeNull();
});
