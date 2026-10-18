import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DEVICES, getDevice } from '../../../../packages/home-scene/src/data';
import { LIGHT_COLOR_PRESETS, LIGHT_WHITE_PRESETS } from '../../../../packages/home-scene/src/lightingController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { LightingController } from '../LightingController';
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

/** Render the real controller with remembered off-state settings and observable guarded-client commands. */
function setup(compact = false, fontScale = 1, colorMode: 'temperature' | 'color' = 'temperature') {
  const device = getDevice('living-light')!;
  const state = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, level: 50,
    settings: { lightColorMode: colorMode, color: '#B69CFF', colorTempK: 3000, lightEffect: 'none' } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, fontScale, disabled: false, onMore: jest.fn() };
  return { screen: render(<LightingController {...props} />), props, client };
}

/** Read a cross-platform prop before native Pressable or SVG folds it into platform-specific props. */
function forwardedProp(screen: ReturnType<typeof render>, selector: string, prop: string): unknown {
  const control = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) =>
    (node.props.accessibilityLabel === selector || node.props.testID === selector) && Object.hasOwn(node.props, prop))[0];
  if (!control) throw new Error(`Missing controller prop: ${selector} / ${prop}`);
  return control.props[prop];
}

/** Exercise hydration, keyed navigation, and the existing shared inspector rather than a stub integration. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'living-light', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test.each([
  [false, 1, 'temperature', 10], [true, 1, 'temperature', 10], [true, 1.8, 'temperature', 10],
  [false, 1, 'color', 12], [true, 1, 'color', 12], [true, 1.8, 'color', 12],
] as const)('keeps all controls with 44pt targets at compact=%s, font=%s, mode=%s', (compact, fontScale, mode, count) => {
  const { screen } = setup(compact, fontScale, mode);
  const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')];
  expect(controls).toHaveLength(count);
  for (const control of controls) {
    const style = StyleSheet.flatten(control.props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  }
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  expect(screen.queryByLabelText('Next controls page')).toBeNull();
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
});

test('relative brightness and mode actions preserve power and never write a stale displayed level', () => {
  const { screen, client } = setup();
  for (const [label, action] of [
    ['Dim light by 5 percent', 'light-brightness-down'], ['Brighten light by 5 percent', 'light-brightness-up'],
    ['White light mode', 'light-mode-white'], ['Color light mode', 'light-mode-color'],
  ]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['living-light', action], ['living-light', action]]);
  }
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Brightness 50 percent. Light off')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Turn light on'));
  expect(client.toggle).toHaveBeenCalledWith('living-light');
});

test('every white and color preset uses the power-preserving setting path', () => {
  const { screen, props, client } = setup();
  for (const preset of LIGHT_WHITE_PRESETS) {
    fireEvent.press(screen.getByRole('radio', { name: `${preset.label} white: ${preset.value} kelvin` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('living-light', 'colorTempK', preset.value);
  }
  expect(forwardedProp(screen, 'Soft white: 3000 kelvin', 'aria-checked')).toBe(true);
  expect(forwardedProp(screen, 'Warm white: 2400 kelvin', 'aria-checked')).toBe(false);
  screen.rerender(<LightingController {...props} state={{ ...props.state, settings: { ...props.state.settings, lightColorMode: 'color' } }} />);
  for (const preset of LIGHT_COLOR_PRESETS) {
    fireEvent.press(screen.getByRole('radio', { name: `${preset.label} light color` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('living-light', 'color', preset.value);
  }
  expect(forwardedProp(screen, 'Lavender light color', 'aria-checked')).toBe(true);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
});

test('confirmed off and on-at-zero states remain dark while retaining their independent power and brightness', () => {
  const { screen, props } = setup();
  expect(forwardedProp(screen, 'lighting-preview-emission', 'opacity')).toBe(0);
  expect(forwardedProp(screen, 'lighting-preview-glow', 'opacity')).toBe(0);
  fireEvent.press(screen.getByLabelText('Turn light on'));
  expect(forwardedProp(screen, 'lighting-preview-emission', 'opacity')).toBe(0);
  screen.rerender(<LightingController {...props} state={{ ...props.state, on: true, level: 0 }} />);
  expect(screen.getByText('On · Brightness 0%')).toBeTruthy();
  expect(screen.getByLabelText('Turn light off')).toBeTruthy();
  expect(forwardedProp(screen, 'lighting-preview-emission', 'opacity')).toBe(0);
  screen.rerender(<LightingController {...props} state={{ ...props.state, on: true }} />);
  expect(forwardedProp(screen, 'lighting-preview-emission', 'opacity')).toBe(0.5);
});

test('active effects show effective output without claiming a manual mode or preset is selected', () => {
  const { screen, props } = setup();
  const effectState = { ...props.state, on: true, settings: { ...props.state.settings, lightEffect: 'party' } };
  screen.rerender(<LightingController {...props} state={effectState} />);
  expect(screen.getByLabelText('Brightness 50 percent. Light on')).toBeTruthy();
  expect(screen.getByText('Party effect · Preview 40%')).toBeTruthy();
  expect(forwardedProp(screen, 'lighting-preview-emission', 'opacity')).toBe(0.4);
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.props.accessibilityState.checked).toBe(false);
    expect(forwardedProp(screen, radio.props.accessibilityLabel, 'aria-checked')).toBe(false);
  }
  screen.rerender(<LightingController {...props} state={{ ...effectState, on: false }} />);
  expect(screen.getByText('Party effect remembered · Light off')).toBeTruthy();
  expect(forwardedProp(screen, 'lighting-preview-emission', 'opacity')).toBe(0);
});

test('external arbitrary settings clear preset highlighting without replacing the confirmed mode or brightness', () => {
  const { screen, props } = setup();
  screen.rerender(<LightingController {...props} state={{ ...props.state, level: 37, settings: { ...props.state.settings, colorTempK: 3760 } }} />);
  expect(screen.getByLabelText('Brightness 37 percent. Light off')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'White light mode' }).props.accessibilityState.checked).toBe(true);
  for (const preset of LIGHT_WHITE_PRESETS) expect(screen.getByRole('radio', { name: `${preset.label} white: ${preset.value} kelvin` }).props.accessibilityState.checked).toBe(false);
  screen.rerender(<LightingController {...props} state={{ ...props.state, settings: { ...props.state.settings, lightColorMode: 'color', color: '#fF1234' } }} />);
  for (const preset of LIGHT_COLOR_PRESETS) expect(screen.getByRole('radio', { name: `${preset.label} light color` }).props.accessibilityState.checked).toBe(false);
});

test.each([{ level: 0, label: 'Dim light by 5 percent' }, { level: 100, label: 'Brighten light by 5 percent' }])('brightness $level disables only its bounded direction', ({ level, label }) => {
  const { screen, props, client } = setup();
  screen.rerender(<LightingController {...props} state={{ ...props.state, level }} />);
  expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText(label));
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Turn light on').props.accessibilityState.disabled).toBe(false);
});

test.each(['temperature', 'color'] as const)('revoked access disables power, modes, steps and %s presets while More stays available', (mode) => {
  const { screen, props, client } = setup(true, 1, mode);
  screen.rerender(<LightingController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More lighting controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More lighting controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('the guarded client rejects a deferred lighting press after membership access changes', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'living-room', name: 'Living room', modelRoomId: 'living' }],
    devices: [{ id: 'saved-light', modelDeviceId: 'living-light', name: 'Living light', roomId: 'living-room', kind: 'light', isOn: true }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<LightingController device={getDevice('living-light')!} state={{ on: true, level: 50 }} client={guardModelDeviceControls(client)}
    disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Brighten light by 5 percent'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Brighten light by 5 percent'
      && typeof node.props.onPress === 'function')[0].props.onPress as () => void;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More retains exact brightness, advanced effects, routines and status without changing existing controllers', () => {
  const { screen, props } = renderInspector();
  expect(screen.getByTestId('lighting-tactile-controller')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More lighting controls'));
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  expect(screen.getByLabelText('Brightness')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Routines'));
  fireEvent.press(screen.getByLabelText('View device routines'));
  expect(mockOpenRoutines).toHaveBeenCalledWith('living-light');
  fireEvent.press(screen.getByLabelText('Back to lighting controller'));
  expect(screen.getByTestId('lighting-tactile-controller')).toBeTruthy();
  for (const [id, more, back, marker] of [
    ['family-tv', 'More TV controls', 'Back to TV remote', 'tv-tactile-remote'],
    ['master-ac', 'More climate controls', 'Back to climate controller', 'climate-tactile-controller'],
    ['master-blinds', 'More blinds controls', 'Back to blinds controller', 'blinds-tactile-controller'],
  ]) {
    screen.rerender(<DeviceControlsSheet {...props} deviceId={id} />);
    expect(screen.getByTestId(marker)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(more));
    fireEvent.press(screen.getByLabelText(back));
    expect(screen.getByTestId(marker)).toBeTruthy();
  }
});

test('switching between light identities resets advanced navigation and targets the newly selected light', () => {
  const { screen, props, client } = renderInspector();
  const otherLight = DEVICES.find((device) => device.kind === 'light' && device.id !== props.deviceId)!;
  fireEvent.press(screen.getByLabelText('More lighting controls'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId={otherLight.id} />);
  expect(screen.getByTestId('lighting-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Dim light by 5 percent'));
  expect(client.runAction).toHaveBeenLastCalledWith(otherLight.id, 'light-brightness-down');
});

test('unread saved state and read-only access never expose writable default lights', () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('lighting-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Brighten light by 5 percent'));
  expect(client.runAction).not.toHaveBeenCalled();
});
