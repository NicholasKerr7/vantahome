import React from 'react';
import { Animated, ScrollView, StyleSheet } from 'react-native';
import Svg from 'react-native-svg';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { OpeningController } from '../OpeningController';
import { OpeningControllerArtwork } from '../OpeningControllerArtwork';
import { createOpeningPositionStyles } from '../OpeningControllerStyles';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';
import * as positionMotion from '../useDevicePositionMotion';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => jest.restoreAllMocks());

const fixtures = [
  ['entry-door', 'door'], ['utility-shutter', 'garage'], ['kitchen-window', 'window'],
] as const;

/** Exercise the real canonical position projection while capturing selected-fixture commands. */
function setup(id = 'entry-door') {
  const device = getDevice(id)!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, level: 40 };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<OpeningController {...props} />), props, client };
}

/** Use the real native inspector to cover hydration, current grants and keyed selection. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'entry-door', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

/** Read the test renderer's interpolation value without widening production animation types. */
function readTransform(value: Animated.AnimatedInterpolation<string | number> | undefined): string | number {
  if (!value) throw new Error('Expected an interpolated transform');
  return (value as unknown as { __getValue: () => string | number }).__getValue();
}

test.each(fixtures)('%s keeps regular, compact and large-text targets at least 44 points', (id) => {
  const { screen, props } = setup(id);
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<OpeningController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of screen.getAllByRole('button')) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(screen.queryByLabelText('Next controls page')).toBeNull();
  }
});

test.each(fixtures)('%s absolute and rapid relative actions remain scoped and do not optimistically move artwork', (id, kind) => {
  const { screen, client } = setup(id);
  for (const [label, action] of [
    [`Open ${kind} fully`, `${kind}-command-open`],
    [`Close ${kind} fully`, `${kind}-command-close`],
    [`Increase ${kind} opening by 5 percent`, `${kind}-position-up`],
    [`Decrease ${kind} opening by 5 percent`, `${kind}-position-down`],
  ]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([[id, action], [id, action]]);
    expect(screen.getByLabelText(`${kind} opening: 40%`)).toBeTruthy();
    expect(screen.UNSAFE_getByType(OpeningControllerArtwork).props.position).toBe(40);
  }
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
});

test.each(fixtures)('%s boundaries follow accepted position rather than an inconsistent power bit', (id, kind) => {
  const { screen, props, client } = setup(id);
  screen.rerender(<OpeningController {...props} state={{ on: true, level: 0 }} />);
  expect(screen.getByText(/^Closed ·/)).toBeTruthy();
  expect(screen.getByLabelText(`Close ${kind} fully`).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText(`Decrease ${kind} opening by 5 percent`).props.accessibilityState.disabled).toBe(true);
  screen.rerender(<OpeningController {...props} state={{ on: false, level: 100 }} />);
  expect(screen.getByText(/^Fully open ·/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(`Open ${kind} fully`));
  fireEvent.press(screen.getByLabelText(`Increase ${kind} opening by 5 percent`));
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText(`Close ${kind} fully`).props.accessibilityState.disabled).toBe(false);
  expect(screen.queryByText(/locked|secured|safe to close/i)).toBeNull();
});

test.each(fixtures)('%s unknown positions hide movable geometry and disable relative steps but allow explicit recovery', (id, kind) => {
  const { screen, props, client } = setup(id);
  screen.rerender(<OpeningController {...props} state={{ on: false, level: NaN }} />);
  expect(screen.getByText(/^Position unavailable ·/)).toBeTruthy();
  expect(screen.getByTestId('opening-preview-unknown', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.UNSAFE_getByType(OpeningControllerArtwork).props.position).toBeNull();
  for (const direction of ['Increase', 'Decrease']) {
    const button = screen.getByLabelText(`${direction} ${kind} opening by 5 percent`);
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`Open ${kind} fully`));
  fireEvent.press(screen.getByLabelText(`Close ${kind} fully`));
  expect(client.runAction.mock.calls).toEqual([[id, `${kind}-command-open`], [id, `${kind}-command-close`]]);
});

