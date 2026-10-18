import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { TV_SOURCE_OPTIONS } from '../../../../packages/home-scene/src/tvRemote';
import { TvRemoteControl } from '../TvRemoteControl';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import type { ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));

/** Keep writes observable while rendering the real native remote and its source picker. */
function setup(compact = false) {
  const device = getDevice('family-tv')!;
  const state = { ...createDefaultSimulationSnapshot().deviceStates[device.id], on: false,
    settings: { volume: 40, channel: 8, source: 'Netflix', muted: true, playbackState: 'playing' } };
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, disabled: false, onMore: jest.fn() };
  return { screen: render(<TvRemoteControl {...props} />), props, client };
}

test.each([false, true])('main controls remain present with full 44pt targets in compact=%s', (compact) => {
  const { screen } = setup(compact);
  for (const name of ['Turn TV on', 'Remote up', 'Remote left', 'Remote OK', 'Remote right', 'Remote down', 'Remote back',
    'Remote home', 'Preview guide', 'Volume up', 'Volume down', 'Channel up', 'Channel down', 'Unmute TV', 'Play preview',
    'Previous preview track', 'Rewind preview 10 seconds', 'Forward preview 10 seconds', 'Next preview track', 'More TV controls']) {
    const button = screen.getByRole('button', { name });
    const style = StyleSheet.flatten(button.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  }
  expect(screen.queryByLabelText('Next controls page')).toBeNull();
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
});

test('dispatches bounded relative and navigation actions instead of writing stale UI values', () => {
  const { screen, client, props } = setup();
  const actions = [
    ['Volume up', 'tv-volume-up'], ['Volume down', 'tv-volume-down'], ['Channel up', 'tv-channel-up'], ['Channel down', 'tv-channel-down'],
    ['Remote up', 'tv-remote-up'], ['Remote left', 'tv-remote-left'], ['Remote OK', 'tv-remote-select'], ['Remote right', 'tv-remote-right'],
    ['Remote down', 'tv-remote-down'], ['Remote back', 'tv-remote-back'], ['Remote home', 'tv-remote-home'], ['Preview guide', 'tv-source-guide'],
    ['Play preview', 'tv-play-pause'], ['Previous preview track', 'tv-previous'], ['Rewind preview 10 seconds', 'tv-rewind'],
    ['Forward preview 10 seconds', 'tv-forward'], ['Next preview track', 'tv-next'],
  ];
  for (const [label, action] of actions) {
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction).toHaveBeenLastCalledWith(props.device.id, action);
  }
  fireEvent.press(screen.getByLabelText('Volume up'));
  fireEvent.press(screen.getByLabelText('Volume up'));
  expect(client.runAction.mock.calls.slice(-2)).toEqual([['family-tv', 'tv-volume-up'], ['family-tv', 'tv-volume-up']]);
  fireEvent.press(screen.getByLabelText('Turn TV on'));
  expect(client.toggle).toHaveBeenCalledWith('family-tv');
  fireEvent.press(screen.getByLabelText('Unmute TV'));
  expect(client.setSetting).toHaveBeenCalledWith('family-tv', 'muted', false);
});

test('off presentation waits for saved state and never displays a remembered playback value as playing', () => {
  const { screen, props } = setup();
  expect(screen.getByText('TV OFF')).toBeTruthy();
  expect(screen.getByText('TV off · Your settings are remembered')).toBeTruthy();
  expect(screen.queryByText(/Playing ·/)).toBeNull();
  fireEvent.press(screen.getByLabelText('Turn TV on'));
  expect(screen.getByText('TV OFF')).toBeTruthy();
  screen.rerender(<TvRemoteControl {...props} state={{ ...props.state, on: true }} />);
  expect(screen.getByText('TV ON')).toBeTruthy();
  expect(screen.getByLabelText('Pause preview')).toBeTruthy();
  expect(screen.getByLabelText('Turn TV off')).toBeTruthy();
});

test('source chooser exposes only catalog options and changes the selected source without a power command', () => {
  const { screen, client, props } = setup();
  fireEvent.press(screen.getByLabelText('Source: Netflix. Choose preview source'));
  expect(screen.getByText('Local simulation · No streaming connection')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(TV_SOURCE_OPTIONS.length);
  expect(screen.getByRole('radio', { name: 'Netflix' }).props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByRole('radio', { name: 'Guide' }));
  expect(client.setSetting).toHaveBeenCalledWith(props.device.id, 'source', 'Guide');
  expect(client.toggle).not.toHaveBeenCalled();
  expect(screen.queryByTestId('tv-source-picker')).toBeNull();
  expect(screen.getByTestId('tv-tactile-remote')).toBeTruthy();
});

test('read-only access blocks every device write, including a source picker already open during revocation', () => {
  const { screen, props, client } = setup(true);
  fireEvent.press(screen.getByLabelText('Source: Netflix. Choose preview source'));
  screen.rerender(<TvRemoteControl {...props} disabled />);
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(radio);
  }
  fireEvent.press(screen.getByLabelText('Back to TV remote'));
  for (const button of screen.getAllByRole('button')) {
    if (button.props.accessibilityLabel !== 'More TV controls') {
      expect(button.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(button);
    }
  }
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More TV controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test('native inspector opens the remote first and preserves advanced routines, settings, status, and return', () => {
  const { props } = setup();
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const screen = render(<DeviceControlsSheet deviceId="family-tv" client={props.client} snapshot={snapshot}
    motionAllowed={false} onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(screen.getByTestId('tv-tactile-remote')).toBeTruthy();
  expect(screen.queryByLabelText('Next controls page')).toBeNull();
  fireEvent.press(screen.getByLabelText('More TV controls'));
  expect(screen.queryByTestId('tv-tactile-remote')).toBeNull();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to TV remote'));
  expect(screen.getByTestId('tv-tactile-remote')).toBeTruthy();
});
