import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { LightingConsole } from '../LightingConsole';
import type { LightingConsoleCapabilities, LightingConsoleModel } from '../lightingConsoleModel';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));

const FULL_CAPABILITIES: LightingConsoleCapabilities = {
  power: true, brightness: { min: 0, max: 100, step: 5 }, temperature: { min: 2000, max: 6500 }, color: true,
};
const SWITCH_CAPABILITIES: LightingConsoleCapabilities = { power: true, brightness: null, temperature: null, color: false };

/** Exercise the shared view using observable intents without a simulation client or device registry. */
function setup(overrides: Partial<LightingConsoleModel> = {}, disabled = false, fontScale = 1) {
  const model: LightingConsoleModel = {
    on: true, brightness: 50, colorMode: 'temperature', color: '#B69CFF', temperatureK: 3000, manual: true,
    previewColor: '#FFF3D0', previewBrightness: 50, status: 'Observed on', feedback: 'Last observed state',
    capabilities: FULL_CAPABILITIES, ...overrides,
  };
  const actions = { toggle: jest.fn(), adjustBrightness: jest.fn(), setMode: jest.fn(), setTemperature: jest.fn(), setColor: jest.fn() };
  const props = { model, actions, disabled, fontScale, compact: true };
  return { screen: render(<LightingConsole {...props} />), props, actions };
}

/** Inspect SVG opacity before React Native folds the forwarded artwork props into native attributes. */
function emission(screen: ReturnType<typeof render>): unknown {
  return screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) =>
    node.props.testID === 'lighting-preview-emission' && Object.hasOwn(node.props, 'opacity'))[0].props.opacity;
}

test('switch-only capability exposes power state without invented brightness, modes or presets', () => {
  const { screen, props, actions } = setup({ capabilities: SWITCH_CAPABILITIES, brightness: null, previewBrightness: 100 });
  expect(screen.getByText('On')).toBeTruthy();
  expect(screen.getByLabelText('Light on')).toBeTruthy();
  expect(screen.queryByText('100%')).toBeNull();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  expect(screen.queryByLabelText('Light mode')).toBeNull();
  expect(screen.queryByLabelText('White temperature presets')).toBeNull();
  expect(screen.queryByLabelText('Light color presets')).toBeNull();
  fireEvent.press(screen.getByLabelText('Turn light off'));
  expect(actions.toggle).toHaveBeenCalledTimes(1);
  expect(emission(screen)).toBe(1);
  screen.rerender(<LightingConsole {...props} model={{ ...props.model, on: false, status: 'Observed off' }} />);
  expect(screen.getByText('Off')).toBeTruthy();
  expect(screen.getByLabelText('Light off')).toBeTruthy();
  expect(emission(screen)).toBe(0);
  const placeholder = StyleSheet.flatten(screen.getByTestId('lighting-more-placeholder').props.style);
  expect(placeholder.width).toBe(44);
  expect(placeholder.height).toBe(44);
});

test('dimming-only capability uses its explicit step and bounds while presets and mode controls remain absent', () => {
  const capabilities = { ...SWITCH_CAPABILITIES, brightness: { min: 10, max: 90, step: 10 } };
  const { screen, props, actions } = setup({ capabilities, on: false });
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  fireEvent.press(screen.getByLabelText('Dim light by 10 percent'));
  fireEvent.press(screen.getByLabelText('Brighten light by 10 percent'));
  expect(actions.adjustBrightness.mock.calls).toEqual([[-1], [1]]);
  expect(actions.toggle).not.toHaveBeenCalled();
  for (const [brightness, label] of [[10, 'Dim light by 10 percent'], [90, 'Brighten light by 10 percent']] as const) {
    screen.rerender(<LightingConsole {...props} model={{ ...props.model, brightness }} />);
    expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText(label));
  }
  expect(actions.adjustBrightness).toHaveBeenCalledTimes(2);
});

