import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { BLINDS_POSITION_PRESETS } from '../../../../packages/home-scene/src/blindsController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { BlindsController } from '../BlindsController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
const mockOpenRoutines = jest.fn();
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => mockOpenRoutines }));

beforeEach(() => { mockOpenRoutines.mockClear(); });
afterEach(() => jest.restoreAllMocks());

/** Render the real native panel while keeping every command observable and independent from optimistic UI. */
function setup(compact = false, fontScale = 1) {
  const device = getDevice('master-blinds')!;
  const state = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: true, level: 50 };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, fontScale, disabled: false, onMore: jest.fn() };
  return { screen: render(<BlindsController {...props} />), props, client };
}

/** Exercise the actual keyed inspector and its existing saved-state and access gates. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  snapshot.state.deviceStates['master-blinds'] = { on: true, level: 50 };
  const props = { deviceId: 'master-blinds', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

/** Inspect the cross-platform input before native Pressable folds aria-checked into accessibilityState. */
function forwardedChecked(screen: ReturnType<typeof render>, label: string): unknown {
  const key = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === label
    && Object.hasOwn(node.props, 'aria-checked'))[0];
  if (!key) throw new Error(`Missing native control: ${label}`);
  return key.props['aria-checked'];
}

test.each([[false, 1], [true, 1], [true, 1.8]] as const)('all eight controls retain full touch targets at compact=%s and fontScale=%s', (compact, fontScale) => {
  const { screen } = setup(compact, fontScale);
  const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')];
  expect(controls).toHaveLength(8);
  for (const control of controls) {
    const style = StyleSheet.flatten(control.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  }
  expect(screen.getByLabelText('Blinds 50 percent open')).toBeTruthy();
  expect(screen.getByText('Local position preview · Simulation')).toBeTruthy();
  expect(screen.queryByLabelText('Next controls page')).toBeNull();
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
});

test('repeated relative presses and Open/Close dispatch the shared actions without stale absolute writes', () => {
  const { screen, client } = setup();
  for (const [label, action] of [
    ['Raise blinds by 5 percent', 'blinds-position-up'], ['Lower blinds by 5 percent', 'blinds-position-down'],
    ['Open blinds fully', 'blinds-command-open'], ['Close blinds fully', 'blinds-command-close'],
  ]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['master-blinds', action], ['master-blinds', action]]);
  }
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Blinds 50 percent open')).toBeTruthy();
});

