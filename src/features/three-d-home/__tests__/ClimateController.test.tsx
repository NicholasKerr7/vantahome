import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DEVICES, getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { CLIMATE_MODE_OPTIONS, CLIMATE_PRESET_OPTIONS, CLIMATE_SWING_OPTIONS } from '../../../../packages/home-scene/src/climateController';
import { useHomeStore } from '../../../store/useHomeStore';
import { ClimateController } from '../ClimateController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
const mockOpenRoutines = jest.fn();
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => mockOpenRoutines }));

const originalProfile = useHomeStore.getState().profile;
beforeEach(() => {
  useHomeStore.setState({ profile: { ...originalProfile, tempUnit: 'C' } });
  mockOpenRoutines.mockClear();
});
afterEach(() => { useHomeStore.setState({ profile: originalProfile }); jest.restoreAllMocks(); });

/** Render real native controls with observable writes and intentionally remembered off-state settings. */
function setup(compact = false, fontScale = 1) {
  const device = getDevice('master-ac')!;
  const state = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false,
    settings: { tempC: 22, mode: 'cold', acFanSpeed: 60, acSwingMode: 'both', acEcoMode: false, acQuietMode: false, acTurboMode: false } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, fontScale, disabled: false, onMore: jest.fn() };
  return { screen: render(<ClimateController {...props} />), props, client };
}

