import React from 'react';
import { render } from '@testing-library/react-native';
import AssistantSceneChanges from './AssistantSceneChanges';
import type { AssistantDevice } from './assistantContext';

const climate: AssistantDevice = {
  id: 'climate', modelDeviceId: 'primary-ac', name: 'Air conditioning', roomId: 'suite', roomName: 'Primary suite',
  kind: 'ac', controllable: true, values: { isOn: true, tempC: 25 },
};

test('shows only proposed fields with the chosen temperature unit and exact captured baseline', () => {
  const screen = render(<AssistantSceneChanges fahrenheit devices={[climate]} scene={{ name: 'Cool', explanation: 'One target.', actions: [{ deviceId: climate.id, values: { tempC: 20 } }] }} />);
  expect(screen.getByText('77°F → 68°F')).toBeTruthy();
  expect(screen.queryByText('Power')).toBeNull();
  expect(screen.getByText('Primary suite')).toBeTruthy();
});

test('missing readings stay unknown and devices outside the permitted captured context do not appear', () => {
  const screen = render(<AssistantSceneChanges devices={[{ ...climate, values: {} }]} scene={{ name: 'Cool', explanation: 'A target.', actions: [{ deviceId: climate.id, values: { tempC: 20 } }, { deviceId: 'private', values: { isOn: true } }] }} />);
  expect(screen.getByText('Not reported → 20°C')).toBeTruthy();
  expect(screen.queryByText('Power')).toBeNull();
  expect(screen.queryByText('private')).toBeNull();
});
