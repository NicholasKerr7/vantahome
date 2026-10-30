import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { GasLeakController } from '../GasLeakController';
import { GasLeakControllerArtwork } from '../GasLeakControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'kitchen-gas-leak';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: true, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, onMore: jest.fn() };
  return { screen: render(<GasLeakController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('keeps alarm actions explicit and never toggles monitor power', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Run preview self-test')); fireEvent.press(screen.getByLabelText('Simulate gas leak'));
  expect(client.runAction.mock.calls).toEqual([[id, 'gas-leak-self-test'], [id, 'gas-leak-simulate-leak']]); expect(client.toggle).not.toHaveBeenCalled();
  screen.rerender(<GasLeakController {...props} state={{ on: true, level: 0, settings: { gasLeakDetected: true, gasAlarmSilenced: true, gasTestResult: 'passed', gasTestCount: 1, gasLeakAlerts: false } }} />);
  expect(screen.getByText('Leak preview active · alarm silenced')).toBeTruthy(); expect(screen.getByText('Preview test passed')).toBeTruthy();
  client.runAction.mockClear(); fireEvent.press(screen.getByLabelText('Silence preview alarm')); expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Clear leak scenario')); expect(client.runAction).toHaveBeenLastCalledWith(id, 'gas-leak-clear-leak');
});
test('does not turn malformed samples or flags into clear readings and actionable commands', () => {
  const { screen, props, client } = setup();
  screen.rerender(<GasLeakController {...props} state={{ on: true, level: 0, settings: { gasLeakDetected: 'false', gasConcentrationPercentLel: '0', gasTestCount: '0' } }} />);
  expect(screen.getByLabelText('Sample gas concentration: unavailable percent LEL')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Simulate gas leak')); fireEvent.press(screen.getByLabelText('Run preview self-test')); expect(client.runAction).not.toHaveBeenCalled();
});
test('regular, compact and large text keep touch targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false,1],[true,1],[true,1.8]] as const) {
    screen.rerender(<GasLeakController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sizes artwork from available height and exposes More while controls are read-only', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('gas-leak-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(GasLeakControllerArtwork).props.compact).toBe(true);
  screen.rerender(<GasLeakController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More gas detector controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled(); expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More gas detector controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More/Back retains original controls and actual inspector fails closed before hydration or after revocation', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More gas detector controls')); expect(screen.getByLabelText('Back to gas detector controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to gas detector controller')); expect(screen.getByTestId('gas-leak-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />); expect(screen.queryByTestId('gas-leak-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Run preview self-test')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />)); expect(screen.queryByTestId('gas-leak-tactile-controller')).toBeNull();
});
