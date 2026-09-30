import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import manifest from '../../../../packages/home-scene/src/house-manifest.json';
import { acknowledgeFireIncident, clearSimulatedFireSources, getFireIncident, resetFireIncident } from '../../../../packages/home-scene/src/fireSafetySimulation';
import type { DeviceStates } from '../../../../packages/home-scene/src/simulationTypes';
import { FireEmergencySimulation } from '../FireEmergencySimulation';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));

const sensors = manifest.devices.filter((device) => device.kind === 'smoke');
const acknowledge = jest.fn();
const clearSources = jest.fn();
const reset = jest.fn();

/** Seed known sensors so the UI exercises the real latch, acknowledgment and reset reducers. */
function incidentStates(): DeviceStates {
  return Object.fromEntries(sensors.slice(0, 2).map((sensor, index) => [sensor.id, { on: true, level: 100,
    settings: { smokeDetected: index === 0, coDetected: index === 1, fireIncidentActive: true, fireIncidentAcknowledged: false } }]));
}

/** Apply each distinct control through the shared fire core, with observable action boundaries. */
function IncidentHarness() {
  const [states, setStates] = useState(incidentStates);
  return <FireEmergencySimulation incident={getFireIncident(states)} supportSummary="Preview lights stay on. Gate: Sensor fault · movement blocked."
    actions={{ acknowledgeFire: () => { acknowledge(); setStates(acknowledgeFireIncident); },
      clearFireSources: () => { clearSources(); setStates(clearSimulatedFireSources); },
      resetFire: () => { reset(); setStates(resetFireIncident); } }} />;
}

beforeEach(() => jest.clearAllMocks());

test('shows room sources and honest simulation status without animating the emergency panel', () => {
  const screen = render(<IncidentHarness />);
  const incident = getFireIncident(incidentStates());
  expect(screen.getByText('Emergency simulation')).toBeTruthy();
  expect(screen.getByText('No emergency services contacted')).toBeTruthy();
  for (const source of incident.sources) expect(screen.getAllByText(source.roomName).length).toBeGreaterThan(0);
  expect(screen.getByText('Preview lights stay on. Gate: Sensor fault · movement blocked.')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.bounces).toBe(false);
  expect(scroll.props.overScrollMode).toBe('never');
  for (const button of screen.getAllByRole('button')) expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
});

test('acknowledges to a persistent banner without clearing the hazard or allowing reset', () => {
  const screen = render(<IncidentHarness />);
  const resetButton = screen.getByRole('button', { name: 'Reset simulation incident' });
  expect(resetButton.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(resetButton);
  expect(reset).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Acknowledge simulation' }));
  expect(acknowledge).toHaveBeenCalledTimes(1);
  expect(clearSources).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
  expect(screen.getByTestId('fire-simulation-banner')).toBeTruthy();
  expect(screen.getByText('Simulated smoke or CO is active')).toBeTruthy();
  expect(screen.getByText('No emergency services contacted')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Review emergency simulation'));
  expect(screen.getByRole('button', { name: 'Reset simulation incident' }).props.accessibilityState.disabled).toBe(true);
});

test('keeps hardware-back acknowledgement visible and requires distinct clear and reset actions', () => {
  const screen = render(<IncidentHarness />);
  act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
  expect(acknowledge).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('fire-simulation-banner')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Review emergency simulation'));
  fireEvent.press(screen.getByRole('button', { name: 'Clear simulated sources' }));
  expect(clearSources).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
  expect(screen.getByText('Sources cleared · reset available')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Reset simulation incident' }));
  expect(reset).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Emergency simulation')).toBeNull();
  expect(screen.queryByTestId('fire-simulation-banner')).toBeNull();
});

test('reopens the panel for a newly unacknowledged incident even after an earlier acknowledgement', () => {
  const actions = { acknowledgeFire: acknowledge, clearFireSources: clearSources, resetFire: reset };
  const acknowledged = getFireIncident(acknowledgeFireIncident(incidentStates()));
  const screen = render(<FireEmergencySimulation incident={acknowledged} actions={actions} supportSummary="Preview support" />);
  expect(screen.getByTestId('fire-simulation-banner')).toBeTruthy();
  screen.rerender(<FireEmergencySimulation incident={getFireIncident(incidentStates())} actions={actions} supportSummary="Preview support" />);
  expect(screen.getByRole('button', { name: 'Acknowledge simulation' })).toBeTruthy();
  expect(screen.queryByTestId('fire-simulation-banner')).toBeNull();
});
