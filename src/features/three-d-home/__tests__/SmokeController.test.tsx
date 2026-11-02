import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { SmokeController } from '../SmokeController';
import { SmokeControllerArtwork } from '../SmokeControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'family-smoke';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: true, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, scenariosAllowed: true, onMore: jest.fn() };
  return { screen: render(<SmokeController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('separates sample checks and alarm commands, keeping a silenced source visible', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Check sample')); expect(client.toggle).toHaveBeenCalledWith(id);
  fireEvent.press(screen.getByLabelText('Simulate smoke')); fireEvent.press(screen.getByLabelText('Simulate CO'));
  expect(client.runAction.mock.calls).toEqual([[id, 'smoke-test-alarm'], [id, 'smoke-simulate-co']]);
  screen.rerender(<SmokeController {...props} state={{ on: true, level: 0, settings: { smokeDetected: true, fireIncidentActive: true, smokeSilenced: true, fireIncidentAcknowledged: true, sampleChecked: true } }} />);
  expect(screen.getByText('Smoke simulation active')).toBeTruthy();
  expect(screen.getByText('Preview silenced · Acknowledged')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Clear this sensor')); expect(client.runAction).toHaveBeenLastCalledWith(id, 'smoke-clear-alarm');
  expect(client.setPower).not.toHaveBeenCalled();
});
test('keeps malformed flags unavailable and blocks unauthorized cross-device scenarios', () => {
  const { screen, props, client } = setup();
  screen.rerender(<SmokeController {...props} scenariosAllowed={false} />);
  fireEvent.press(screen.getByLabelText('Simulate smoke')); fireEvent.press(screen.getByLabelText('Simulate CO'));
  expect(client.runAction).not.toHaveBeenCalled(); fireEvent.press(screen.getByLabelText('Check sample')); expect(client.toggle).toHaveBeenCalledWith(id);
  screen.rerender(<SmokeController {...props} state={{ on: true, level: 0, settings: { smokeDetected: 'false', coDetected: 'false' } }} />);
  expect(screen.getByLabelText('Smoke sample: Unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Simulate smoke')); fireEvent.press(screen.getByLabelText('Clear this sensor'));
  expect(client.runAction).not.toHaveBeenCalled();
});
test('regular, compact and large text preserve full targets and contained scrolling', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<SmokeController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of screen.getAllByRole('button')) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sizes artwork to the available height and keeps More accessible in view-only mode', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('smoke-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(SmokeControllerArtwork).props.size).toBe('compact');
  fireEvent(screen.getByTestId('smoke-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 390, height: 601 } } });
  expect(screen.UNSAFE_getByType(SmokeControllerArtwork).props.size).toBe('medium');
  screen.rerender(<SmokeController {...props} disabled />);
  for (const control of screen.getAllByRole('button')) {
    if (control.props.accessibilityLabel === 'More smoke detector controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled(); expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More smoke detector controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('actual inspector preserves More and fails closed for hydration, permissions and an unacknowledged incident', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More smoke detector controls')); fireEvent.press(screen.getByLabelText('Back to smoke detector controller'));
  expect(screen.getByTestId('smoke-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />); expect(screen.queryByTestId('smoke-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [id] } }} />);
  fireEvent.press(screen.getByLabelText('Simulate smoke')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />));
  expect(screen.queryByTestId('smoke-tactile-controller')).toBeNull();
  const states = { ...props.snapshot.state.deviceStates, [id]: { on: true, level: 0, settings: { smokeDetected: true, fireIncidentActive: true, fireIncidentAcknowledged: false } } };
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, deviceStates: states } }} />));
  expect(screen.queryByTestId('smoke-tactile-controller')).toBeNull(); expect(props.onClose).toHaveBeenCalled();
});
