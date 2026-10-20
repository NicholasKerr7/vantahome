import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import {
  DRYER_DRYNESS_OPTIONS, DRYER_HEAT_OPTIONS, LAUNDRY_CYCLE_OPTIONS, WASHER_SPIN_OPTIONS, WASHER_TEMPERATURE_OPTIONS,
} from '../../../../packages/home-scene/src/laundryController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { LaundryController } from '../LaundryController';
import { LaundryControllerArtwork } from '../LaundryControllerArtwork';
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

/** Keep the shared projection real while capturing each selected machine's guarded writes. */
function setup(kind: 'washer' | 'dryer' = 'washer') {
  const device = getDevice(`laundry-${kind}`)!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, settings: { laundryActivity: 'idle' } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<LaundryController {...props} />), props, client };
}

/** Exercise real inspector hydration, current grants and keyed selection boundaries. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'laundry-washer', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test.each(['washer', 'dryer'] as const)('%s keeps regular, compact and large-text targets at 44 points', (kind) => {
  const { screen, props } = setup(kind);
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<LaundryController {...props} compact={compact} fontScale={fontScale} />);
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

test.each(['washer', 'dryer'] as const)('%s commands target only the selected machine and wait for accepted state', (kind) => {
  const { screen, props, client } = setup(kind);
  expect(screen.getByLabelText(`Stop ${kind} preview`).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText(`Start ${kind} preview`));
  fireEvent.press(screen.getByLabelText(`Start ${kind} preview`));
  expect(client.runAction.mock.calls).toEqual([[props.device.id, `${kind}-start`], [props.device.id, `${kind}-start`]]);
  expect(screen.getByText('Ready')).toBeTruthy();
  for (const [on, activity, label, action] of [
    [true, 'running', 'Pause', 'pause'], [false, 'paused', 'Resume', 'start'],
  ] as const) {
    screen.rerender(<LaundryController {...props} state={{ ...props.state, on, settings: { ...props.state.settings, laundryActivity: activity } }} />);
    fireEvent.press(screen.getByLabelText(`${label} ${kind} preview`));
    expect(client.runAction).toHaveBeenLastCalledWith(props.device.id, `${kind}-${action}`);
    fireEvent.press(screen.getByLabelText(`Stop ${kind} preview`));
    expect(client.runAction).toHaveBeenLastCalledWith(props.device.id, `${kind}-stop`);
  }
  screen.rerender(<LaundryController {...props} state={{ ...props.state, on: false, settings: { ...props.state.settings, laundryActivity: 'stopped' } }} />);
  expect(screen.getByText('Stopped')).toBeTruthy();
  expect(screen.getByLabelText(`Stop ${kind} preview`).props.accessibilityState.disabled).toBe(true);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
});

test.each(['washer', 'dryer'] as const)('%s preference pickers preserve activity and samples without touching its partner', (kind) => {
  const { screen, props, client } = setup(kind);
  screen.rerender(<LaundryController {...props} state={{ ...props.state, settings: { ...props.state.settings, laundryActivity: 'paused' } }} />);
  const configurations = kind === 'washer'
    ? [{ field: 'washTemp', title: 'Wash temperature', options: WASHER_TEMPERATURE_OPTIONS }, { field: 'spinSpeedRpm', title: 'Spin setting', options: WASHER_SPIN_OPTIONS }]
    : [{ field: 'heatLevel', title: 'Heat level', options: DRYER_HEAT_OPTIONS }, { field: 'drynessLevel', title: 'Dryness level', options: DRYER_DRYNESS_OPTIONS }];
  for (const choice of [{ field: 'cycle', title: 'Cycle', options: LAUNDRY_CYCLE_OPTIONS[kind] }, ...configurations]) {
    for (const option of choice.options) {
      fireEvent.press(screen.getByLabelText(new RegExp(`^${choice.title}:.*Choose setting$`)));
      expect(screen.queryByTestId('laundry-preview-drum')).toBeNull();
      const radio = screen.getByRole('radio', { name: `${choice.title}: ${option.label}` });
      expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(44);
      fireEvent.press(radio);
      expect(client.setSetting).toHaveBeenLastCalledWith(props.device.id, choice.field, option.value);
      expect(screen.getByText('Paused')).toBeTruthy();
    }
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
});

test('drum motion is fixed decorative speed, obeys accepted activity and receives visibility policy', () => {
  const motion = jest.spyOn(rotorMotion, 'useDeviceRotorMotion');
  const { screen, props } = setup();
  expect(motion).toHaveBeenLastCalledWith(0, true);
  for (const spinSpeedRpm of [800, 1200]) {
    screen.rerender(<LaundryController {...props} state={{ ...props.state, on: true, settings: { laundryActivity: 'running', spinSpeedRpm } }} />);
    expect(motion).toHaveBeenLastCalledWith(1.1, true);
  }
  screen.rerender(<LaundryController {...props} motionAllowed={false} state={{ ...props.state, on: true, settings: { laundryActivity: 'running' } }} />);
  expect(motion).toHaveBeenLastCalledWith(1.1, false);
  screen.rerender(<LaundryController {...props} state={{ ...props.state, on: false, settings: { laundryActivity: 'paused' } }} />);
  expect(motion).toHaveBeenLastCalledWith(0, true);
});

test('stack diagram locates the selected machine without partner controls, readings or made-up setup', () => {
  const { screen, props } = setup();
  expect(screen.getByLabelText('Stacked installation. Washer selected below dryer')).toBeTruthy();
  expect(screen.queryByLabelText(/Start dryer|Pause dryer|Select dryer/)).toBeNull();
  screen.rerender(<LaundryController {...props} device={getDevice('laundry-dryer')!} />);
  expect(screen.getByLabelText('Stacked installation. Dryer selected above washer')).toBeTruthy();
  screen.rerender(<LaundryController {...props} device={{ ...props.device, id: 'added-washer' }} />);
  expect(screen.queryByTestId('laundry-stack-position')).toBeNull();
});

test('malformed samples remain unavailable and care feedback needs an explicit lint warning', () => {
  const { screen, props } = setup('dryer');
  screen.rerender(<LaundryController {...props} state={{ ...props.state, settings: { remainingMin: -1, progress: NaN, lintFilterOk: 'unknown' } }} />);
  expect(screen.getByText('Progress sample: Unavailable')).toBeTruthy();
  expect(screen.getByText('Time sample: Unavailable')).toBeTruthy();
  expect(screen.queryByText('Lint sample · Clean filter')).toBeNull();
  screen.rerender(<LaundryController {...props} state={{ ...props.state, settings: { remainingMin: 45, progress: 20, lintFilterOk: false } }} />);
  expect(screen.getByText('Progress sample: 20%')).toBeTruthy();
  expect(screen.getByText('Time sample: 45 min')).toBeTruthy();
  expect(screen.getByText('Lint sample · Clean filter')).toBeTruthy();
  expect(screen.getByText('Local cycle preview · Samples do not count down')).toBeTruthy();
});

test.each(['washer', 'dryer'] as const)('%s read-only state disables writes and leaves More discoverable', (kind) => {
  const { screen, props, client } = setup(kind);
  screen.rerender(<LaundryController {...props} disabled />);
  for (const control of screen.getAllByRole('button')) {
    if (control.props.accessibilityLabel === `More ${kind} controls`) continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(`More ${kind} controls`));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('a picker opened before access loss cannot submit preferences after becoming read-only', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText(/^Cycle:.*Choose setting$/));
  screen.rerender(<LaundryController {...props} disabled />);
  fireEvent.press(screen.getByRole('radio', { name: 'Cycle: Quick' }));
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Back to laundry controller'));
  expect(screen.getByTestId('laundry-tactile-controller')).toBeTruthy();
});

test('a deferred native laundry action rechecks current household access', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'laundry', name: 'Laundry', modelRoomId: 'laundry' }],
    devices: [{ id: 'saved-washer', modelDeviceId: 'laundry-washer', name: 'Washer', roomId: 'laundry', kind: 'washer', isOn: false }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<LaundryController device={getDevice('laundry-washer')!} state={{ on: false, level: 0 }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} motionAllowed={false} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Start washer preview'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Start washer preview' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More removes the drum and returns; changing selected machine resets picker navigation', () => {
  const { screen, props } = renderInspector();
  fireEvent.press(screen.getByLabelText('More washer controls'));
  expect(screen.UNSAFE_queryByType(LaundryControllerArtwork)).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to laundry controller'));
  fireEvent.press(screen.getByLabelText(/^Cycle:.*Choose setting$/));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="laundry-dryer" />);
  expect(screen.getByTestId('laundry-tactile-controller')).toBeTruthy();
  expect(screen.queryByTestId('laundry-choice-picker')).toBeNull();
  fireEvent.press(screen.getByLabelText('More dryer controls'));
  fireEvent.press(screen.getByLabelText('Back to laundry controller'));
  expect(screen.getByTestId('laundry-tactile-controller')).toBeTruthy();
});

test('saved motion policy reaches the laundry artwork independently of system allowance', () => {
  const { screen, props } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: false } }} />);
  expect(screen.UNSAFE_getByType(LaundryControllerArtwork).props.motionAllowed).toBe(true);
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: true } }} />);
  expect(screen.UNSAFE_getByType(LaundryControllerArtwork).props.motionAllowed).toBe(false);
});

test('unread state and revoked visibility never present writable laundry defaults', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('laundry-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Start washer preview'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('laundry-tactile-controller')).toBeNull();
});