/** Use a complete saved simulation snapshot so the inspector owns lifecycle and read-only behavior. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'master-ac', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test.each([[false, 1], [true, 1], [true, 1.8]] as const)('keeps all primary controls together with full touch targets at compact=%s and fontScale=%s', (compact, fontScale) => {
  const { screen } = setup(compact, fontScale);
  const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')];
  expect(controls).toHaveLength(14);
  for (const control of controls) {
    const style = StyleSheet.flatten(control.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  }
  expect(screen.getByLabelText('Target temperature 22 degrees Celsius')).toBeTruthy();
  expect(screen.getByLabelText('Fan speed 60 percent')).toBeTruthy();
  expect(screen.getByText('TARGET °C')).toBeTruthy();
  expect(screen.queryByLabelText('Next controls page')).toBeNull();
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
});

test('dispatches power and repeated relative temperature/fan actions without reusing a stale displayed value', () => {
  const { screen, client } = setup();
  for (const [label, action] of [
    ['Raise target temperature', 'ac-temperature-up'], ['Lower target temperature', 'ac-temperature-down'],
    ['Raise fan speed', 'ac-fan-up'], ['Lower fan speed', 'ac-fan-down'],
  ]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['master-ac', action], ['master-ac', action]]);
  }
  fireEvent.press(screen.getByLabelText('Turn climate on'));
  expect(client.toggle).toHaveBeenCalledWith('master-ac');
  expect(client.setSetting).not.toHaveBeenCalled();
});

test('mode and exclusive preset choices use the shared setting and atomic Normal commands', () => {
  const { screen, client } = setup();
  for (const option of CLIMATE_MODE_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `${option.label} mode` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('master-ac', 'mode', option.value);
  }
  for (const option of CLIMATE_PRESET_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `${option.label} airflow preset` }));
    if (option.value === 'normal') expect(client.runAction).toHaveBeenLastCalledWith('master-ac', 'ac-preset-normal');
    else expect(client.setSetting).toHaveBeenLastCalledWith('master-ac', `ac${option.label}Mode`, true);
  }
  expect(screen.getByRole('radio', { name: 'Cold mode' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('radio', { name: 'Normal airflow preset' }).props.accessibilityState.checked).toBe(true);
  expect(client.toggle).not.toHaveBeenCalled();
});

test('swing picker retains all catalog choices and returns without a power command', () => {
  const { screen, client } = setup();
  for (const option of CLIMATE_SWING_OPTIONS) {
    fireEvent.press(screen.getByLabelText('Swing: Both. Choose airflow swing'));
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Swing Both' }).props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: `Swing ${option.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('master-ac', 'acSwingMode', option.value);
    expect(screen.queryByTestId('climate-swing-picker')).toBeNull();
    expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
  }
  expect(client.toggle).not.toHaveBeenCalled();
});

test('saved state drives off, mode, preset and airflow feedback without claiming a current room temperature', () => {
  const { screen, props } = setup();
  expect(screen.getByText('OFF')).toBeTruthy();
  expect(screen.getByText('Off · Your settings are remembered')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Turn climate on'));
  expect(screen.getByText('OFF')).toBeTruthy();
  screen.rerender(<ClimateController {...props} state={{ ...props.state, on: true, settings: { ...props.state.settings, mode: 'dry', acQuietMode: true } }} />);
  expect(screen.getByLabelText('Turn climate off')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Dry mode' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('radio', { name: 'Quiet airflow preset' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Fan speed 60 percent')).toBeTruthy();
  expect(screen.getByText('Airflow preview · 30%')).toBeTruthy();
  expect(screen.queryByText(/room temperature/i)).toBeNull();
});

test('temperature preference updates only the presentation and accurately describes the canonical step', () => {
  const { screen, client } = setup();
  act(() => { useHomeStore.setState({ profile: { ...originalProfile, tempUnit: 'F' } }); });
  expect(screen.getByLabelText('Target temperature 72 degrees Fahrenheit')).toBeTruthy();
  expect(screen.getByText('TARGET °F')).toBeTruthy();
  expect(screen.getByLabelText('Raise target temperature').props.accessibilityHint).toBe('Adjusts by 1.8°F');
  fireEvent.press(screen.getByLabelText('Raise target temperature'));
  expect(client.runAction).toHaveBeenCalledWith('master-ac', 'ac-temperature-up');
  expect(client.setSetting).not.toHaveBeenCalled();
});

test.each([{ tempC: 15, fan: 0, direction: 'Lower' }, { tempC: 28, fan: 100, direction: 'Raise' }])('disables relative keys at temperature $tempC and fan $fan boundaries', ({ tempC, fan, direction }) => {
  const { screen, props, client } = setup();
  screen.rerender(<ClimateController {...props} state={{ ...props.state, settings: { ...props.state.settings, tempC, acFanSpeed: fan } }} />);
  for (const label of [`${direction} target temperature`, `${direction} fan speed`]) {
    const button = screen.getByLabelText(label);
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
  }
  expect(client.runAction).not.toHaveBeenCalled();
});

test('revoked access blocks every write even with the swing picker already open, while More remains reachable', () => {
  const { screen, props, client } = setup(true);
  fireEvent.press(screen.getByLabelText('Swing: Both. Choose airflow swing'));
  screen.rerender(<ClimateController {...props} disabled />);
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(radio);
  }
  fireEvent.press(screen.getByLabelText('Back to climate controller'));
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More climate controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More climate controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('native More retains settings, routines and status, and switching devices resets local controller navigation', () => {
  const { screen, props } = renderInspector();
  expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More climate controls'));
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Routines'));
  fireEvent.press(screen.getByLabelText('View device routines'));
  expect(mockOpenRoutines).toHaveBeenCalledWith('master-ac');
  fireEvent.press(screen.getByLabelText('Back to climate controller'));
  fireEvent.press(screen.getByLabelText(/Choose airflow swing/));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="family-tv" />);
  expect(screen.queryByTestId('climate-swing-picker')).toBeNull();
  expect(screen.getByTestId('tv-tactile-remote')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More TV controls'));
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
  expect(screen.queryByLabelText('Back to climate controller')).toBeNull();
});

test('switching between climate devices resets a picker and advanced pages to the new device primary panel', () => {
  const { screen, props, client } = renderInspector();
  const otherClimate = DEVICES.find((device) => device.kind === 'ac' && device.id !== props.deviceId)!;
  expect(otherClimate).toBeDefined();
  fireEvent.press(screen.getByLabelText(/Choose airflow swing/));
  screen.rerender(<DeviceControlsSheet {...props} deviceId={otherClimate.id} />);
  expect(screen.queryByTestId('climate-swing-picker')).toBeNull();
  expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Raise target temperature'));
  expect(client.runAction).toHaveBeenLastCalledWith(otherClimate.id, 'ac-temperature-up');
  fireEvent.press(screen.getByLabelText('More climate controls'));
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('climate-tactile-controller')).toBeTruthy();
});

test.each([320, 360, 375])('a narrow %spt tall phone uses the compact panel before native layout', (width) => {
  jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height: 844, fontScale: 1, scale: 1 });
  const { screen } = renderInspector();
  expect(screen.UNSAFE_getByType(ClimateController).props.compact).toBe(true);
});

test('native hydration and view-only access never present writable default climate controls', () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('climate-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Raise fan speed'));
  expect(client.runAction).not.toHaveBeenCalled();
});
