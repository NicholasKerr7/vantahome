import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { CoffeeController } from '../CoffeeController';
import { CoffeeControllerArtwork } from '../CoffeeControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'kitchen-coffee';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: false, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<CoffeeController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('recipe controls emit independent guarded preferences and explicit Brew/Stop commands', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Coffee strength: Strong')); fireEvent.press(screen.getByLabelText('Save cup size 12 ounces')); fireEvent.press(screen.getByLabelText('Increase coffee cups'));
  expect(client.setSetting.mock.calls).toEqual([[id,'coffeeStrength','strong'],[id,'coffeeSizeOz',12]]);
  expect(client.runAction.mock.calls).toEqual([[id,'coffee-cups-up']]); expect(client.toggle).not.toHaveBeenCalled();
  expect(screen.queryByTestId('coffee-preview-steam', { includeHiddenElements: true })).toBeNull();
  fireEvent.press(screen.getByLabelText('Brew preview')); expect(client.runAction).toHaveBeenLastCalledWith(id,'coffee-brew');
  screen.rerender(<CoffeeController {...props} state={{ on: true, level: 0 }} />);
  expect(screen.getByTestId('coffee-preview-steam', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Stop preview')); expect(client.runAction).toHaveBeenLastCalledWith(id,'coffee-stop');
});
test('accepted settings determine selections and invalid cups cannot be stepped', () => {
  const { screen, props, client } = setup();
  screen.rerender(<CoffeeController {...props} state={{ on: false, level: 0, settings: { coffeeCupCount: '2', coffeeStrength: 'strong', coffeeSizeOz: 7 } }} />);
  expect(screen.getByLabelText('Coffee cup count unavailable')).toBeTruthy(); expect(screen.getByText('7 oz')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Increase coffee cups')); fireEvent.press(screen.getByLabelText('Decrease coffee cups')); expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Coffee strength: Strong').props.accessibilityState.checked).toBe(true);
  expect(screen.UNSAFE_getByType(CoffeeControllerArtwork).props.on).toBe(false);
});
test('regular, compact and large text keep touch targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false,1],[true,1],[true,1.8]] as const) {
    screen.rerender(<CoffeeController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sizes artwork from available height and exposes More while controls are read-only', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('coffee-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(CoffeeControllerArtwork).props.compact).toBe(true);
  screen.rerender(<CoffeeController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More coffee controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled(); expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More coffee controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More/Back retains original controls and actual inspector fails closed before hydration or after revocation', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More coffee controls')); expect(screen.getByLabelText('Back to coffee controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to coffee controller')); expect(screen.getByTestId('coffee-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />); expect(screen.queryByTestId('coffee-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Increase coffee cups')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />)); expect(screen.queryByTestId('coffee-tactile-controller')).toBeNull();
});
