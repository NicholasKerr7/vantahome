import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { BATTERY_RESERVE_PRESETS, BATTERY_STORAGE_OPTIONS, GENERATOR_MODE_OPTIONS, type EnergyDeviceKind } from '../../../../packages/home-scene/src/energyController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { AppFeedback } from '../../../services/appFeedback';
import * as simulationDeviceEditing from '../../../services/simulationDeviceEditing';
import { useHomeStore } from '../../../store/useHomeStore';
import { EnergyController } from '../EnergyController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
const mockOpenRoutines = jest.fn();
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => mockOpenRoutines }));
beforeEach(() => mockOpenRoutines.mockClear());
afterEach(() => jest.restoreAllMocks());

/** Render the actual selected-device projection and keep all dispatch paths observable. */
function setup(kind: EnergyDeviceKind = 'energy', compact = false, fontScale = 1) {
  const device = getDevice(`utility-${kind}`)!;
  const state = createDefaultSimulationSnapshot().deviceStates[device.id];
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, fontScale, disabled: false, onMore: jest.fn() };
  return { screen: render(<EnergyController {...props} />), props, client };
}

/** Inspect the prop before native Pressable or SVG translates it for its platform. */
function forwardedProp(screen: ReturnType<typeof render>, selector: string, prop: string): unknown {
  const node = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
    (candidate.props.accessibilityLabel === selector || candidate.props.testID === selector) && Object.hasOwn(candidate.props, prop))[0];
  if (!node) throw new Error(`Missing controller prop: ${selector} / ${prop}`);
  return node.props[prop];
}

