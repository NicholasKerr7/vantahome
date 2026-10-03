import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { getInspectorPages } from '../../../../packages/home-scene/src/deviceRoutinePages';
import { getDevice } from '../../../../packages/home-scene/src/data';
import { DeviceControlsSheet } from '../DeviceControlsSheet';
import { NativeCapabilityControl } from '../NativeCapabilityControl';
import { SimulationControlClient } from '../simulationControlClient';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('../../../components/CinematicSurface', () => require('react-native').View);
const mockOpenRoutines = jest.fn();
jest.mock('../useDeviceRoutines', () => ({ useDeviceRoutines: () => mockOpenRoutines }));

let mockDimensions = { width: 320, height: 562, fontScale: 1.6, scale: 1 };
beforeEach(() => {
  mockDimensions = { width: 320, height: 562, fontScale: 1.6, scale: 1 };
  jest.spyOn(require('react-native') as typeof import('react-native'), 'useWindowDimensions').mockImplementation(() => mockDimensions);
  mockOpenRoutines.mockClear();
});
afterEach(() => jest.restoreAllMocks());

/** Use actual shared capability rendering while keeping simulation writes observable and local. */
function renderControls(deviceId: string) {
  const client = new SimulationControlClient();
  const runAction = jest.spyOn(client, 'runAction').mockImplementation(() => undefined);
  const setSetting = jest.spyOn(client, 'setSetting').mockImplementation(() => undefined);
  const onClose = jest.fn();
  const props = { deviceId, client, snapshot: { ...client.getSnapshot(), ready: true, access: FULL_SCENE_ACCESS }, motionAllowed: false, onClose, onSelect: jest.fn() };
  const screen = render(<DeviceControlsSheet {...props} />);
  return { screen, props, runAction, setSetting, onClose };
}

/** Supply the body size after native layout reserves its header, tabs and persistent footer. */
function measure(screen: ReturnType<typeof render>, height: number, width = 278, options = false): void {
  fireEvent(screen.getByTestId(options ? 'device-option-page' : 'device-control-page'), 'layout', {
    nativeEvent: { layout: { width, height } },
  });
}

test('keeps every dense TV control reachable with one large-text control per page and no scrolling', () => {
  const { screen, runAction } = renderControls('family-tv');
  measure(screen, 130);
  const expectedPages = getInspectorPages(getDevice('family-tv')!, 3);
  const seen: string[] = [];
  for (const [group, label] of [['controls', 'Controls'], ['modes', 'Modes'], ['schedule', 'Routines'], ['status', 'Status']] as const) {
    fireEvent.press(screen.getByLabelText(label));
    let remaining = 100;
    do {
      const controls = screen.UNSAFE_queryAllByType(NativeCapabilityControl);
      expect(controls.length).toBeLessThanOrEqual(1);
      for (const control of controls) {
        const capability = control.props.capability;
        seen.push(capability.id);
        if (capability.type === 'action') {
          const action = screen.getByRole('button', { name: capability.label });
          expect(StyleSheet.flatten(action.props.style).width).toBe('100%');
          fireEvent.press(action);
          expect(runAction).toHaveBeenLastCalledWith('family-tv', capability.id);
        }
      }
      if (screen.getByLabelText('Next controls page').props.accessibilityState.disabled) break;
      fireEvent.press(screen.getByLabelText('Next controls page'));
    } while (--remaining);
    expect(remaining).toBeGreaterThan(0);
    expect(seen.filter((id) => expectedPages.some((page) => page.group === group && page.capabilities.some((capability) => capability.id === id))).length)
      .toBe(expectedPages.filter((page) => page.group === group).flatMap((page) => page.capabilities).length);
  }
  expect(new Set(seen).size).toBe(seen.length);
  expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
});

test('keeps the current capability after tablet resizing and exposes linked routine navigation', () => {
  const { screen, props } = renderControls('family-tv');
  measure(screen, 130);
  fireEvent.press(screen.getByLabelText('Next controls page'));
  fireEvent.press(screen.getByLabelText('Next controls page'));
  const selectedId = screen.UNSAFE_getByType(NativeCapabilityControl).props.capability.id;
  mockDimensions = { width: 1024, height: 768, fontScale: 1, scale: 1 };
  screen.rerender(<DeviceControlsSheet {...props} />);
  measure(screen, 400, 380);
  expect(screen.UNSAFE_getAllByType(NativeCapabilityControl).some((control) => control.props.capability.id === selectedId)).toBe(true);
  fireEvent.press(screen.getByLabelText('Routines'));
  fireEvent.press(screen.getByLabelText('View device routines'));
  expect(mockOpenRoutines).toHaveBeenCalledWith('family-tv');
  expect(screen.getByText('Runs with app open · Hub not connected.')).toBeTruthy();
});

test('pages every enum choice, retains the current choice on resize, and returns to the same field', () => {
  const { screen, setSetting, props } = renderControls('living-light');
  measure(screen, 130);
  for (let index = 0; index < 30 && !screen.queryByLabelText(/^Color:.*Choose option$/); index++) {
    fireEvent.press(screen.getByLabelText('Next controls page'));
  }
  const colorId = screen.UNSAFE_getByType(NativeCapabilityControl).props.capability.id;
  fireEvent.press(screen.getByLabelText(/^Color:.*Choose option$/));
  measure(screen, 150, 278, true);
  const choices: string[] = [];
  let remaining = 100;
  do {
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(1);
    choices.push(radios[0].findByType(Text).props.children[0]);
    if (screen.getByLabelText('Next controls page').props.accessibilityState.disabled) break;
    fireEvent.press(screen.getByLabelText('Next controls page'));
  } while (--remaining);
  expect(remaining).toBeGreaterThan(0);
  const lastChoice = choices.at(-1)!;
  expect(new Set(choices).size).toBe(choices.length);
  expect(choices.length).toBeGreaterThan(4);
  mockDimensions = { width: 834, height: 1194, fontScale: 1, scale: 1 };
  screen.rerender(<DeviceControlsSheet {...props} />);
  measure(screen, 400, 380, true);
  expect(screen.getByRole('radio', { name: new RegExp(lastChoice) })).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: new RegExp(lastChoice) }));
  expect(setSetting).toHaveBeenCalledWith('living-light', 'color', expect.any(String));
  expect(screen.UNSAFE_getAllByType(NativeCapabilityControl).some((control) => control.props.capability.id === colorId)).toBe(true);
  expect(screen.queryByTestId('device-option-page')).toBeNull();
});

test('returns to an enum field that was second on a tablet page after the phone requires single fields', () => {
  mockDimensions = { width: 834, height: 1194, fontScale: 1, scale: 1 };
  const { screen, props } = renderControls('living-light');
  measure(screen, 400, 380);
  expect(screen.UNSAFE_getAllByType(NativeCapabilityControl).length).toBeGreaterThan(1);
  fireEvent.press(screen.getByLabelText(/^Color:.*Choose option$/));
  mockDimensions = { width: 320, height: 562, fontScale: 1.6, scale: 1 };
  screen.rerender(<DeviceControlsSheet {...props} />);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  measure(screen, 130);
  expect(screen.UNSAFE_getAllByType(NativeCapabilityControl)).toHaveLength(1);
  expect(screen.getByLabelText(/^Color:.*Choose option$/)).toBeTruthy();
});
