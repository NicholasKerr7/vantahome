import React from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { WATER_HEATER_MODE_OPTIONS, type WaterDeviceKind } from '../../../../packages/home-scene/src/waterController';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import type { DeviceState } from '../../../../packages/home-scene/src/simulationTypes';
import { AppFeedback } from '../../../services/appFeedback';
import { useHomeStore } from '../../../store/useHomeStore';
import { WaterController } from '../WaterController';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { guardModelDeviceControls } from '../modelDeviceControls';
import { SimulationControlClient, type ControlSnapshot } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
jest.mock('../../cinematic-artwork/CinematicCardArtwork', () => require('react-native').View);
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => jest.fn() }));

const originalProfile = useHomeStore.getState().profile;
beforeEach(() => { useHomeStore.setState({ profile: { ...originalProfile, tempUnit: 'C' } }); });
afterEach(() => { useHomeStore.setState({ profile: originalProfile }); jest.restoreAllMocks(); });

/** Render actual projections while retaining observable, isolated command dispatch. */
function setup(kind: WaterDeviceKind = 'water-heater', compact = false, fontScale = 1) {
  const device = getDevice(`utility-${kind}`)!;
  const state = createDefaultSimulationSnapshot().deviceStates[device.id];
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const props = { device, state, client, compact, fontScale, disabled: false, onMore: jest.fn() };
  return { screen: render(<WaterController {...props} />), props, client };
}

/** Inspect a deferred callback before Pressable translates it for the host platform. */
function forwardedPress(screen: ReturnType<typeof render>, label: string): () => void {
  const node = screen.UNSAFE_root.findAll((candidate: { props: Record<string, unknown> }) =>
    candidate.props.accessibilityLabel === label && Object.hasOwn(candidate.props, 'onPress'))[0];
  if (!node) throw new Error(`Missing controller press: ${label}`);
  return node.props.onPress;
}

/** Keep saved-state readiness, access gating and keyed inspector navigation real. */
function renderInspector(kind: WaterDeviceKind = 'water-heater') {
  const client = { toggle: jest.fn(), setSetting: jest.fn(), runAction: jest.fn(), setLevel: jest.fn(), setPower: jest.fn() };
  const snapshot: ControlSnapshot = { state: createDefaultSimulationSnapshot(), status: 'saved', ready: true, access: FULL_SCENE_ACCESS };
  const props = { deviceId: `utility-${kind}`, client, snapshot, motionAllowed: false, onClose: jest.fn(), onSelect: jest.fn() };
  return { screen: render(<DeviceControlsSheet {...props} />), props, client };
}

