import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { GateController } from '../GateController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

/** Start from an explicit partial opening so each command is tested against known current state. */
function setup(state: DeviceState = { on: true, level: 50 }, compact = false, fontScale = 1) {
  const device = getDevice('entry-gate')!;
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, fontScale, disabled: false, onMore: jest.fn() };
  return { screen: render(<GateController {...props} />), props, client };
}

/** Inspect the original SVG or Pressable property before the native implementation translates it. */
function forwardedProp(screen: ReturnType<typeof render>, selector: string, prop: string): unknown {
  const node = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
    (candidate.props.accessibilityLabel === selector || candidate.props.testID === selector) && Object.hasOwn(candidate.props, prop))[0];
  if (!node) throw new Error(`Missing controller prop: ${selector} / ${prop}`);
  return node.props[prop];
}

/** Keep hydration, existing controllers and the keyed advanced inspector real in integration tests. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  snapshot.state.deviceStates['entry-gate'] = { on: true, level: 50 };
  const props = { deviceId: 'entry-gate', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test.each([[false, 1], [true, 1], [true, 1.8]] as const)('keeps complete gate controls at 44pt with compact=%s and font=%s', (compact, fontScale) => {
  const { screen } = setup(undefined, compact, fontScale);
  for (const control of screen.getAllByRole('button')) {
    const style = StyleSheet.flatten(control.props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  }
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
  expect(screen.getByLabelText('Gate 50 percent open')).toBeTruthy();
  expect(screen.queryByLabelText('Next controls page')).toBeNull();
});

test('Open and Close use canonical actions repeatedly without predicting accepted position or phase', () => {
  const { screen, props, client } = setup();
  const pose = forwardedProp(screen, 'gate-preview-panel', 'x');
  for (const [label, action] of [['Open gate fully', 'gate-command-open'], ['Close gate', 'gate-command-close']]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['entry-gate', action], ['entry-gate', action]]);
  }
  expect(screen.getByLabelText('Gate 50 percent open')).toBeTruthy();
  expect(forwardedProp(screen, 'gate-preview-panel', 'x')).toBe(pose);
  screen.rerender(<GateController {...props} state={{ on: true, level: 50, settings: { gatePhase: 'closing', gateCloseTargetPercent: 0 } }} />);
  expect(screen.getByText('Closing preview · 50% open')).toBeTruthy();
  expect(forwardedProp(screen, 'gate-preview-panel', 'x')).toBe(pose);
  screen.rerender(<GateController {...props} state={{ on: true, level: 25, settings: { gatePhase: 'closing', gateCloseTargetPercent: 0 } }} />);
  expect(forwardedProp(screen, 'gate-preview-panel', 'x')).not.toBe(pose);
  expect(screen.getByLabelText('Gate 25 percent open')).toBeTruthy();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
});

test('Open remains available to cancel a newly accepted closing request while still fully open', () => {
  const { screen, client } = setup({ on: true, level: 100, settings: { gatePhase: 'closing', gateCloseTargetPercent: 0 } });
  expect(screen.getByLabelText('Open gate fully').props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByLabelText('Open gate fully'));
  expect(client.runAction).toHaveBeenCalledWith('entry-gate', 'gate-command-open');
});

test.each([
  ['gateVehiclePresent', 'Vehicle present'], ['gateBeamBlocked', 'Safety beam blocked'], ['gateSensorFault', 'Safety-sensor fault'],
] as const)('%s blocks both movement directions and exposes the reason', (field, reason) => {
  const { screen, client } = setup({ on: true, level: 50, settings: { [field]: true } });
  for (const label of ['Open gate fully', 'Close gate']) {
    const control = screen.getByLabelText(label);
    expect(control.props.accessibilityState.disabled).toBe(true);
    expect(control.props.accessibilityHint).toBe(reason);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.queryByText('Clear in simulation')).toBeNull();
});

test('Hold and Release retain their actual commands and an active emergency cannot be released', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Hold gate open'));
  expect(client.runAction).toHaveBeenLastCalledWith('entry-gate', 'gate-hold-open');
  screen.rerender(<GateController {...props} state={{ on: true, level: 100, settings: { gateHoldOpen: true } }} />);
  expect(screen.getByLabelText('Close gate').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Release gate hold'));
  expect(client.runAction).toHaveBeenLastCalledWith('entry-gate', 'gate-release-hold');
  screen.rerender(<GateController {...props} state={{ on: true, level: 100, settings: { gateEmergencyHold: true, gateEmergencyActive: true } }} />);
  expect(screen.getByLabelText('Release gate hold').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Release gate hold'));
  expect(client.runAction).toHaveBeenCalledTimes(2);
});

test('auto-close uses only the sampled countdown and Resume is specifically a fully-open timer action', () => {
  jest.useFakeTimers();
  const state = { on: true, level: 100, settings: { autoCloseEnabled: true, autoCloseDelaySec: 30, gatePhase: 'countdown', gateCountdownSec: 12 } };
  const { screen, props, client } = setup(state);
  expect(screen.getByText('Auto-close in 12s · Simulation')).toBeTruthy();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Auto-close in 12s · Simulation')).toBeTruthy();
  screen.rerender(<GateController {...props} state={{ ...state, settings: { ...state.settings, gateCountdownSec: 7 } }} />);
  expect(screen.getByText('Auto-close in 7s · Simulation')).toBeTruthy();
  screen.rerender(<GateController {...props} state={{ ...state, settings: { ...state.settings, gatePhase: 'paused', gateCountdownSec: 0 } }} />);
  fireEvent.press(screen.getByLabelText('Resume gate auto-close'));
  expect(client.runAction).toHaveBeenCalledWith('entry-gate', 'gate-resume');
  screen.rerender(<GateController {...props} state={{ ...state, level: 50, settings: { ...state.settings, gatePhase: 'paused', gateCountdownSec: 0 } }} />);
  expect(screen.queryByLabelText('Resume gate auto-close')).toBeNull();
  expect(screen.getByLabelText('Close gate').props.accessibilityState.disabled).toBe(false);
});

test('unknown samples do not fabricate a panel pose, clearance, or an enabled movement command', () => {
  const { screen } = setup({ on: true, level: Number.NaN, settings: { gateBeamBlocked: 'bad' } });
  expect(screen.getByLabelText('Gate position unavailable')).toBeTruthy();
  expect(screen.getByText('Gate simulation state unavailable')).toBeTruthy();
  expect(screen.queryByTestId('gate-preview-panel', { includeHiddenElements: true })).toBeNull();
  expect(screen.getByLabelText('Safety beam: Unknown · simulated input')).toBeTruthy();
  expect(screen.getByLabelText('Open gate fully').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText('Close gate').props.accessibilityState.disabled).toBe(true);
});

test('revoked controls disable every gate action while preserving More', () => {
  const { screen, props, client } = setup({ on: true, level: 100, settings: { gatePhase: 'paused', autoCloseEnabled: true } });
  screen.rerender(<GateController {...props} disabled />);
  for (const control of screen.getAllByRole('button')) {
    if (control.props.accessibilityLabel === 'More gate controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More gate controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('a deferred Close callback rechecks membership through the guarded client', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'grounds-room', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [{ id: 'saved-gate', modelDeviceId: 'entry-gate', name: 'Gate', roomId: 'grounds-room', kind: 'gate', isOn: true }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<GateController device={getDevice('entry-gate')!} state={{ on: true, level: 50 }} client={guardModelDeviceControls(client)}
    disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Close gate'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = forwardedProp(screen, 'Close gate', 'onPress') as () => void;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More retains safety settings and device changes reset navigation without changing existing controllers', () => {
  const { screen, props } = renderInspector();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More gate controls'));
  expect(screen.getByLabelText('Open')).toBeTruthy();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Modes'));
  expect(screen.getByText('Preview auto-close')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to gate controller'));
  expect(screen.getByTestId('gate-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More gate controls'));
  for (const [id, more, back, marker] of [
    ['utility-battery', 'More energy controls', 'Back to energy controller', 'energy-tactile-controller'],
    ['living-light', 'More lighting controls', 'Back to lighting controller', 'lighting-tactile-controller'],
    ['family-tv', 'More TV controls', 'Back to TV remote', 'tv-tactile-remote'],
    ['master-ac', 'More climate controls', 'Back to climate controller', 'climate-tactile-controller'],
    ['master-blinds', 'More blinds controls', 'Back to blinds controller', 'blinds-tactile-controller'],
    ['entry-gate', 'More gate controls', 'Back to gate controller', 'gate-tactile-controller'],
  ]) {
    screen.rerender(<DeviceControlsSheet {...props} deviceId={id} />);
    expect(screen.getByTestId(marker)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(more));
    fireEvent.press(screen.getByLabelText(back));
    expect(screen.getByTestId(marker)).toBeTruthy();
  }
});

test('unread state and revoked view/control grants do not expose writable default gates', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('gate-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Close gate'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={['entry-gate']}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('gate-tactile-controller')).toBeNull();
  expect(screen.queryByText('Entry gate')).toBeNull();
});
