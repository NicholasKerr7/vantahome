import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import ModelHomeSync from '../ModelHomeSync';
import { SimulationControlClient } from '../simulationControlClient';
import { simulationPersistence } from '../simulationPersistence';
import { modelSimulationScope } from '../modelSceneAccess';

jest.mock('../FireEmergencySimulation', () => ({ FireEmergencySimulation: () => null }));
jest.mock('../simulationPersistence', () => {
  const actual = jest.requireActual('../simulationPersistence');
  return { ...actual, simulationPersistence: new actual.SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }) };
});
const seed = useHomeStore.getState();
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
let accountNumber = 0;

/** Let connected scene and host sessions consume hydration and queued changes. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 24; index += 1) await Promise.resolve(); });
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  const person = `clock-account-${++accountNumber}`;
  useHomeStore.setState({
    ...seed, accountUserId: person, authenticatedUserId: person, accountHomeId: 'home', activeHomeId: 'home',
    activeMemberId: person, membershipReady: true, sessionEpoch: accountNumber,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    household: [{ id: person, name: 'Owner', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }], roomMembers: [], memberPermissionOverrides: [],
    devices: [{ id: 'cloud-gate', name: 'Gate', kind: 'gate', roomId: 'grounds', modelDeviceId: 'entry-gate', simulationOnly: true, isOn: false }],
  });
});

afterEach(() => {
  useHomeStore.setState(seed);
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
});

test('one host clock advances an authenticated virtual gate while an additional scene client is connected', async () => {
  const screen = render(<ModelHomeSync />);
  const scene = new SimulationControlClient();
  try {
    scene.connect(); await settle();
    act(() => scene.setLevel('entry-gate', 100)); await settle();
    act(() => scene.setLevel('entry-gate', 0)); await settle();
    expect(scene.getSnapshot().state.deviceStates['entry-gate'].settings?.gatePhase).toBe('closing');
    act(() => jest.advanceTimersByTime(1000)); await settle();
    expect(scene.getSnapshot().state.deviceStates['entry-gate'].level).toBe(75);
    act(() => jest.advanceTimersByTime(1000)); await settle();
    expect(scene.getSnapshot().state.deviceStates['entry-gate'].level).toBe(50);
    expect(useHomeStore.getState().devices[0].isOn).toBe(false);
  } finally { screen.unmount(); scene.dispose(); }
});

test('changing accounts disconnects the old clock and cannot advance another account’s saved movement', async () => {
  const scope = modelSimulationScope(useHomeStore.getState(), false);
  const screen = render(<ModelHomeSync />);
  const scene = new SimulationControlClient();
  try {
    scene.connect(); await settle();
    act(() => scene.setLevel('entry-gate', 100)); await settle();
    act(() => scene.setLevel('entry-gate', 0)); await settle();
    act(() => jest.advanceTimersByTime(1000)); await settle();
    const before = (await simulationPersistence.load(scope)).deviceStates['entry-gate'].level;
    act(() => { useHomeStore.setState({ authenticatedUserId: 'another-account', accountUserId: 'another-account', sessionEpoch: 999 }); });
    await settle();
    act(() => jest.advanceTimersByTime(5000)); await settle();
    expect(scene.getSnapshot().ready).toBe(false);
    expect((await simulationPersistence.load(scope)).deviceStates['entry-gate'].level).toBe(before);
  } finally { screen.unmount(); scene.dispose(); }
});

test('revoking an assigned room stops its clock without changing hidden devices', async () => {
  const person = useHomeStore.getState().activeMemberId!;
  useHomeStore.setState({
    household: [{ id: person, name: 'Tenant', role: 'Tenant', status: 'home' }],
    roomMembers: [{ memberId: person, roomIds: ['grounds'] }],
    memberPermissionOverrides: [{ memberId: person, permission: 'garage.open', allowed: true }],
  });
  const scope = modelSimulationScope(useHomeStore.getState(), false);
  const screen = render(<ModelHomeSync />);
  const scene = new SimulationControlClient();
  try {
    scene.connect(); await settle();
    act(() => scene.setLevel('entry-gate', 100)); await settle();
    act(() => scene.setLevel('entry-gate', 0)); await settle();
    act(() => { useHomeStore.setState({ roomMembers: [] }); }); await settle();
    const before = await simulationPersistence.load(scope);
    act(() => jest.advanceTimersByTime(5000)); await settle();
    expect(scene.getSnapshot().access?.deviceIds).toEqual([]);
    expect(await simulationPersistence.load(scope)).toBe(before);
  } finally { screen.unmount(); scene.dispose(); }
});
