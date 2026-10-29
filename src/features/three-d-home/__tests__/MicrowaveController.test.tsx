import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { MicrowaveController } from '../MicrowaveController';
import { MicrowaveControllerArtwork } from '../MicrowaveControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'kitchen-microwave';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: false, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, onMore: jest.fn() };
  return { screen: render(<MicrowaveController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('modes and power are preferences; preview starts/adds/stops remain separate actions', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Microwave mode: Defrost')); fireEvent.press(screen.getByLabelText('Increase microwave power'));
  expect(client.setSetting.mock.calls).toEqual([[id,'microwaveMode','Defrost']]); expect(client.runAction.mock.calls).toEqual([[id,'microwave-power-up']]);
  expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Start 1 minute microwave preview')); expect(client.runAction).toHaveBeenLastCalledWith(id,'microwave-start');
  screen.rerender(<MicrowaveController {...props} state={{ on: true, level: 0, settings: { timeRemainingSec: 60 } }} />);
  expect(screen.getByLabelText('Saved microwave duration: 60 seconds')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Add 30 seconds and start microwave preview')); expect(client.runAction).toHaveBeenLastCalledWith(id,'microwave-add-30');
  fireEvent.press(screen.getByLabelText('Stop and clear microwave preview')); expect(client.runAction).toHaveBeenLastCalledWith(id,'microwave-stop');
});
test('invalid values disable relative keys, and accepted state alone changes activity artwork', () => {
  const { screen, props, client } = setup();
  screen.rerender(<MicrowaveController {...props} state={{ on: false, level: 0, settings: { microwavePower: '7', timeRemainingSec: '60', microwaveMode: 'Defrost' } }} />);
  expect(screen.getByLabelText('Microwave duration unavailable')).toBeTruthy(); expect(screen.getByLabelText('Microwave power unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Increase microwave power')); fireEvent.press(screen.getByLabelText('Add 30 seconds and start microwave preview')); expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Microwave mode: Defrost').props.accessibilityState.checked).toBe(true);
  expect(screen.UNSAFE_getByType(MicrowaveControllerArtwork).props.on).toBe(false);
});
test('regular, compact and large text keep touch targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false,1],[true,1],[true,1.8]] as const) {
    screen.rerender(<MicrowaveController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sizes artwork from available height and exposes More while controls are read-only', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('microwave-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(MicrowaveControllerArtwork).props.compact).toBe(true);
  screen.rerender(<MicrowaveController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More microwave controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled(); expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More microwave controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More/Back retains original controls and actual inspector fails closed before hydration or after revocation', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More microwave controls')); expect(screen.getByLabelText('Back to microwave controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to microwave controller')); expect(screen.getByTestId('microwave-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />); expect(screen.queryByTestId('microwave-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Increase microwave power')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />)); expect(screen.queryByTestId('microwave-tactile-controller')).toBeNull();
});
