import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { AIR_AQI_PRESETS } from '../../../../packages/home-scene/src/airQualityController';
import { AirQualityController } from '../AirQualityController';
import { AirQualityControllerArtwork } from '../AirQualityControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'living-air';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: true, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<AirQualityController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('regular, compact and large text retain 44-point controls and contained scroll fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<AirQualityController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sample check emits monitor check with no power command or fabricated value change', () => {
  const { screen, client } = setup(); fireEvent.press(screen.getByLabelText('Check air quality sample'));
  expect(client.toggle).toHaveBeenCalledWith(id); expect(client.setPower).not.toHaveBeenCalled(); expect(client.setLevel).not.toHaveBeenCalled();
  expect(screen.getByLabelText('AQI sample: 32')).toBeTruthy();
  expect(screen.getByText('Check sample')).toBeTruthy();
  expect(screen.queryByRole('switch', { name: /power/i })).toBeNull();
});
test('all presets write the canonical airAlertAqi field and alerts remain independent', () => {
  const { screen, client } = setup();
  for (const preset of AIR_AQI_PRESETS) {
    fireEvent.press(screen.getByLabelText(`Save AQI alert threshold ${preset.label}`));
    expect(client.setSetting).toHaveBeenLastCalledWith(id, 'airAlertAqi', preset.value);
  }
  fireEvent.press(screen.getByLabelText('Air quality alerts preference'));
  expect(client.setSetting).toHaveBeenLastCalledWith(id, 'airAlertsEnabled', false);
  expect(client.toggle).not.toHaveBeenCalled(); expect(screen.getByLabelText('Saved AQI threshold: 100')).toBeTruthy();
});
test('accepted state updates selections and check acknowledgement without changing sample readings', () => {
  const { screen, props } = setup(); screen.rerender(<AirQualityController {...props} state={{ ...props.state, settings: { airAlertAqi: 75, airAlertsEnabled: false, sampleChecked: true } }} />);
  expect(screen.getByLabelText('Save AQI alert threshold 75').props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Air quality alerts preference').props.accessibilityState.checked).toBe(false);
  expect(screen.getByLabelText('AQI sample: 32')).toBeTruthy(); expect(screen.getByText('Sample checked · Check again')).toBeTruthy();
});
test('malformed samples stay unavailable and explicit preferences can recover independently', () => {
  const { screen, props, client } = setup(); screen.rerender(<AirQualityController {...props} state={{ ...props.state, settings: { airQualityIndex: NaN, humidity: 101, airAlertAqi: '100', airAlertsEnabled: 'bad' } }} />);
  expect(screen.getByLabelText('AQI sample unavailable')).toBeTruthy(); expect(screen.getByLabelText('Humidity sample unavailable')).toBeTruthy();
  expect(screen.getByLabelText('Saved AQI threshold unavailable')).toBeTruthy();
  for (const preset of AIR_AQI_PRESETS) expect(screen.getByLabelText(`Save AQI alert threshold ${preset.label}`).props.accessibilityState.checked).toBe(false);
  fireEvent.press(screen.getByLabelText('Save AQI alert threshold 150')); expect(client.setSetting).toHaveBeenLastCalledWith(id, 'airAlertAqi', 150);
  fireEvent.press(screen.getByLabelText('Air quality alerts preference')); expect(client.setSetting).toHaveBeenLastCalledWith(id, 'airAlertsEnabled', true);
});
test('turning alerts off does not hide an exceeded sample or pretend purifier operation', () => {
  const { screen, props } = setup(); screen.rerender(<AirQualityController {...props} state={{ ...props.state, on: false, settings: { airQualityIndex: 150, airAlertsEnabled: false, airPurifierMode: 'boost' } }} />);
  expect(screen.getByText('Saved limit exceeded')).toBeTruthy(); expect(screen.UNSAFE_getByType(AirQualityControllerArtwork).props.air.tone).toBe('exceeded');
  expect(screen.queryByText(/purifying|healthy|live monitoring/i)).toBeNull();
});
test('read-only controls cannot write and More remains available', () => {
  const { screen, props, client } = setup(); screen.rerender(<AirQualityController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More air quality controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.toggle).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More air quality controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More/Back retains advanced fields and device changes select the correct controller', () => {
  const { screen, props } = inspector(); fireEvent.press(screen.getByLabelText('More air quality controls'));
  expect(screen.UNSAFE_queryByType(AirQualityControllerArtwork)).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to air quality controller')); expect(screen.getByTestId('air-quality-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} deviceId="living-fan" />); expect(screen.queryByTestId('air-quality-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} />); expect(screen.getByTestId('air-quality-tactile-controller')).toBeTruthy();
});
test('actual inspector blocks unread storage, revoked control, and revoked visibility', async () => {
  const { screen, props, client } = inspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('air-quality-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Check air quality sample')); expect(client.toggle).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />));
  expect(screen.queryByTestId('air-quality-tactile-controller')).toBeNull();
});

test('sizes equipment from the actual available sheet height and expands again when space returns', () => {
  const { screen } = setup();
  const viewport = screen.getByTestId('air-quality-controller-scroll');
  fireEvent(viewport, 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(AirQualityControllerArtwork).props.compact).toBe(true);
  fireEvent(viewport, 'layout', { nativeEvent: { layout: { width: 344, height: 660 } } });
  expect(screen.UNSAFE_getByType(AirQualityControllerArtwork).props.compact).toBe(false);
});