test('Vent is an explicit window-only 25 percent action, including recovery from unavailable position', () => {
  const { screen, props, client } = setup('kitchen-window');
  fireEvent.press(screen.getByLabelText('Vent window to 25 percent'));
  expect(client.runAction).toHaveBeenLastCalledWith('kitchen-window', 'window-vent');
  screen.rerender(<OpeningController {...props} state={{ ...props.state, level: 25 }} />);
  expect(screen.getByLabelText('Vent window to 25 percent').props.accessibilityState.disabled).toBe(true);
  screen.rerender(<OpeningController {...props} state={{ ...props.state, level: NaN }} />);
  fireEvent.press(screen.getByLabelText('Vent window to 25 percent'));
  expect(client.runAction).toHaveBeenCalledTimes(2);
  for (const id of ['entry-door', 'utility-shutter']) {
    screen.rerender(<OpeningController {...props} device={getDevice(id)!} />);
    expect(screen.queryByLabelText('Vent window to 25 percent')).toBeNull();
  }
});

test('mechanical transforms retain side/top hinges and the existing roller compression endpoint', () => {
  const closed = createOpeningPositionStyles(new Animated.Value(0));
  const open = createOpeningPositionStyles(new Animated.Value(100));
  expect(readTransform(closed.door.transform[1].rotateY)).toBe('0deg');
  expect(readTransform(open.door.transform[1].rotateY)).toBe('-90deg');
  expect(readTransform(open.window.transform[1].rotateX)).toBe('60deg');
  expect(readTransform(open.garage.transform[0].scaleY)).toBeCloseTo(0.018);
});

test.each(fixtures)('%s SVG brushes resolve within their own native root', (id) => {
  const { screen } = setup(id);
  for (const svg of screen.UNSAFE_getAllByType(Svg)) {
    const nodes: Array<{ props: Record<string, unknown> }> = svg.findAll(() => true);
    const ids = new Set(nodes.map((node) => node.props.id).filter(Boolean));
    for (const node of nodes) {
      const paint = node.props.fill;
      const brushId = typeof paint === 'string' ? /^url\(#(.+)\)$/.exec(paint)?.[1] : undefined;
      if (brushId) expect(ids.has(brushId)).toBe(true);
    }
  }
});

test.each(fixtures)('%s read-only access blocks every write while More remains reachable', (id, kind) => {
  const { screen, props, client } = setup(id);
  screen.rerender(<OpeningController {...props} disabled />);
  for (const control of screen.getAllByRole('button')) {
    if (control.props.accessibilityLabel === `More ${kind} controls`) continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`More ${kind} controls`));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('a deferred opening command rechecks household authorization at dispatch', () => {
  const original = useHomeStore.getState();
  const device = getDevice('entry-door')!;
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: device.roomId, name: 'Entry', modelRoomId: device.roomId }],
    devices: [{ id: 'saved-door', modelDeviceId: device.id, name: 'Door', roomId: device.roomId, kind: 'door', isOn: false }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<OpeningController device={device} state={{ on: false, level: 0 }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} motionAllowed={false} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Open door fully'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Open door fully' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More unmounts animated artwork; changing fixtures resets advanced navigation and preserves other controller routes', () => {
  const { screen, props } = renderInspector();
  for (const [id, kind] of fixtures) {
    screen.rerender(<DeviceControlsSheet {...props} deviceId={id} />);
    fireEvent.press(screen.getByLabelText(`More ${kind} controls`));
    expect(screen.UNSAFE_queryByType(OpeningControllerArtwork)).toBeNull();
    for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back to opening controller'));
    expect(screen.getByTestId('opening-tactile-controller')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(`More ${kind} controls`));
  }
  screen.rerender(<DeviceControlsSheet {...props} deviceId="entry-gate" />);
  expect(screen.getByTestId('gate-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('opening-tactile-controller')).toBeTruthy();
});

test('accepted percentage and saved motion policy reach artwork without adding local device state', () => {
  const motion = jest.spyOn(positionMotion, 'useDevicePositionMotion');
  const { screen, props } = setup();
  expect(motion).toHaveBeenLastCalledWith(40, true);
  screen.rerender(<OpeningController {...props} state={{ ...props.state, level: 75 }} motionAllowed={false} />);
  expect(motion).toHaveBeenLastCalledWith(75, false);
  screen.unmount();
  const inspector = renderInspector();
  inspector.screen.rerender(<DeviceControlsSheet {...inspector.props} motionAllowed
    snapshot={{ ...inspector.props.snapshot, state: { ...inspector.props.snapshot.state, motionDisabled: true } }} />);
  expect(inspector.screen.UNSAFE_getByType(OpeningControllerArtwork).props.motionAllowed).toBe(false);
});

test('unread state and revoked grants never expose editable default opening positions', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('opening-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Open door fully'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('opening-tactile-controller')).toBeNull();
});
