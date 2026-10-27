import React from 'react';
import { Animated, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { IRRIGATION_DURATION_PRESETS, IRRIGATION_ZONES } from '../../../../packages/home-scene/src/irrigationController';
import { IrrigationController } from '../IrrigationController';
import { IrrigationControllerArtwork } from '../IrrigationControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { useDecorativeMotion } from '../../../components/useDecorativeMotion';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: jest.fn(() => false) }));
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
beforeEach(() => jest.mocked(useDecorativeMotion).mockReturnValue(false));
afterEach(() => jest.restoreAllMocks());
const id = 'grounds-sprinkler';

/** Preserve real projection while capturing commands sent to the shared simulation client. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: false, level: 75, settings: { durationMin: 15, zone: 'Front Yard' } },
    client, compact: false, fontScale: 1, disabled: false, motionAllowed: true, onMore: jest.fn() };
  return { screen: render(<IrrigationController {...props} />), props, client };
}
/** Exercise native hydration, scope and advanced navigation using the actual inspector. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('regular, compact and large text retain 44-point controls and restrained scroll fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<IrrigationController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('commands are guarded intents with no eager state or spray changes', () => {
  const { screen, client } = setup();
  fireEvent.press(screen.getByLabelText('Start irrigation simulation'));
  expect(client.toggle).toHaveBeenCalledWith(id); expect(screen.queryByTestId('irrigation-preview-spray', { includeHiddenElements: true })).toBeNull();
  for (const [label, action] of [['Increase', 'up'], ['Decrease', 'down']]) {
    fireEvent.press(screen.getByLabelText(`${label} irrigation duration`)); fireEvent.press(screen.getByLabelText(`${label} irrigation duration`));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([[id, `sprinkler-duration-${action}`], [id, `sprinkler-duration-${action}`]]);
  }
  expect(screen.getByLabelText('Saved irrigation duration: 15 minutes')).toBeTruthy();
  expect(client.setPower).not.toHaveBeenCalled(); expect(client.setLevel).not.toHaveBeenCalled();
});
test('all zone and duration choices write only their own preference while off', () => {
  const { screen, client } = setup();
  for (const zone of IRRIGATION_ZONES) {
    fireEvent.press(screen.getByRole('radio', { name: `Zone preference: ${zone.label}` })); expect(client.setSetting).toHaveBeenLastCalledWith(id, 'zone', zone.value);
  }
  for (const preset of IRRIGATION_DURATION_PRESETS) {
    fireEvent.press(screen.getByRole('radio', { name: `Save irrigation duration ${preset.label}` })); expect(client.setSetting).toHaveBeenLastCalledWith(id, 'durationMin', preset.value);
  }
  expect(client.toggle).not.toHaveBeenCalled(); expect(client.runAction).not.toHaveBeenCalled();
});
test.each([[0, 'Decrease'], [60, 'Increase']] as const)('duration %s disables its exhausted step', (durationMin, direction) => {
  const { screen, props, client } = setup();
  screen.rerender(<IrrigationController {...props} state={{ ...props.state, settings: { ...props.state.settings, durationMin } }} />);
  const button = screen.getByLabelText(`${direction} irrigation duration`); expect(button.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(button); expect(client.runAction).not.toHaveBeenCalled();
});
test('unknown duration disables relative actions but presets recover without starting water', () => {
  const { screen, props, client } = setup();
  screen.rerender(<IrrigationController {...props} state={{ ...props.state, settings: { durationMin: NaN, zone: 'invalid' } }} />);
  expect(screen.getByLabelText('Saved irrigation duration unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Increase irrigation duration')); expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Save irrigation duration 5 min')); expect(client.setSetting).toHaveBeenCalledWith(id, 'durationMin', 5);
  expect(client.toggle).not.toHaveBeenCalled();
});
test('accepted power alone controls the visible spray and zero saved minutes does not stop it', () => {
  const { screen, props } = setup();
  screen.rerender(<IrrigationController {...props} state={{ ...props.state, on: true, settings: { ...props.state.settings, durationMin: 0 } }} />);
  expect(screen.getByTestId('irrigation-preview-spray', { includeHiddenElements: true })).toBeTruthy(); expect(screen.getByLabelText('Stop irrigation simulation')).toBeTruthy();
  screen.rerender(<IrrigationController {...props} />); expect(screen.queryByTestId('irrigation-preview-spray', { includeHiddenElements: true })).toBeNull();
});
test('read-only controls cannot write and More remains available', () => {
  const { screen, props, client } = setup(); screen.rerender(<IrrigationController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More irrigation controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.toggle).not.toHaveBeenCalled(); expect(client.runAction).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More irrigation controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More unmounts artwork; Back and device changes restore the right controller', () => {
  const { screen, props } = inspector(); fireEvent.press(screen.getByLabelText('More irrigation controls'));
  expect(screen.UNSAFE_queryByType(IrrigationControllerArtwork)).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to irrigation controller')); expect(screen.getByTestId('irrigation-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} deviceId="living-fan" />); expect(screen.queryByTestId('irrigation-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} />); expect(screen.getByTestId('irrigation-tactile-controller')).toBeTruthy();
});
test('motion policy and unread/revoked state reach the real inspector', async () => {
  const { screen, props, client } = inspector();
  screen.rerender(<DeviceControlsSheet {...props} motionAllowed snapshot={{ ...props.snapshot, state: { ...props.snapshot.state, motionDisabled: true } }} />);
  expect(screen.UNSAFE_getByType(IrrigationControllerArtwork).props.motionAllowed).toBe(false);
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('irrigation-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Increase irrigation duration')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />));
  expect(screen.queryByTestId('irrigation-tactile-controller')).toBeNull();
});
test('spray native-driver loop stops on motion suspension and unmount', () => {
  jest.mocked(useDecorativeMotion).mockImplementation((allowed) => allowed);
  const loop = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
  jest.spyOn(Animated, 'loop').mockReturnValue(loop);
  const screen = render(<IrrigationControllerArtwork on={false} compact={false} motionAllowed />);
  expect(loop.start).not.toHaveBeenCalled();
  screen.rerender(<IrrigationControllerArtwork on compact={false} motionAllowed />); expect(loop.start).toHaveBeenCalledTimes(1);
  screen.rerender(<IrrigationControllerArtwork on compact={false} motionAllowed={false} />); expect(loop.stop).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('irrigation-preview-spray', { includeHiddenElements: true })).toBeTruthy();
  screen.rerender(<IrrigationControllerArtwork on compact={false} motionAllowed />); expect(loop.start).toHaveBeenCalledTimes(2);
  screen.unmount(); expect(loop.stop).toHaveBeenCalledTimes(2);
});
