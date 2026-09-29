import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useSimulationControls } from '../useSimulationControls';

jest.mock('../simulationSession', () => ({
  SimulationSession: jest.fn().mockImplementation((deliver) => ({
    handleMessage: (message: { type: string }) => {
      if (message.type === 'request') deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot',
        state: require('../../../../packages/home-scene/src/simulationBridgeProtocol').createDefaultSimulationSnapshot() });
      return true;
    },
    dispose: jest.fn(),
  })),
}));

test('creates an observable new client when controls are re-enabled', () => {
  let enabled = true;
  const { result, rerender } = renderHook(() => useSimulationControls(enabled));
  const firstClient = result.current.client;
  expect(result.current.ready).toBe(true);
  enabled = false;
  rerender(undefined);
  expect(result.current.ready).toBe(false);
  enabled = true;
  rerender(undefined);
  expect(result.current.client).not.toBe(firstClient);
  expect(result.current.ready).toBe(true);
  const previous = result.current.state.deviceStates['living-light'].on;
  act(() => result.current.client.toggle('living-light'));
  expect(result.current.state.deviceStates['living-light'].on).toBe(!previous);
});

test('keeps simulation subscriptions live through StrictMode effect replay', () => {
  const { result } = renderHook(() => useSimulationControls(), { wrapper: React.StrictMode });
  expect(result.current.ready).toBe(true);
  const previous = result.current.state.deviceStates['living-light'].on;
  act(() => result.current.client.toggle('living-light'));
  expect(result.current.state.deviceStates['living-light'].on).toBe(!previous);
});
