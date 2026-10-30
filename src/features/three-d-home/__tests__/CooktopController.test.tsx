import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { CooktopController } from '../CooktopController';
import { CooktopControllerArtwork } from '../CooktopControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'kitchen-stove';

/** Capture only commands while keeping the real shared state projection and device definition. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = {
    device: getDevice(id)!, state: { on: false, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, onMore: jest.fn(),
  };
  return { screen: render(<CooktopController {...props} />), props, client };
}

/** Exercise the actual inspector rather than duplicating its permission and hydration checks. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('dispatches relative settings separately from explicit power and labels saved-only preferences', () => {
  const { screen, client, props } = setup();
  fireEvent.press(screen.getByLabelText('Increase cooktop heat'));
  fireEvent.press(screen.getByLabelText('Increase cooktop timer'));
  fireEvent.press(screen.getByLabelText('Cooktop mode: Sear'));
  fireEvent.press(screen.getByLabelText('Child-lock preference'));
  expect(client.runAction.mock.calls).toEqual([[id, 'stove-heat-up'], [id, 'stove-timer-up']]);
  expect(client.setSetting.mock.calls).toEqual([[id, 'stoveMode', 'sear'], [id, 'stoveLock', true]]);
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(screen.getByText('Timer and lock are saved only')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Turn cooktop preview on'));
  expect(client.setPower).toHaveBeenLastCalledWith([id], true);
  screen.rerender(<CooktopController {...props} state={{ on: true, level: 0, settings: { burnerLevel: 7, stoveTimerMin: 25, stoveLock: true } }} />);
  expect(screen.getByLabelText('Saved cooktop heat: 7 of 10')).toBeTruthy();
  expect(screen.getByLabelText('Saved cooktop timer: 25 minutes')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Decrease cooktop heat'));
  fireEvent.press(screen.getByLabelText('Decrease cooktop timer'));
  expect(client.runAction.mock.calls.slice(-2)).toEqual([[id, 'stove-heat-down'], [id, 'stove-timer-down']]);
  fireEvent.press(screen.getByLabelText('Turn cooktop preview off'));
  expect(client.setPower).toHaveBeenLastCalledWith([id], false);
});

test('guards exact bounds and keeps malformed saved values unavailable', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Decrease cooktop heat'));
  fireEvent.press(screen.getByLabelText('Decrease cooktop timer'));
  expect(client.runAction).not.toHaveBeenCalled();
  screen.rerender(<CooktopController {...props} state={{ on: true, level: 0, settings: { burnerLevel: 10, stoveTimerMin: 60 } }} />);
  fireEvent.press(screen.getByLabelText('Increase cooktop heat'));
  fireEvent.press(screen.getByLabelText('Increase cooktop timer'));
  expect(client.runAction).not.toHaveBeenCalled();
  screen.rerender(<CooktopController {...props} state={{ on: true, level: 0, settings: { burnerLevel: '7', stoveTimerMin: 61, stoveLock: 'false' } }} />);
  expect(screen.getByLabelText('Saved cooktop heat: unavailable of 10')).toBeTruthy();
  expect(screen.getByLabelText('Saved cooktop timer: unavailable minutes')).toBeTruthy();
  for (const label of ['Decrease cooktop heat', 'Increase cooktop heat', 'Decrease cooktop timer', 'Increase cooktop timer', 'Child-lock preference unavailable']) {
    expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText(label));
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
});

test('regular, compact and large text retain full targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<CooktopController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});

test('uses measured sheet height for artwork and leaves More available when controls become read-only', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('cooktop-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(CooktopControllerArtwork).props.compact).toBe(true);
  screen.rerender(<CooktopController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More cooktop controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More cooktop controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('More/Back retains original controls and inspector access fails closed before hydration or after revocation', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More cooktop controls'));
  expect(screen.getByLabelText('Back to cooktop controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to cooktop controller'));
  expect(screen.getByTestId('cooktop-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('cooktop-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Increase cooktop heat'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />));
  expect(screen.queryByTestId('cooktop-tactile-controller')).toBeNull();
});
