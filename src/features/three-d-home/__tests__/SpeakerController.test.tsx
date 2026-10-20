import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { SPEAKER_PRESET_OPTIONS, SPEAKER_SOURCE_OPTIONS } from '../../../../packages/home-scene/src/speakerController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { SpeakerController } from '../SpeakerController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));
afterEach(() => jest.restoreAllMocks());

/** Keep the shared state projection real while recording every requested write. */
function setup() {
  const device = getDevice('living-speaker')!;
  const state: DeviceState = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false, settings: {
    playbackState: 'stopped', trackIndex: 5, volume: 28, muted: false, speakerSource: 'Spotify', speakerPreset: 'Warm',
  } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact: false, fontScale: 1, disabled: false, onMore: jest.fn() };
  return { screen: render(<SpeakerController {...props} />), props, client };
}

/** Exercise native inspector hydration, current-access and per-device navigation boundaries. */
function renderInspector() {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: 'living-speaker', client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test('regular, compact and large-text controls retain touch targets and contained scroll recovery', () => {
  const { screen, props } = setup();
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<SpeakerController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(screen.queryByLabelText('Next controls page')).toBeNull();
  }
});

test.each([
  [false, 'playing', false, 28, 'Play speaker preview', 0],
  [true, 'stopped', false, 28, 'Play speaker preview', 0],
  [true, 'paused', false, 28, 'Play speaker preview', 0],
  [true, 'playing', false, 28, 'Pause speaker preview', 1],
  [true, 'playing', true, 28, 'Pause speaker preview', 0],
  [true, 'playing', false, 0, 'Pause speaker preview', 0],
] as const)('power %s playback %s muted %s volume %s retains truthful playback controls and indicator', (on, playbackState, muted, volume, label, indicator) => {
  const { screen, props, client } = setup();
  screen.rerender(<SpeakerController {...props} state={{ ...props.state, on, settings: { ...props.state.settings, playbackState, muted, volume } }} />);
  expect(screen.getByTestId('speaker-preview-indicator', { includeHiddenElements: true }).props.opacity).toBe(indicator);
  expect(screen.getByRole('switch', { name: 'Speaker power' }).props.accessibilityState.checked).toBe(on);
  expect(screen.getByRole('switch', { name: 'Speaker mute' }).props.accessibilityState.checked).toBe(muted);
  fireEvent.press(screen.getByLabelText(label));
  expect(client.runAction).toHaveBeenCalledWith('living-speaker', 'speaker-play-pause');
  expect(client.toggle).not.toHaveBeenCalled();
});

test('power, transport, relative volume and mute use their existing scoped commands', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByRole('switch', { name: 'Speaker power' }));
  expect(client.toggle).toHaveBeenCalledWith('living-speaker');
  expect(screen.getByRole('switch', { name: 'Speaker power' }).props.accessibilityState.checked).toBe(false);
  for (const [label, action] of [
    ['Previous speaker preview track', 'speaker-previous'], ['Next speaker preview track', 'speaker-next'],
    ['Increase speaker volume', 'speaker-volume-up'], ['Decrease speaker volume', 'speaker-volume-down'],
  ]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['living-speaker', action], ['living-speaker', action]]);
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Speaker mute' }));
  expect(client.setSetting).toHaveBeenCalledWith('living-speaker', 'muted', true);
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(props.state.on).toBe(false);
  expect(screen.getByText('Local playback preview · No audio is streamed')).toBeTruthy();
});

