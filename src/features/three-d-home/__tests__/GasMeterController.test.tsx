import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { GasMeterController } from '../GasMeterController';
import { GasMeterControllerArtwork } from '../GasMeterControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
const id = 'utility-gas-meter';
/** Keep the real projection and capture only guarded commands emitted by the native presentation. */
function setup() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device: getDevice(id)!, state: { on: true, level: 0 }, client,
    compact: false, fontScale: 1, disabled: false, onMore: jest.fn() };
  return { screen: render(<GasMeterController {...props} />), props, client };
}
/** Exercise actual inspector hydration and access gates instead of a parallel fake sheet. */
function inspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: id, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}
test('commands use the existing scenario client and never toggle monitoring power', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Simulate 30m usage')); fireEvent.press(screen.getByLabelText('Close preview valve'));
  expect(client.runAction.mock.calls).toEqual([[id, 'gas-meter-use-sample'], [id, 'gas-meter-close-valve']]);
  fireEvent.press(screen.getByLabelText('Usage alerts')); expect(client.setSetting).toHaveBeenLastCalledWith(id, 'gasUsageAlerts', false);
  expect(client.toggle).not.toHaveBeenCalled();
  screen.rerender(<GasMeterController {...props} state={{ on: true, level: 0, settings: { gasValveOpen: false, gasLeakInterlock: true } }} />);
  expect(screen.getByText('Leak preview active · valve closed')).toBeTruthy();
  client.runAction.mockClear(); fireEvent.press(screen.getByLabelText('Open preview valve')); fireEvent.press(screen.getByLabelText('Simulate 30m usage')); expect(client.runAction).not.toHaveBeenCalled();
});
test('malformed values stay unavailable and cannot trigger relative sample usage', () => {
  const { screen, props, client } = setup();
  screen.rerender(<GasMeterController {...props} state={{ on: true, level: 0, settings: { gasRemainingKg: '8.75', gasValveOpen: 'false' } }} />);
  expect(screen.getByLabelText('Demo gas remaining: — kg')).toBeTruthy(); fireEvent.press(screen.getByLabelText('Simulate 30m usage')); fireEvent.press(screen.getByLabelText('Open preview valve')); expect(client.runAction).not.toHaveBeenCalled();
});
test('regular, compact and large text keep touch targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false,1],[true,1],[true,1.8]] as const) {
    screen.rerender(<GasMeterController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style); expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(screen.UNSAFE_getByType(ScrollView).props).toMatchObject({ bounces: false, overScrollMode: 'never', nestedScrollEnabled: true });
  }
});
test('sizes artwork from available height and exposes More while controls are read-only', () => {
  const { screen, props, client } = setup();
  fireEvent(screen.getByTestId('gas-meter-controller-scroll'), 'layout', { nativeEvent: { layout: { width: 344, height: 480 } } });
  expect(screen.UNSAFE_getByType(GasMeterControllerArtwork).props.compact).toBe(true);
  screen.rerender(<GasMeterController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More gas meter controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true); fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled(); expect(client.setSetting).not.toHaveBeenCalled(); expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More gas meter controls')); expect(props.onMore).toHaveBeenCalledTimes(1);
});
test('More/Back retains original controls and actual inspector fails closed before hydration or after revocation', async () => {
  const { screen, props, client } = inspector();
  fireEvent.press(screen.getByLabelText('More gas meter controls')); expect(screen.getByLabelText('Back to gas meter controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to gas meter controller')); expect(screen.getByTestId('gas-meter-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />); expect(screen.queryByTestId('gas-meter-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Close preview valve')); expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />)); expect(screen.queryByTestId('gas-meter-tactile-controller')).toBeNull();
});
