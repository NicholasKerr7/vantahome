import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { useHomeStore } from '../../../store/useHomeStore';
import { RefrigeratorController } from '../RefrigeratorController';
import { RefrigeratorControllerArtwork } from '../RefrigeratorControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'kitchen-fridge';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: true, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<RefrigeratorController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('targets use guarded atomic actions; modes and quick preferences do not toggle power', () => {
  const { screen, client } = setup();
  fireEvent.press(screen.getByLabelText('Increase fridge target temperature')); fireEvent.press(screen.getByLabelText('Decrease freezer target temperature'));
  expect(client.runAction.mock.calls).toEqual([[id, 'fridge-temperature-up'], [id, 'fridge-freezer-down']]);
  fireEvent.press(screen.getByLabelText('Refrigerator mode: Vacation')); fireEvent.press(screen.getByLabelText('Quick cool preference')); fireEvent.press(screen.getByLabelText('Quick freeze preference'));
  expect(client.setSetting.mock.calls).toEqual([[id,'fridgeMode','vacation'],[id,'fridgeQuickCool',true],[id,'fridgeQuickFreeze',true]]);
  expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Turn refrigerator off')); expect(client.toggle).toHaveBeenCalledWith(id);
});
test('accepted state controls indicators and malformed targets disable their relative keys', () => {
  const { screen, props, client } = setup();
  screen.rerender(<RefrigeratorController {...props} state={{ on: false, level: 0, settings: { tempC: 'bad', freezerTempC: -24, fridgeMode: 'eco', fridgeQuickCool: true } }} />);
  expect(screen.getByLabelText('Fridge target unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Increase fridge target temperature')); fireEvent.press(screen.getByLabelText('Decrease freezer target temperature'));
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Refrigerator mode: Eco').props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Quick cool preference').props.accessibilityState.checked).toBe(true);
  expect(screen.UNSAFE_getByType(RefrigeratorControllerArtwork).props.on).toBe(false);
});
test('Fahrenheit changes only presentation and clearly announces the Celsius control step', () => {
  const original = useHomeStore.getState().profile;
  act(() => { useHomeStore.setState({ profile: { ...original, tempUnit: 'F' } }); });
  const { screen } = setup();
  expect(screen.getByLabelText('Fridge target 39 degrees Fahrenheit')).toBeTruthy();
  expect(screen.getByLabelText('Increase fridge target temperature').props.accessibilityHint).toBe('Adjusts by 1.8°F');
  act(() => { useHomeStore.setState({ profile: original }); });
});
test('regular, compact and large text keep touch targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false,1],[true,1],[true,1.8]] as const) {
    screen.rerender(<RefrigeratorController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sizes artwork from available height and exposes More while controls are read-only', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('refrigerator-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(RefrigeratorControllerArtwork).props.compact).toBe(true);
  screen.rerender(<RefrigeratorController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More refrigerator controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled(); expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More refrigerator controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More/Back retains original controls and actual inspector fails closed before hydration or after revocation', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More refrigerator controls')); expect(screen.getByLabelText('Back to refrigerator controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to refrigerator controller')); expect(screen.getByTestId('refrigerator-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />); expect(screen.queryByTestId('refrigerator-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Increase fridge target temperature')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />)); expect(screen.queryByTestId('refrigerator-tactile-controller')).toBeNull();
});