test.each(['water', 'water-heater'] as const)('%s retains full touch targets and contained scrolling at compact and large text sizes', (kind) => {
  const { screen, props } = setup(kind);
  for (const [compact, fontScale] of [[false, 1], [true, 1], [true, 1.8]] as const) {
    screen.rerender(<WaterController {...props} compact={compact} fontScale={fontScale} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.queryAllByRole('radio'), ...screen.queryAllByRole('switch')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.bounces).toBe(false);
    expect(scroll.props.overScrollMode).toBe('never');
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(screen.getByTestId(`water-preview-${kind}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByLabelText('Next controls page')).toBeNull();
  }
});

test('heater target steps resolve relatively while mode and recirculation preserve the accepted power state', () => {
  const { screen, props, client } = setup();
  const state: DeviceState = { ...props.state, on: false, settings: { ...props.state.settings, tempC: 52, heaterMode: 'eco', recirculation: true } };
  screen.rerender(<WaterController {...props} state={state} />);
  expect(screen.getByText('Off · settings remembered')).toBeTruthy();
  expect(screen.getByText('Saved preferences · No heating simulation')).toBeTruthy();
  for (const [label, action] of [
    ['Increase water target temperature', 'water-heater-temperature-up'],
    ['Decrease water target temperature', 'water-heater-temperature-down'],
  ]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['utility-water-heater', action], ['utility-water-heater', action]]);
  }
  for (const option of WATER_HEATER_MODE_OPTIONS) {
    fireEvent.press(screen.getByRole('radio', { name: `Water heater mode: ${option.label}` }));
    expect(client.setSetting).toHaveBeenLastCalledWith('utility-water-heater', 'heaterMode', option.value);
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Recirculation preference' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('utility-water-heater', 'recirculation', false);
  expect(screen.getByRole('radio', { name: 'Water heater mode: Eco' }).props.accessibilityState.checked).toBe(true);
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setPower).not.toHaveBeenCalled();
  expect(client.setLevel).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('switch', { name: 'Water heater power' }));
  expect(client.toggle).toHaveBeenCalledWith('utility-water-heater');
  expect(screen.getByRole('switch', { name: 'Water heater power' }).props.accessibilityState.checked).toBe(false);
});

test.each([[40, 'Decrease'], [70, 'Increase']] as const)('heater disables %s target boundary without dropping remembered settings', (tempC, direction) => {
  const { screen, props, client } = setup();
  screen.rerender(<WaterController {...props} state={{ ...props.state, on: false, settings: { tempC, heaterMode: 'vacation', recirculation: false } }} />);
  const button = screen.getByLabelText(`${direction} water target temperature`);
  expect(button.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(button);
  expect(client.runAction).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: 'Water heater mode: Vacation' }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole('switch', { name: 'Recirculation preference' }).props.accessibilityState.checked).toBe(false);
});

test('Fahrenheit changes both water temperature presentations without changing canonical Celsius commands', () => {
  const { screen, props, client } = setup();
  act(() => { useHomeStore.setState({ profile: { ...originalProfile, tempUnit: 'F' } }); });
  expect(screen.getByLabelText('Target temperature: 126 °F')).toBeTruthy();
  expect(screen.getByText('1.8°F steps')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Increase water target temperature'));
  expect(client.runAction).toHaveBeenCalledWith('utility-water-heater', 'water-heater-temperature-up');
  const device = getDevice('utility-water')!;
  screen.rerender(<WaterController {...props} device={device} state={createDefaultSimulationSnapshot().deviceStates[device.id]} />);
  expect(screen.getByLabelText('Water temp: 64 °F')).toBeTruthy();
  expect(client.setSetting).not.toHaveBeenCalled();
});

test('meter checks only its sample and budget commands while readings and alert preferences remain independent', () => {
  const { screen, props, client } = setup('water');
  expect(screen.getByLabelText('Flow sample: 8 L/min')).toBeTruthy();
  expect(screen.getByLabelText('Today: 120 L')).toBeTruthy();
  expect(screen.getByLabelText('Pressure: 52 psi')).toBeTruthy();
  expect(screen.getByText('No leak detected · sample')).toBeTruthy();
  expect(screen.getByText('Alerts are saved preferences · No valve connected')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Check water sample'));
  expect(client.toggle).toHaveBeenCalledWith('utility-water');
  expect(client.setPower).not.toHaveBeenCalled();
  for (const [label, action] of [['Increase water budget', 'water-budget-up'], ['Decrease water budget', 'water-budget-down']]) {
    fireEvent.press(screen.getByLabelText(label));
    fireEvent.press(screen.getByLabelText(label));
    expect(client.runAction.mock.calls.slice(-2)).toEqual([['utility-water', action], ['utility-water', action]]);
  }
  fireEvent.press(screen.getByRole('switch', { name: 'Leak alerts' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('utility-water', 'waterLeakAlerts', false);
  fireEvent.press(screen.getByRole('switch', { name: 'Pressure alerts' }));
  expect(client.setSetting).toHaveBeenLastCalledWith('utility-water', 'waterPressureAlerts', false);
  expect(screen.getByRole('switch', { name: 'Leak alerts' }).props.accessibilityState.checked).toBe(true);
  screen.rerender(<WaterController {...props} state={{ ...props.state, settings: { ...props.state.settings, sampleChecked: true, waterLpm: 0 } }} />);
  expect(screen.getByText('Sample checked')).toBeTruthy();
  expect(screen.getByLabelText('Flow sample: 0 L/min')).toBeTruthy();
  expect(screen.queryByLabelText(/valve.*(?:close|open)/i)).toBeNull();
});

test.each([[100, 'Decrease'], [400, 'Increase']] as const)('meter disables the %s budget boundary', (waterBudgetL, direction) => {
  const { screen, props, client } = setup('water');
  screen.rerender(<WaterController {...props} state={{ ...props.state, settings: { ...props.state.settings, waterBudgetL } }} />);
  expect(screen.getByLabelText(`${direction} water budget`).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText(`${direction} water budget`));
  expect(client.runAction).not.toHaveBeenCalled();
});

test('detected or unknown leak samples never display a normal leak state, even with alerts disabled', () => {
  const { screen, props } = setup('water');
  screen.rerender(<WaterController {...props} state={{ ...props.state, settings: { waterLeakDetected: true, waterLeakAlerts: false } }} />);
  expect(screen.getAllByText('Leak detected · sample')).toHaveLength(1);
  expect(screen.queryByText('No leak detected · sample')).toBeNull();
  screen.rerender(<WaterController {...props} state={{ ...props.state, settings: {
    waterLeakDetected: 'unknown', waterLpm: Number.NaN, waterPressurePsi: Number.POSITIVE_INFINITY, waterTodayL: -2, waterTempC: 'invalid',
  } }} />);
  expect(screen.getAllByText('Leak status unavailable')).toHaveLength(1);
  expect(screen.queryByText('No leak detected · sample')).toBeNull();
  for (const label of ['Today', 'Pressure', 'Water temp']) expect(screen.getByLabelText(`${label}: Unavailable`)).toBeTruthy();
  expect(screen.queryByText('NaN')).toBeNull();
  expect(screen.queryByText('Infinity')).toBeNull();
});

test.each(['water', 'water-heater'] as const)('%s read-only state disables every write but retains More navigation', (kind) => {
  const { screen, props, client } = setup(kind);
  screen.rerender(<WaterController {...props} disabled />);
  for (const control of [...screen.getAllByRole('button'), ...screen.queryAllByRole('radio'), ...screen.queryAllByRole('switch')]) {
    if (control.props.accessibilityLabel === 'More water controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.setSetting).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More water controls'));
  expect(props.onMore).toHaveBeenCalledTimes(1);
});

test.each([
  ['water-heater', 'Increase water target temperature', 'runAction'],
  ['water', 'Check water sample', 'toggle'],
] as const)('a deferred %s callback rechecks current home access', (kind, label, method) => {
  const original = useHomeStore.getState();
  useHomeStore.setState({ accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Person', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'utility-room', name: 'Utility', modelRoomId: 'utility' }],
    devices: [{ id: 'saved-water', modelDeviceId: `utility-${kind}`, name: 'Water device', roomId: 'utility-room', kind, isOn: true }],
    memberPermissionOverrides: [], realtime: { ...original.realtime, enabled: false, useMqtt: false },
  });
  const client = new SimulationControlClient();
  const dispatch = jest.spyOn(client, method).mockImplementation(() => undefined);
  const alert = jest.spyOn(AppFeedback, 'alert').mockImplementation(() => undefined);
  const screen = render(<WaterController device={getDevice(`utility-${kind}`)!} state={{ on: true, level: 55 }} client={guardModelDeviceControls(client)}
    disabled={false} compact fontScale={1} onMore={jest.fn()} />);
  try {
    fireEvent.press(screen.getByLabelText(label));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const deferred = forwardedPress(screen, label);
    act(() => { useHomeStore.setState({ membershipReady: false }); deferred(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Controls unavailable', expect.any(String));
  } finally { screen.unmount(); useHomeStore.setState(original, true); }
});

test('More retains original settings and device changes reset the correct sculpted controller', () => {
  const { screen, props } = renderInspector();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  fireEvent.press(screen.getByLabelText('More water controls'));
  for (const tab of ['Controls', 'Modes', 'Routines', 'Status']) expect(screen.getByLabelText(tab)).toBeTruthy();
  expect(screen.getByLabelText('Temp')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Back to water controller'));
  expect(screen.getByTestId('water-tactile-controller')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('More water controls'));
  for (const [id, more, back, marker] of [
    ['utility-water', 'More water controls', 'Back to water controller', 'water-tactile-controller'],
    ['entry-gate', 'More gate controls', 'Back to gate controller', 'gate-tactile-controller'],
    ['utility-battery', 'More energy controls', 'Back to energy controller', 'energy-tactile-controller'],
    ['utility-water-heater', 'More water controls', 'Back to water controller', 'water-tactile-controller'],
  ]) {
    screen.rerender(<DeviceControlsSheet {...props} deviceId={id} />);
    expect(screen.getByTestId(marker)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(more));
    fireEvent.press(screen.getByLabelText(back));
    expect(screen.getByTestId(marker)).toBeTruthy();
  }
});

test.each(['water', 'water-heater'] as const)('%s unread state and revoked view/control grants do not reveal writable defaults', async (kind) => {
  const { screen, props, client } = renderInspector(kind);
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, ready: false, status: 'corrupt' }} />);
  expect(screen.queryByTestId('water-tactile-controller')).toBeNull();
  screen.rerender(<DeviceControlsSheet {...props} snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } }} />);
  fireEvent.press(screen.getByLabelText(kind === 'water' ? 'Check water sample' : 'Increase water target temperature'));
  expect(client.toggle).not.toHaveBeenCalled();
  expect(client.runAction).not.toHaveBeenCalled();
  await act(async () => { screen.rerender(<DeviceControlsSheet {...props} allowedDeviceIds={[props.deviceId]}
    snapshot={{ ...props.snapshot, access: { ...FULL_SCENE_ACCESS, deviceIds: [], controllableDeviceIds: [] } }} />); });
  expect(screen.queryByTestId('water-tactile-controller')).toBeNull();
});