/** Exercise the real hydrated inspector and its existing access and keyed-navigation boundary. */
function renderInspector(kind: EnergyDeviceKind = 'energy') {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: `utility-${kind}`, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test.each(['energy', 'solar', 'battery', 'generator'] as const)('%s keeps 44pt controls and contained momentum scrolling at compact and larger text sizes', (kind) => {
  const { screen, props } = setup(kind);
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<EnergyController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.queryAllByRole('radio')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(screen.getByTestId(`energy-preview-${kind}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByLabelText('Next controls page')).toBeNull();
  }
});

test('meter sample checks and outage actions target only its own device without inventing power commands or totals', () => {
  const { screen, props, client } = setup();
  expect(screen.getByText('0.68 kW')).toBeTruthy();
  expect(screen.getByText('0.42 kW')).toBeTruthy();
  expect(screen.queryByText('3.20 kW')).toBeNull();
  fireEvent.press(screen.getByLabelText('Check sample'));
  expect(client.toggle).toHaveBeenLastCalledWith('utility-energy');
  fireEvent.press(screen.getByLabelText('Simulate grid outage'));
  fireEvent.press(screen.getByLabelText('Simulate grid outage'));
  expect(client.runAction.mock.calls).toEqual([['utility-energy', 'energy-outage'], ['utility-energy', 'energy-outage']]);
  expect(screen.getByText('Grid available · sample')).toBeTruthy();
  expect(screen.getByLabelText('Restore sample grid').props.accessibilityState.disabled).toBe(true);
  screen.rerender(<EnergyController {...props} state={{ ...props.state, settings: { ...props.state.settings, gridAvailable: false } }} />);
  expect(screen.getByText('Grid outage · sample')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Restore sample grid'));
  expect(client.runAction).toHaveBeenLastCalledWith('utility-energy', 'energy-restore-grid');
  expect(screen.getByLabelText('Simulate grid outage').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText('0.68 kW')).toBeTruthy();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
});

test('solar refresh keeps sampled generation and external status authoritative', () => {
  const { screen, props, client } = setup('solar');
  expect(screen.getByText('3.20 kW')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Check sample'));
  expect(client.toggle).toHaveBeenCalledWith('utility-solar');
  expect(screen.queryByLabelText('Turn power off')).toBeNull();
  screen.rerender(<EnergyController {...props} state={{ ...props.state, settings: { solarW: 0, solarTodayKwh: 7.5, inverterStatus: 'Standby', sampleChecked: true } }} />);
  expect(screen.getByText('0.00 kW')).toBeTruthy();
  expect(screen.getByText('7.5 kWh')).toBeTruthy();
  expect(screen.getByText('Standby')).toBeTruthy();
  expect(screen.getByText('Sample checked')).toBeTruthy();
  expect(client.setPower).not.toHaveBeenCalled();
});

test('battery reserve and modes are saved preferences and never mutate sampled charge or power', () => {
  const { screen, props, client } = setup('battery');
  expect(screen.getByText('78 %')).toBeTruthy();
  expect(screen.queryByLabelText('Check sample')).toBeNull();
  expect(screen.getByText('Reserve and mode: saved preferences only · No simulated charging.')).toBeTruthy();
  for (const option of BATTERY_RESERVE_PRESETS) {
    fireEvent.press(screen.getByRole('radio', { name: `Reserve preference: ${option.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('utility-battery', 'reservePercent', option.value);
  }
  for (const option of BATTERY_STORAGE_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `Storage preference: ${option.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('utility-battery', 'storageMode', option.value);
  }
  expect(forwardedProp(screen, 'Storage preference: Backup', 'aria-checked')).toBe(true);
  expect(forwardedProp(screen, 'Storage preference: Charge', 'aria-checked')).toBe(false);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  screen.rerender(<EnergyController {...props} state={{ ...props.state, level: 37, settings: { reservePercent: 40, storageMode: 'charge' } }} />);
  expect(screen.getByText('37 %')).toBeTruthy();
  expect(forwardedProp(screen, 'energy-battery-charge-fill', 'height')).toBeCloseTo(37 * 0.57);
  expect(forwardedProp(screen, 'Reserve preference: 40%', 'aria-checked')).toBe(true);
  expect(forwardedProp(screen, 'Storage preference: Charge', 'aria-checked')).toBe(true);
  screen.rerender(<EnergyController {...props} state={{ ...props.state, settings: { reservePercent: 33 } }} />);
  for (const option of BATTERY_RESERVE_PRESETS) expect(forwardedProp(screen, `Reserve preference: ${option.label}`, 'aria-checked')).toBe(false);
});

test('battery enable and disable preserve sampled charge, reserve and storage mode until confirmed state changes', () => {
  const { screen, props, client } = setup('battery');
  const state = { ...props.state, on: true, level: 47, settings: { reservePercent: 40, storageMode: 'self-use' } };
  screen.rerender(<EnergyController {...props} state={state} />);
  fireEvent.press(screen.getByLabelText('Disable battery preview'));
  expect(client.toggle).toHaveBeenLastCalledWith('utility-battery');
  expect(screen.getByText('Enabled')).toBeTruthy();
  screen.rerender(<EnergyController {...props} state={{ ...state, on: false }} />);
  expect(screen.getByText('Off')).toBeTruthy();
  expect(screen.getByText('47 %')).toBeTruthy();
  expect(forwardedProp(screen, 'energy-battery-charge-fill', 'height')).toBeCloseTo(47 * 0.57);
  expect(forwardedProp(screen, 'Reserve preference: 40%', 'aria-checked')).toBe(true);
  expect(forwardedProp(screen, 'Storage preference: Self-Use', 'aria-checked')).toBe(true);
  fireEvent.press(screen.getByLabelText('Enable battery preview'));
  expect(client.toggle).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Off')).toBeTruthy();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
});

test('generator start/stop and saved Auto mode remain independent, with output derived from confirmed power', () => {
  const { screen, props, client } = setup('generator');
  expect(screen.getByText('0.00 kW')).toBeTruthy();
  expect(screen.getByText('Stopped simulation')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Start simulation'));
  expect(client.toggle).toHaveBeenCalledWith('utility-generator');
  expect(screen.getByText('Stopped simulation')).toBeTruthy();
  for (const option of GENERATOR_MODE_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `Start mode preference: ${option.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('utility-generator', 'generatorMode', option.value);
  }
  expect(client.toggle).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Start mode: saved preference only · No automatic start.')).toBeTruthy();
  expect(forwardedProp(screen, 'Start mode preference: Auto', 'aria-checked')).toBe(true);
  screen.rerender(<EnergyController {...props} state={{ ...props.state, on: true, settings: { generatorMode: 'manual' } }} />);
  expect(screen.getByText('3.90 kW')).toBeTruthy();
  expect(screen.getByText('Running simulation')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Stop simulation'));
  expect(client.toggle).toHaveBeenCalledTimes(2);
  expect(forwardedProp(screen, 'Start mode preference: Auto', 'aria-checked')).toBe(false);
});

test.each(['energy', 'solar', 'battery', 'generator'] as const)('%s revoked controls remain disabled while More is accessible', (kind) => {
  const { screen, props, client } = setup(kind);
  screen.rerender(<EnergyController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.queryAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More energy controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More energy controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test.each([
  { kind: 'energy', label: 'Simulate grid outage', method: 'runAction' },
  { kind: 'battery', label: 'Disable battery preview', method: 'toggle' },
] as const)('a deferred $kind press rechecks membership through the existing guarded client', ({ kind, label, method }) => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'utility-room', name: 'Utility', modelRoomId: 'utility' }],
    devices: [{ id: 'saved-energy', modelDeviceId: `utility-${kind}`, name: 'Energy device', roomId: 'utility-room', kind, isOn: true }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, method).mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<EnergyController device={getDevice(`utility-${kind}`)!} state={{ on: true, level: 55 }} client={guardModelDeviceControls(client)}
    disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText(label));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = forwardedProp(screen, label, 'onPress') as () => void;
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More keeps every advanced section and returns to the correct controller when changing devices', () => {
  const { screen, props, client } = renderInspector('battery');
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More energy controls'));
  expect(screen.getByLabelText('Backup reserve')).toBeTruthy();
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  // Battery has no shared-routine actions; More preserves that existing disabled state.
  expect(screen.getByLabelText('Routines').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText('Back to energy controller'));
  expect(screen.getByTestId('energy-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More energy controls'));
  screen.rerender(<DeviceControlsSheet {...props} deviceId="utility-generator" />);
  expect(screen.getByTestId('energy-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Start simulation'));
  expect(client.toggle).toHaveBeenLastCalledWith('utility-generator');
  for (const [id, more, back, marker] of [
    ['living-light', 'More lighting controls', 'Back to lighting controller', 'lighting-tactile-controller'],
    ['family-tv', 'More TV controls', 'Back to TV remote', 'tv-tactile-remote'],
    ['master-ac', 'More climate controls', 'Back to climate controller', 'climate-tactile-controller'],
    ['master-blinds', 'More blinds controls', 'Back to blinds controller', 'blinds-tactile-controller'],
  ]) {
    screen.rerender(<DeviceControlsSheet {...props} deviceId={id} />);
    expect(screen.getByTestId(marker)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(more));
    if (id === 'living-light') {
      fireEvent.press(screen.getByLabelText('Routines'));
      fireEvent.press(screen.getByLabelText('View device routines'));
      expect(mockOpenRoutines).toHaveBeenCalledWith(id);
    }
    fireEvent.press(screen.getByLabelText(back));
    expect(screen.getByTestId(marker)).toBeTruthy();
  }
});

test('unread saved state and read-only access do not expose writable sample defaults', () => {
  const { screen, props, client } = renderInspector();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('energy-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Check sample'));
  expect(client.toggle).not.toHaveBeenCalled();
});

test.each(['device', 'room', 'library'] as const)('revoking the selected %s view removes its sample controller instead of projecting hidden defaults', async (boundary) => {
  const { screen, props } = renderInspector();
  const access = { ...FULL_SCENE_ACCESS,
    deviceIds: boundary === 'device' ? FULL_SCENE_ACCESS.deviceIds.filter((id) => id !== props.deviceId) : FULL_SCENE_ACCESS.deviceIds,
    roomIds: boundary === 'room' ? FULL_SCENE_ACCESS.roomIds.filter((id) => id !== 'utility') : FULL_SCENE_ACCESS.roomIds };
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={boundary === 'library' ? ['living-light'] : undefined}
    snapshot={{ ...props.snapshot, access }} />); });
  expect(screen.queryByTestId('energy-tactile-controller')).toBeNull();
  expect(screen.queryByText('0.68 kW')).toBeNull();
  expect(screen.queryByRole('header', { name: 'Home energy controller' })).toBeNull();
});

