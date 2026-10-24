import React from 'react';
import { AppState, Platform, ScrollView, StyleSheet } from 'react-native';
import Svg from 'react-native-svg';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { CameraController } from '../CameraController';
import { CameraControllerArtwork } from '../CameraControllerArtwork';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => jest.restoreAllMocks());

/** Use accepted simulation state while observing only scoped camera writes. */
function setup(deviceId = 'entry-camera') {
  const device = getDevice(deviceId)!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false,
    settings: { nightVision: false, motionAlerts: false, recording: true, micMuted: true, twoWayAudio: false } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, onMore: jest.fn() };
  return { screen: render(<CameraController {...props} />), props, client };
}

/** Exercise the actual inspector's hydration, permissions and More navigation. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'entry-camera', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('regular, compact and large-text controls retain 44-point targets and a contained fallback', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<CameraController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
  }
});

test.each(['entry-camera', 'drive-camera', 'terrace-camera'])('%s arming and snapshot use only accepted local camera commands', (deviceId) => {
  const { screen, props, client } = setup(deviceId);
  fireEvent.press(screen.getByLabelText('Arm camera preview'));
  fireEvent.press(screen.getByLabelText('Arm camera preview'));
  expect(client.toggle.mock.calls).toEqual([[deviceId], [deviceId]]);
  expect(screen.getByText('Disarmed preview')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Simulate snapshot'));
  expect(client.runAction).toHaveBeenLastCalledWith(deviceId, 'camera-snapshot');
  expect(screen.getByText('No preview events')).toBeTruthy();
  screen.rerender(<CameraController {...props} state={{ ...props.state, on: true, settings: { ...props.state.settings, cameraPreviewEvent: 'Simulated snapshot' } }} />);
  expect(screen.getByText('Armed preview')).toBeTruthy();
  expect(screen.getByText('Simulated snapshot')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Disarm camera preview'));
  expect(client.toggle).toHaveBeenLastCalledWith(deviceId);
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
});

test.each([true, false])('Night and Alerts preserve arming=%s and leave media preferences untouched', (on) => {
  const { screen, props, client } = setup();
  screen.rerender(<CameraController {...props} state={{ ...props.state, on }} />);
  fireEvent.press(screen.getByRole('switch', { name: 'Camera Night vision preference' }));
  fireEvent.press(screen.getByRole('switch', { name: 'Camera Motion alerts preference' }));
  expect(client.setSetting.mock.calls).toEqual([['entry-camera', 'nightVision', true], ['entry-camera', 'motionAlerts', true]]);
  expect(screen.getByRole('switch', { name: 'Camera Night vision preference' }).props.accessibilityState.checked).toBe(false);
  expect(screen.UNSAFE_getByType(CameraControllerArtwork).props.nightVision).toBe(false);
  screen.rerender(<CameraController {...props} state={{ ...props.state, on, settings: { ...props.state.settings, nightVision: true, motionAlerts: true } }} />);
  expect(screen.UNSAFE_getByType(CameraControllerArtwork).props.nightVision).toBe(true);
  fireEvent.press(screen.getByRole('switch', { name: 'Camera Night vision preference' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('entry-camera', 'nightVision', false);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
});

test('sample art remains visible when disarmed and never claims real capture, recording or privacy closure', () => {
  const { screen, props } = setup();
  for (const on of [true, false]) {
    screen.rerender(<CameraController {...props} state={{ ...props.state, on }} />);
    expect(screen.getByTestId('camera-sample-artwork', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('SAMPLE PREVIEW')).toBeTruthy();
    expect(screen.getByText('Architectural illustration')).toBeTruthy();
    expect(screen.getByText('Simulation · No live feed connected')).toBeTruthy();
    expect(screen.queryByText(/^(LIVE|REC|Recording|Private|Camera off)$/i)).toBeNull();
  }
});

test('unknown events remain unavailable rather than being presented as no activity', () => {
  const { screen, props } = setup();
  screen.rerender(<CameraController {...props} state={{ ...props.state, settings: { cameraPreviewEvent: 'Untrusted event' } }} />);
  expect(screen.getByText('Preview event unavailable')).toBeTruthy();
  expect(screen.queryByText('Untrusted event')).toBeNull();
  expect(screen.queryByText('No preview events')).toBeNull();
});

test('static artwork needs no application listener or animation work and keeps brushes in one SVG root', () => {
  const listen = jest.spyOn(AppState, 'addEventListener');
  const screen = render(<CameraControllerArtwork compact={false} nightVision={false} />);
  expect(listen).not.toHaveBeenCalled();
  for (const nightVision of [true, false]) {
    screen.rerender(<CameraControllerArtwork compact nightVision={nightVision} />);
    for (const svg of screen.UNSAFE_getAllByType(Svg)) {
      const nodes: Array<{ props: Record<string, unknown> }> = svg.findAll(() => true);
      const ids = new Set(nodes.map((node) => node.props.id).filter(Boolean));
      for (const node of nodes) {
        const paint = node.props.fill;
        const id = typeof paint === 'string' ? /^url\(#(.+)\)$/.exec(paint)?.[1] : undefined;
        if (id) expect(ids.has(id)).toBe(true);
      }
    }
  }
});

test('read-only camera access disables mutation but leaves More reachable', () => {
  const { screen, props, client } = setup();
  screen.rerender(<CameraController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More camera controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More camera controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('web switches support Space once and ignore repeat or disabled keyboard input', () => {
  const platform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  try {
    const { screen, props, client } = setup();
    const preventDefault = jest.fn();
    for (const label of ['Camera Night vision preference', 'Camera Motion alerts preference']) {
      const control = screen.getByRole('switch', { name: label });
      fireEvent(control, 'keyDown', { key: ' ', preventDefault });
      fireEvent(control, 'keyDown', { key: ' ', repeat: true, preventDefault });
    }
    expect(client.setSetting).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalledTimes(4);
    screen.rerender(<CameraController {...props} disabled />);
    fireEvent(screen.getByRole('switch', { name: 'Camera Night vision preference' }), 'keyDown', { key: ' ', preventDefault });
    expect(client.setSetting).toHaveBeenCalledTimes(2);
  } finally { Object.defineProperty(Platform, 'OS', { value: platform, configurable: true }); }
});

test('a retained camera callback rechecks current household authorization', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [{ id: 'saved-camera', modelDeviceId: 'entry-camera', name: 'Camera', roomId: 'grounds', kind: 'camera', isOn: false, simulationOnly: true }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<CameraController device={getDevice('entry-camera')!} state={{ on: false, level: 0 }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Simulate snapshot'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Simulate snapshot' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More preserves every group and switching cameras cannot retain a previous event or advanced panel', () => {
  const { screen, props } = renderInspector();
  fireEvent.press(screen.getByLabelText('More camera controls'));
  expect(screen.queryByTestId('camera-sample-artwork', { includeHiddenElements: true })).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to camera controller'));
  expect(screen.getByTestId('camera-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More camera controls'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="drive-camera" />);
  expect(screen.getByTestId('camera-tactile-controller')).toBeTruthy();
  expect(screen.queryByLabelText('Back to camera controller')).toBeNull();
});

test('unread or revoked camera state never shows writable defaults', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('camera-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText('Simulate snapshot'));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('camera-tactile-controller')).toBeNull();
});

test('Watch remains a navigation action for a view-only camera and never mutates arming or preferences', () => {
  const { screen, props, client } = setup();
  const onWatch = jest.fn();
  screen.rerender(<CameraController {...props} disabled onWatch={onWatch} />);
  fireEvent.press(screen.getByLabelText('Watch camera demo preview'));
  expect(onWatch).toHaveBeenCalledTimes(1);
  for (const command of Object.values(client)) expect(command).not.toHaveBeenCalled();
});