test('white-only capabilities filter presets by inclusive supported range and omit a redundant mode selector', () => {
  const capabilities = { ...SWITCH_CAPABILITIES, temperature: { min: 3000, max: 4000 } };
  const { screen, props, actions } = setup({ capabilities, colorMode: null });
  expect(screen.queryByLabelText('Light mode')).toBeNull();
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(screen.queryByLabelText('Warm white: 2400 kelvin')).toBeNull();
  expect(screen.queryByLabelText('Daylight white: 5200 kelvin')).toBeNull();
  fireEvent.press(screen.getByLabelText('Soft white: 3000 kelvin'));
  fireEvent.press(screen.getByLabelText('Neutral white: 4000 kelvin'));
  expect(actions.setTemperature.mock.calls).toEqual([[3000], [4000]]);
  screen.rerender(<LightingConsole {...props} model={{ ...props.model,
    capabilities: { ...capabilities, temperature: { min: 3100, max: 3900 } } }} />);
  expect(screen.queryByLabelText('White temperature presets')).toBeNull();
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
});

test('color-only capabilities expose color presets without unsupported white or mode actions', () => {
  const { screen, actions } = setup({ capabilities: { ...SWITCH_CAPABILITIES, color: true }, colorMode: null });
  expect(screen.queryByLabelText('Light mode')).toBeNull();
  expect(screen.queryByLabelText('White temperature presets')).toBeNull();
  fireEvent.press(screen.getByLabelText('Lavender light color'));
  expect(actions.setColor).toHaveBeenCalledWith('#B69CFF');
  expect(actions.setMode).not.toHaveBeenCalled();
});

test('unknown power stays unavailable and unlit even if the adapter supplies positive preview brightness', () => {
  const { screen, actions } = setup({ on: null, previewBrightness: 80 });
  expect(screen.getByLabelText('Brightness 50 percent. Light unavailable')).toBeTruthy();
  expect(screen.getByText('BRIGHTNESS · POWER UNAVAILABLE')).toBeTruthy();
  const power = screen.getByLabelText('Light power unavailable');
  expect(power.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(power);
  expect(actions.toggle).not.toHaveBeenCalled();
  expect(emission(screen)).toBe(0);
});

test.each([null, Number.NaN, -1, 101])('unknown or invalid brightness %s disables dependent steps without claiming observed output', (brightness) => {
  const { screen, actions } = setup({ brightness, previewBrightness: 80 });
  expect(screen.getByLabelText('Brightness unavailable. Light on')).toBeTruthy();
  expect(screen.getByText('BRIGHTNESS · UNAVAILABLE')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  for (const label of ['Dim light by 5 percent', 'Brighten light by 5 percent']) {
    expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText(label));
  }
  expect(actions.adjustBrightness).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Turn light off').props.accessibilityState.disabled).toBe(false);
  expect(emission(screen)).toBe(0);
});

test('unsupported power is omitted while reported brightness and supported actions remain available', () => {
  const { screen, actions } = setup({ capabilities: { ...FULL_CAPABILITIES, power: false } });
  expect(screen.queryByLabelText('Turn light off')).toBeNull();
  expect(screen.getByTestId('lighting-power-placeholder')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Dim light by 5 percent'));
  expect(actions.adjustBrightness).toHaveBeenCalledWith(-1);
  expect(actions.toggle).not.toHaveBeenCalled();
});

test('read-only view disables every command while preserving adapter feedback and optional More navigation', () => {
  const { screen, props, actions } = setup({ feedback: 'View only · Controls unavailable' }, true);
  const onMore = jest.fn();
  screen.rerender(<LightingConsole {...props} onMore={onMore} />);
  expect(screen.getByText('View only · Controls unavailable')).toBeTruthy();
  for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
    if (control.props.accessibilityLabel === 'More lighting controls') continue;
    expect(control.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(control);
  }
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('More lighting controls'));
  expect(onMore).toHaveBeenCalledTimes(1);
});

test.each([1, 1.8])('all supported controls retain 44pt targets and contained touch scrolling at font scale %s', (fontScale) => {
  const { screen, props } = setup({}, false, fontScale);
  for (const colorMode of ['temperature', 'color'] as const) {
    screen.rerender(<LightingConsole {...props} model={{ ...props.model, colorMode }} />);
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  }
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
});