test('fallback room lists and search intersect current view grants with a stale library allowlist', async () => {
  const { screen, props } = renderInspector();
  const access = { ...FULL_SCENE_ACCESS, roomIds: ['utility'], deviceIds: ['utility-solar'], controllableDeviceIds: [] };
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props}
    allowedDeviceIds={['utility-energy', 'utility-battery', 'utility-solar']}
    snapshot={{ ...props.snapshot, access }} />); });
  expect(screen.getByLabelText('Energy pavilion, 1 devices')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Energy pavilion, 1 devices'));
  expect(screen.getByText('Solar array')).toBeTruthy();
  expect(screen.getByLabelText('Refresh sample: Solar array').props.accessibilityState.disabled).toBe(true);
  expect(screen.queryByText('Home energy controller')).toBeNull();
  expect(screen.queryByText('Solar battery bank')).toBeNull();
  expect(screen.queryByText('0.68 kW')).toBeNull();
  for (const name of ['Home energy controller', 'Solar battery bank']) {
    fireEvent.changeText(screen.getByLabelText('Search all devices and rooms'), name);
    expect(screen.getByText('No matching devices')).toBeTruthy();
    expect(screen.queryByText(name)).toBeNull();
  }
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Search all devices and rooms'), 'Solar array'); });
  expect(screen.getByText('Solar array')).toBeTruthy();
});

test('legacy callers without a snapshot access object retain their supplied library boundary', async () => {
  const { screen, props } = renderInspector();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} deviceId={null} allowedDeviceIds={['utility-energy']}
    snapshot={{ ...props.snapshot, access: undefined }} />); });
  fireEvent.changeText(screen.getByLabelText('Search all devices and rooms'), 'Home energy controller');
  expect(screen.getByText('Home energy controller')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Search all devices and rooms'), 'Solar array');
  expect(screen.getByText('No matching devices')).toBeTruthy();
});

test('a revoked selection uses the library heading and removes its edit footer even when host metadata is still editable', async () => {
  const original = useHomeStore.getState();
  // Editing authorization has separate coverage; hold it valid here to isolate the current view boundary.
  jest.spyOn(simulationDeviceEditing, 'canEditSimulationDevice').mockReturnValue(true);
  useHomeStore.setState({ devices: [{ id: 'saved-energy', modelDeviceId: 'utility-energy', name: 'Energy meter', roomId: 'utility-room', kind: 'energy', isOn: true }] });
  const { screen, props } = renderInspector();
  try {
    expect(screen.getByLabelText('Edit device')).toBeTruthy();
    await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={['utility-energy']}
      snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
    expect(screen.getByRole('header', { name: 'Device library' })).toBeTruthy();
    expect(screen.queryByLabelText('Edit device')).toBeNull();
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});
