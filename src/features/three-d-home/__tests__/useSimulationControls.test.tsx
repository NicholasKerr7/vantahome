import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useSimulationControls } from '../useSimulationControls';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';

jest.mock('../simulationSession', () => ({
  SimulationSession: jest.fn().mockImplementation((deliver) => ({
    handleMessage: (message: { type: string }) => {
      if (message.type === 'request') deliver({ channel: 'vantahome-simulation', version: 1, type: 'snapshot',
        access: require('../../../../packages/home-scene/src/sceneAccess').FULL_SCENE_ACCESS,
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


const originalState = useHomeStore.getState();

/** Start each identity transition from a stable offline owner without involving account services. */
function prepareIdentity(): void {
  useHomeStore.setState({
    accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    activeMemberId: 'preview-owner', sessionEpoch: 1,
    household: [{ id: 'preview-owner', name: 'Owner', role: 'Owner', status: 'home' }],
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
  });
}

const identityChanges: { label: string; patch: (state: HomeState) => Partial<HomeState> }[] = [
  { label: 'account identity', patch: () => ({ accountUserId: 'next-account', authenticatedUserId: 'next-account' }) },
  { label: 'household identity', patch: () => ({ accountHomeId: 'next-home', activeHomeId: 'next-home' }) },
  { label: 'current member', patch: () => ({ activeMemberId: 'other-member' }) },
  { label: 'member role', patch: (state) => ({ household: state.household.map((member) => ({ ...member, role: 'Guest' })) }) },
  { label: 'session generation', patch: (state) => ({ sessionEpoch: state.sessionEpoch + 1 }) },
  { label: 'transport mode', patch: (state) => ({ realtime: { ...state.realtime, enabled: true } }) },
];

test.each(identityChanges)('reconstructs and hydrates controls when $label changes', ({ patch }) => {
  prepareIdentity();
  const { result, unmount } = renderHook(() => useSimulationControls());
  const previousClient = result.current.client;
  const dispose = jest.spyOn(previousClient, 'dispose');
  expect(result.current.ready).toBe(true);

  act(() => { useHomeStore.setState(patch(useHomeStore.getState())); });

  expect(result.current.client).not.toBe(previousClient);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(result.current.ready).toBe(true);
  const staleSnapshot = previousClient.getSnapshot();
  act(() => previousClient.toggle('living-light'));
  expect(previousClient.getSnapshot()).toBe(staleSnapshot);
  unmount();
  useHomeStore.setState(originalState);
});

test('keeps the connection stable for device readings and same-role member metadata changes', () => {
  prepareIdentity();
  const { result, unmount } = renderHook(() => useSimulationControls());
  const client = result.current.client;
  act(() => { useHomeStore.setState((state) => ({
    household: state.household.map((member) => ({ ...member, name: 'Updated name' })),
    devices: state.devices.map((device) => ({ ...device, isOn: !device.isOn })),
  })); });
  expect(result.current.client).toBe(client);
  expect(result.current.ready).toBe(true);
  unmount();
  useHomeStore.setState(originalState);
});