test('position presets reuse openPercent and select only the confirmed external percentage', () => {
  const { screen, client, props } = setup();
  for (const preset of BLINDS_POSITION_PRESETS) {
    fireEvent.press(screen.getByRole('radio', { name: `${preset.label}: ${preset.value} percent open` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('master-blinds', 'openPercent', preset.value);
  }
  expect(screen.getByRole('radio', { name: 'Half: 50 percent open' }).props.accessibilityState.checked).toBe(true);
  expect(forwardedChecked(screen, 'Half: 50 percent open')).toBe(true);
  expect(forwardedChecked(screen, 'Daylight: 75 percent open')).toBe(false);
  screen.rerender(<BlindsController {...props} state={{ ...props.state, level: 75 }} />);
  expect(screen.getByLabelText('Blinds 75 percent open')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Daylight: 75 percent open' }).props.accessibilityState.checked).toBe(true);
  expect(forwardedChecked(screen, 'Daylight: 75 percent open')).toBe(true);
  screen.rerender(<BlindsController {...props} state={{ ...props.state, level: 37 }} />);
  expect(screen.getByLabelText('Blinds 37 percent open')).toBeTruthy();
  for (const preset of screen.getAllByRole('radio')) {
    expect(preset.props.accessibilityState.checked).toBe(false);
    expect(forwardedChecked(screen, preset.props.accessibilityLabel)).toBe(false);
  }
  expect(forwardedChecked(screen, 'More blinds controls')).toBeUndefined();
  expect(client.runAction).not.toHaveBeenCalled();
});

test('window slats follow saved position changes with no fictitious motor, Stop, or tilt control', () => {
  const { screen, props, client } = setup();
  screen.rerender(<BlindsController {...props} state={{ ...props.state, on: false, level: 0 }} />);
  const closedSlat = screen.getByTestId('blinds-preview-slat-9', { includeHiddenElements: true }).props;
  expect(screen.getByText('Closed')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Open blinds fully'));
  expect(screen.getByTestId('blinds-preview-slat-9', { includeHiddenElements: true }).props.y).toBe(closedSlat.y);
  expect(screen.getByText('Closed')).toBeTruthy();
  screen.rerender(<BlindsController {...props} state={{ ...props.state, level: 100 }} />);
  const openSlat = screen.getByTestId('blinds-preview-slat-9', { includeHiddenElements: true }).props;
  expect(Number(openSlat.y)).toBeLessThan(Number(closedSlat.y));
  expect(Number(openSlat.height)).toBeLessThan(Number(closedSlat.height));
  expect(screen.getByText('Fully open')).toBeTruthy();
  expect(screen.queryByLabelText(/stop|tilt|moving/i)).toBeNull();
  expect(client.runAction).toHaveBeenCalledTimes(1);
});

test.each([{ level: 0, labels: ['Lower blinds by 5 percent', 'Close blinds fully'] }, { level: 100, labels: ['Raise blinds by 5 percent', 'Open blinds fully'] }])('position $level disables only commands beyond that endpoint', ({ level, labels }) => {
  const { screen, props, client } = setup();
  screen.rerender(<BlindsController {...props} state={{ ...props.state, on: level > 0, level }} />);
  for (const label of labels) {
    const control = screen.getByLabelText(label);
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: 'Half: 50 percent open' }).props.accessibilityState.disabled).toBe(false);
});

test('revoked access disables every command and preset while More remains available', () => {
  const { screen, props, client } = setup(true);
  screen.rerender(<BlindsController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More blinds controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More blinds controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('the guarded client rejects a deferred native button after room control permission is revoked', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'primary-room', name: 'Primary suite', modelRoomId: 'master' }],
    devices: [{ id: 'saved-blinds', modelDeviceId: 'master-blinds', name: 'Primary blinds', roomId: 'primary-room', kind: 'blinds', isOn: true }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const device = getDevice('master-blinds')!;
  const screen = render(<BlindsController device={device} state={{ on: true, level: 50 }} client={guardModelDeviceControls(client)}
    disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Raise blinds by 5 percent'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Raise blinds by 5 percent'
      && typeof node.props.onPress === 'function')[0].props.onPress as () => void;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally {
    screen.unmount();
    useHomeStore.setState(original, true);
  }
});

test('More keeps the precision slider, routines and status reachable and returns to the main panel', () => {
  const { screen } = renderInspector();
  expect(screen.getByTestId('blinds-tactile-controller')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More blinds controls'));
  expect(screen.queryByTestId('blinds-tactile-controller')).toBeNull();
  for (const tab of ['Controls', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  expect(screen.getByLabelText('Open position')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Routines'));
  fireEvent.press(screen.getByLabelText('View device routines'));
  expect(mockOpenRoutines).toHaveBeenCalledWith('master-blinds');
  fireEvent.press(screen.getByLabelText('Back to blinds controller'));
  expect(screen.getByTestId('blinds-tactile-controller')).toBeTruthy();
  expect(screen.getByLabelText('Blinds 50 percent open')).toBeTruthy();
});

test('device changes reset advanced navigation and preserve TV and climate primary controllers', () => {
  const { screen, props, client } = renderInspector();
  fireEvent.press(screen.getByLabelText('More blinds controls'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="family-tv" />);
  expect(screen.getByTestId('tv-tactile-remote')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More TV controls'));
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('blinds-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: 'Half: 50 percent open' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('master-blinds', 'openPercent', 50);
  screen.rerender(<DeviceControlsSheet {...props} deviceId="family-tv" />);
  expect(screen.getByTestId('tv-tactile-remote')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More TV controls'));
  fireEvent.press(screen.getByLabelText('Back to TV remote'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="master-ac" />);
  expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More climate controls'));
  fireEvent.press(screen.getByLabelText('Back to climate controller'));
  expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
});

test('unread saved state and view-only access never expose writable defaults', () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('blinds-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Raise blinds by 5 percent'));
  expect(client.runAction).not.toHaveBeenCalled();
});

test.each([320, 360, 375])('a narrow %spt tall phone retains the compact panel', (width) => {
  jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height: 844, fontScale: 1, scale: 1 });
  const { screen } = renderInspector();
  expect(screen.UNSAFE_getByType(BlindsController).props.compact).toBe(true);
});
