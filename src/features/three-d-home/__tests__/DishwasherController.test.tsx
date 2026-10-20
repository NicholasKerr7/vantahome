import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { DISHWASHER_CYCLE_OPTIONS, DISHWASHER_TEMPERATURE_OPTIONS } from '../../../../packages/home-scene/src/dishwasherController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { DishwasherController } from '../DishwasherController';
import { DishwasherControllerArtwork } from '../DishwasherControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';
import * as rotorMotion from '../useDeviceRotorMotion';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => jest.restoreAllMocks());

/** Preserve real shared projection while capturing selected-device commands and preferences. */
function setup() {
  const device = getDevice('kitchen-dishwasher')!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, settings: { dishwasherActivity: 'idle', extraSpin: false } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<DishwasherController {...props} />), props, client };
}

/** Inspect real hydration, visibility, control and keyed navigation boundaries. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'kitchen-dishwasher', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('regular, compact and large-text controls retain 44-point targets and contained scrolling', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<DishwasherController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
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

test('commands stay scoped and wait for accepted activity instead of optimistically changing the preview', () => {
  const { screen, props, client } = setup();
  expect(screen.getByLabelText('Stop dishwasher preview').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Start dishwasher preview'));
  fireEvent.press(screen.getByLabelText('Start dishwasher preview'));
  expect(client.runAction.mock.calls).toEqual([['kitchen-dishwasher', 'dishwasher-start'], ['kitchen-dishwasher', 'dishwasher-start']]);
  expect(screen.getByText('Ready')).toBeTruthy();
  for (const [on, activity, label, action] of [
    [true, 'running', 'Pause', 'pause'], [false, 'paused', 'Resume', 'start'],
  ] as const) {
    screen.rerender(<DishwasherController {...props} state={{ ...props.state, on, settings: { dishwasherActivity: activity } }} />);
    fireEvent.press(screen.getByLabelText(`${label} dishwasher preview`));
    expect(client.runAction).toHaveBeenLastCalledWith('kitchen-dishwasher', `dishwasher-${action}`);
    fireEvent.press(screen.getByLabelText('Stop dishwasher preview'));
    expect(client.runAction).toHaveBeenLastCalledWith('kitchen-dishwasher', 'dishwasher-stop');
  }
  screen.rerender(<DishwasherController {...props} state={{ ...props.state, settings: { dishwasherActivity: 'stopped' } }} />);
  expect(screen.getByText('Stopped')).toBeTruthy();
  expect(screen.getByLabelText('Stop dishwasher preview').props.accessibilityState.disabled).toBe(true);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
});

test.each(['idle', 'paused', 'stopped'] as const)('program, temperature and Dry Boost edits preserve %s activity and power', (activity) => {
  const { screen, props, client } = setup();
  screen.rerender(<DishwasherController {...props} state={{ ...props.state, settings: { dishwasherActivity: activity, extraSpin: false } }} />);
  for (const choice of [
    { field: 'cycle', title: 'Cycle', options: DISHWASHER_CYCLE_OPTIONS },
    { field: 'washTemp', title: 'Wash temperature', options: DISHWASHER_TEMPERATURE_OPTIONS },
  ]) {
    for (const option of choice.options) {
      fireEvent.press(screen.getByLabelText(new RegExp(`^${choice.title}:.*Choose setting$`)));
      expect(screen.queryByTestId('dishwasher-preview-spray-arm')).toBeNull();
      const radio = screen.getByRole('radio', { name: `${choice.title}: ${option.label}` });
      expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(44);
      fireEvent.press(radio);
      expect(client.setSetting).toHaveBeenLastCalledWith('kitchen-dishwasher', choice.field, option.value);
    }
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Dishwasher Dry Boost preference' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('kitchen-dishwasher', 'extraSpin', true);
  expect(screen.getByRole('switch', { name: 'Dishwasher Dry Boost preference' }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByText(activity === 'paused' ? 'Paused' : activity === 'stopped' ? 'Stopped' : 'Ready')).toBeTruthy();
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
});

test('spray motion and lighting follow accepted running state and ignore saved cycle preferences', () => {
  const motion = jest.spyOn(rotorMotion, 'useDeviceRotorMotion');
  const { screen, props } = setup();
  expect(motion).toHaveBeenLastCalledWith(0, true);
  expect(screen.UNSAFE_getAllByType(G).find((group) => group.props.testID === 'dishwasher-preview-spray')?.props.opacity).toBe(0);
  for (const cycle of ['Quick', 'Intensive']) {
    screen.rerender(<DishwasherController {...props} state={{ ...props.state, on: true, settings: { cycle, washTemp: 'Hot' } }} />);
    expect(motion).toHaveBeenLastCalledWith(0.8, true);
    expect(screen.UNSAFE_getAllByType(G).find((group) => group.props.testID === 'dishwasher-preview-spray')?.props.opacity).toBeGreaterThan(0);
  }
  screen.rerender(<DishwasherController {...props} motionAllowed={false} state={{ ...props.state, on: true }} />);
  expect(motion).toHaveBeenLastCalledWith(0.8, false);
  screen.rerender(<DishwasherController {...props} state={{ ...props.state, settings: { dishwasherActivity: 'paused' } }} />);
  expect(motion).toHaveBeenLastCalledWith(0, true);
  expect(screen.UNSAFE_getAllByType(G).find((group) => group.props.testID === 'dishwasher-preview-spray')?.props.opacity).toBe(0);
});

test('every native SVG brush resolves within its own SVG root', () => {
  const { screen } = setup();
  for (const svg of screen.UNSAFE_getAllByType(Svg)) {
    const nodes: Array<{ props: Record<string, unknown> }> = svg.findAll(() => true);
    const ids = new Set(nodes.map((node) => node.props.id).filter(Boolean));
    for (const node of nodes) {
      const paint = node.props.fill;
      const id = typeof paint === 'string' ? /^url\(#(.+)\)$/.exec(paint)?.[1] : undefined;
      if (id) expect(ids.has(id)).toBe(true);
    }
  }
});

test('malformed readings remain unavailable and valid time/progress remain explicitly fixed samples', () => {
  const { screen, props } = setup();
  screen.rerender(<DishwasherController {...props} state={{ ...props.state, settings: { remainingMin: -1, progress: NaN } }} />);
  expect(screen.getByText('Progress sample: Unavailable')).toBeTruthy();
  expect(screen.getByText('Time sample: Unavailable')).toBeTruthy();
  screen.rerender(<DishwasherController {...props} state={{ ...props.state, settings: { remainingMin: 58, progress: 20 } }} />);
  expect(screen.getByText('Progress sample: 20%')).toBeTruthy();
  expect(screen.getByText('Time sample: 58 min')).toBeTruthy();
  expect(screen.getByText('Local wash preview · Samples do not count down')).toBeTruthy();
  expect(screen.queryByLabelText(/door|lock|release/i)).toBeNull();
});

test('read-only access blocks writes while More remains available', () => {
  const { screen, props, client } = setup();
  screen.rerender(<DishwasherController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More dishwasher controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More dishwasher controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('access lost while a picker is open prevents preference submission', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText(/^Cycle:.*Choose setting$/));
  screen.rerender(<DishwasherController {...props} disabled />);
  fireEvent.press(screen.getByRole('radio', { name: 'Cycle: Quick' }));
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Back to dishwasher controller'));
  expect(screen.getByTestId('dishwasher-tactile-controller')).toBeTruthy();
});

test('a deferred dishwasher command rechecks current household authorization', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'kitchen', name: 'Kitchen', modelRoomId: 'kitchen' }],
    devices: [{ id: 'saved-dishwasher', modelDeviceId: 'kitchen-dishwasher', name: 'Dishwasher', roomId: 'kitchen', kind: 'dishwasher', isOn: false }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<DishwasherController device={getDevice('kitchen-dishwasher')!} state={{ on: false, level: 0 }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} motionAllowed={false} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Start dishwasher preview'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Start dishwasher preview' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More unmounts the spray preview and selection changes reset picker navigation', () => {
  const { screen, props } = renderInspector();
  fireEvent.press(screen.getByLabelText('More dishwasher controls'));
  expect(screen.UNSAFE_queryByType(DishwasherControllerArtwork)).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to dishwasher controller'));
  fireEvent.press(screen.getByLabelText(/^Cycle:.*Choose setting$/));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="laundry-washer" />);
  expect(screen.getByTestId('laundry-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('dishwasher-tactile-controller')).toBeTruthy();
  expect(screen.queryByTestId('dishwasher-choice-picker')).toBeNull();
});

test('saved motion-disabled policy reaches the spray artwork', () => {
  const { screen, props } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: false } }} />);
  expect(screen.UNSAFE_getByType(DishwasherControllerArtwork).props.motionAllowed).toBe(true);
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: true } }} />);
  expect(screen.UNSAFE_getByType(DishwasherControllerArtwork).props.motionAllowed).toBe(false);
});

test('unread saved state and revoked visibility never expose writable defaults', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('dishwasher-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Start dishwasher preview'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('dishwasher-tactile-controller')).toBeNull();
});