test.each([[0, 'Decrease'], [100, 'Increase']] as const)('volume %s disables only its exhausted adjustment', (volume, direction) => {
  const { screen, props, client } = setup();
  screen.rerender(<SpeakerController {...props} state={{ ...props.state, settings: { ...props.state.settings, volume } }} />);
  const button = screen.getByLabelText(`${direction} speaker volume`);
  expect(button.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(button);
  expect(client.runAction).not.toHaveBeenCalled();
});

test.each([[1, true, false], [99, false, true], ['unknown', true, true]] as const)('track %s prevents exhausted or unknown track navigation', (trackIndex, previousDisabled, nextDisabled) => {
  const { screen, props, client } = setup();
  screen.rerender(<SpeakerController {...props} state={{ ...props.state, settings: { ...props.state.settings, trackIndex } }} />);
  for (const [label, disabled] of [['Previous speaker preview track', previousDisabled], ['Next speaker preview track', nextDisabled]] as const) {
    const control = screen.getByLabelText(label);
    expect(control.props.accessibilityState.disabled).toBe(disabled);
    if (disabled) fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
});

test('source and sound choices preserve power and playback until shared state accepts the choice', () => {
  const { screen, props, client } = setup();
  for (const [field, label, prefix, options, current] of [
    ['speakerSource', 'Speaker source: Spotify. Choose source', 'Source', SPEAKER_SOURCE_OPTIONS, 'Spotify'],
    ['speakerPreset', 'Sound preset: Warm. Choose sound preset', 'Sound preset', SPEAKER_PRESET_OPTIONS, 'Warm'],
  ] as const) {
    for (const option of options) {
      fireEvent.press(screen.getByLabelText(label));
      expect(screen.getByRole('radio', { name: `${prefix}: ${current}` }).props.accessibilityState.checked).toBe(true);
      const choice = screen.getByRole('radio', { name: `${prefix}: ${option.label}` });
      expect(StyleSheet.flatten(choice.props.style).minHeight).toBeGreaterThanOrEqual(44);
      fireEvent.press(choice);
      expect(client.setSetting).toHaveBeenLastCalledWith('living-speaker', field, option.value);
      expect(screen.getByTestId('speaker-tactile-controller')).toBeTruthy();
    }
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(props.state.settings?.playbackState).toBe('stopped');
  fireEvent.press(screen.getByLabelText('Speaker source: Spotify. Choose source'));
  fireEvent.press(screen.getByLabelText('Back to speaker controller'));
  expect(client.setSetting).toHaveBeenCalledTimes(10);
});

test('unknown track and playback stay unavailable without a fabricated title, time or progress', () => {
  const { screen, props } = setup();
  screen.rerender(<SpeakerController {...props} state={{ ...props.state, on: true, settings: { ...props.state.settings, trackIndex: 'unknown', playbackState: 'invalid' } }} />);
  expect(screen.getByText('Preview track unavailable')).toBeTruthy();
  expect(screen.getByText('Playback unavailable')).toBeTruthy();
  expect(screen.queryByText('NaN')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByTestId('speaker-preview-indicator', { includeHiddenElements: true }).props.opacity).toBe(0);
});

test('read-only state blocks writes and an already-open preference picker follows revoked access', () => {
  const { screen, props, client } = setup();
  fireEvent.press(screen.getByLabelText('Speaker source: Spotify. Choose source'));
  screen.rerender(<SpeakerController {...props} disabled />);
  for (const control of screen.getAllByRole('radio')) {
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  fireEvent.press(screen.getByLabelText('Back to speaker controller'));
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More speaker controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More speaker controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('a deferred native playback command rechecks current household access', () => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'living', name: 'Living', modelRoomId: 'living' }],
    devices: [{ id: 'saved-speaker', modelDeviceId: 'living-speaker', name: 'Speaker', roomId: 'living', kind: 'speaker', isOn: false }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<SpeakerController device={getDevice('living-speaker')!} state={{ on: false, level: 28, settings: { playbackState: 'stopped' } }}
    client={guardModelDeviceControls(client)} disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText('Play speaker preview'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
      candidate.props.accessibilityLabel === 'Play speaker preview' && Object.hasOwn(candidate.props, 'onPress'))[0].props.onPress;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More retains the full inspector and changing the device resets picker/navigation state', () => {
  const { screen, props } = renderInspector();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More speaker controls'));
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to speaker controller'));
  expect(screen.getByTestId('speaker-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/Speaker source:.*Choose source/));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="living-vacuum" />);
  expect(screen.getByTestId('vacuum-tactile-controller')).toBeTruthy();
  screen.rerender(<DeviceControlsSheet {...props} />);
  expect(screen.getByTestId('speaker-tactile-controller')).toBeTruthy();
});

test('unread saved state and revoked grants never expose writable default controls', async () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('speaker-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText(/^(Play|Pause) speaker preview$/));
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('speaker-tactile-controller')).toBeNull();
});
